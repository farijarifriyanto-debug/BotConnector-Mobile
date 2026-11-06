import {SSEParser} from './sseParser';
import {encodeMessagesForRemote, hasLocalImageAttachment} from './openai';
import type {
  OpenAIChatMessage,
  OpenAIToolChoice,
  OpenAIToolDefinition,
  StreamChatParams,
} from './openai';
import {
  CONNECTION_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  resolveTimeout,
  versionedBaseUrl,
} from './http';
import {bodyExtras} from './servers';
import type {RemoteEndpoint} from './servers';
import type {
  CompletionResult,
  CompletionStreamData,
  CompletionTimings,
  ToolCall,
} from '../utils/completionTypes';
import type {RemoteModelInfo} from '../utils/types';

/**
 * Native Anthropic Messages API transport (`POST {base}/messages`, SSE).
 * The OpenAI-compatible layer Anthropic ships is scoped to plain chat
 * completions and explicitly not production-ready, so Claude BYOK speaks the
 * native protocol: system prompt lifted to a top-level field, `max_tokens`
 * required, tool_use/tool_result content blocks, thinking blocks, and the
 * `content_block_*`/`message_*` SSE event family.
 */

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic requires 1 <= max_tokens, and thinking needs
 * 1024 <= budget_tokens < max_tokens.
 */
const MIN_THINKING_BUDGET = 1024;
const MAX_THINKING_BUDGET = 10000;

/**
 * The app's sampler default is `n_predict: -1` ("unlimited"), which is a legal
 * llama.cpp value and an illegal Anthropic max_tokens: it reaches the wire as
 * -1 and every message 400s. Any non-positive or non-finite cap falls back to
 * the default instead.
 */
function resolveMaxTokens(requested: unknown): number {
  return typeof requested === 'number' &&
    Number.isFinite(requested) &&
    requested > 0
    ? Math.floor(requested)
    : DEFAULT_MAX_TOKENS;
}

/**
 * Keep the thinking budget strictly below max_tokens, shrinking it when the
 * user's cap is small. With no room for the 1024-token minimum the block is
 * dropped: Anthropic rejects the pair, and a wrong pair is worse than no
 * thinking at all.
 */
function fitThinkingBudget(
  thinking: unknown,
  maxTokens: number,
): Record<string, unknown> | undefined {
  if (!thinking || typeof thinking !== 'object') {
    return undefined;
  }
  const block = thinking as {type?: string; budget_tokens?: number};
  if (block.type !== 'enabled') {
    return undefined;
  }
  const requested = block.budget_tokens ?? MAX_THINKING_BUDGET;
  const budget = Math.min(requested, maxTokens - MIN_THINKING_BUDGET);
  return budget >= MIN_THINKING_BUDGET
    ? {...block, budget_tokens: budget}
    : undefined;
}

type AnthropicBlock = Record<string, any>;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicBlock[];
}

function imageBlockFromPart(part: {
  image_url?: {url?: string};
}): AnthropicBlock | null {
  const url = part.image_url?.url;
  if (!url) {
    return null;
  }
  const dataMatch = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (dataMatch) {
    return {
      type: 'image',
      source: {type: 'base64', media_type: dataMatch[1], data: dataMatch[2]},
    };
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return {type: 'image', source: {type: 'url', url}};
  }
  return null;
}

function textAndImageBlocks(parts: NonNullable<OpenAIChatMessage['content']>) {
  if (typeof parts === 'string') {
    return parts;
  }
  const blocks: AnthropicBlock[] = [];
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      blocks.push({type: 'text', text: part.text});
      continue;
    }
    if (part.type === 'image_url') {
      const block = imageBlockFromPart(part);
      if (block) {
        blocks.push(block);
      }
    }
  }
  return blocks;
}

function parseToolInput(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function asBlocks(content: string | AnthropicBlock[]): AnthropicBlock[] {
  if (typeof content === 'string') {
    return content ? [{type: 'text', text: content}] : [];
  }
  return content;
}

/**
 * OpenAI-shaped history → Anthropic messages. System messages are lifted out
 * (the API takes them as a top-level string, concatenated), assistant
 * tool_calls become tool_use blocks, role-`tool` messages become user
 * messages with tool_result blocks, and consecutive same-role messages are
 * merged — the API requires strict user/assistant alternation.
 */
function convertMessages(messages: OpenAIChatMessage[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];

  const push = (
    role: 'user' | 'assistant',
    content: string | AnthropicBlock[],
  ) => {
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content = [...asBlocks(last.content), ...asBlocks(content)];
      return;
    }
    out.push({role, content});
  };

  for (const message of messages) {
    if (message.role === 'system') {
      if (typeof message.content === 'string' && message.content) {
        systemParts.push(message.content);
      }
      continue;
    }
    if (message.role === 'tool') {
      const toolCallId = (message as {tool_call_id?: string}).tool_call_id;
      push('user', [
        {
          type: 'tool_result',
          tool_use_id: toolCallId ?? '',
          content: typeof message.content === 'string' ? message.content : '',
        },
      ]);
      continue;
    }
    if (message.role === 'assistant') {
      const toolCalls = (message as {tool_calls?: ToolCall[]}).tool_calls;
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const blocks = asBlocks(
          textAndImageBlocks(message.content ?? '') as string,
        );
        for (const call of toolCalls) {
          blocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            input: parseToolInput(call.function.arguments),
          });
        }
        push('assistant', blocks);
        continue;
      }
      push('assistant', textAndImageBlocks(message.content ?? ''));
      continue;
    }
    // user (and any unknown role treated as user)
    push('user', textAndImageBlocks(message.content ?? ''));
  }

  const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
  return {system, messages: out};
}

function mapTools(
  tools: OpenAIToolDefinition[] | undefined,
): AnthropicBlock[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map(tool => ({
    name: tool.function.name,
    ...(tool.function.description
      ? {description: tool.function.description}
      : {}),
    input_schema: tool.function.parameters ?? {type: 'object', properties: {}},
  }));
}

function mapToolChoice(
  toolChoice: OpenAIToolChoice | undefined,
): AnthropicBlock | undefined {
  if (toolChoice === undefined) {
    return undefined;
  }
  if (toolChoice === 'auto' || toolChoice === 'none') {
    return {type: toolChoice};
  }
  if (toolChoice === 'required') {
    return {type: 'any'};
  }
  return {type: 'tool', name: toolChoice.function.name};
}

/** Streamed tool_use state per content-block index (see openai.ts). */
type ToolUseAccumulator = Map<
  number,
  {id: string; name: string; argsFragments: string[]}
>;

function assembleToolCalls(acc: ToolUseAccumulator): ToolCall[] | undefined {
  if (acc.size === 0) {
    return undefined;
  }
  return Array.from(acc.entries())
    .sort(([a], [b]) => a - b)
    .map(([, entry]) => ({
      id: entry.id,
      type: 'function' as const,
      function: {name: entry.name, arguments: entry.argsFragments.join('')},
    }));
}

/** Anthropic usage counters → the app's timings vocabulary. */
function timingsFromUsage(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): CompletionTimings | undefined {
  const timings: CompletionTimings = {};
  if (inputTokens !== undefined) {
    timings.prompt_n = inputTokens;
  }
  if (outputTokens !== undefined) {
    timings.predicted_n = outputTokens;
  }
  return Object.keys(timings).length > 0 ? timings : undefined;
}

/**
 * Stream a chat completion from the Anthropic Messages API.
 * Same contract as streamChatCompletion in openai.ts.
 */
export async function streamAnthropicCompletion(
  params: StreamChatParams,
  endpoint: RemoteEndpoint,
  signal?: AbortSignal,
  onToken?: (data: CompletionStreamData) => void,
): Promise<CompletionResult> {
  const {apiKey, timeoutMs} = endpoint;
  const url = `${versionedBaseUrl(endpoint.url)}/messages`;
  const connectionTimeoutMs = resolveTimeout(timeoutMs, CONNECTION_TIMEOUT_MS);
  const idleTimeoutMs = resolveTimeout(timeoutMs, IDLE_TIMEOUT_MS);
  const encodedMessages = hasLocalImageAttachment(params.messages)
    ? await encodeMessagesForRemote(params.messages)
    : params.messages;

  const extras = bodyExtras('Anthropic', {
    samplers: params.samplers,
    reasoning: params.reasoning,
  });
  const {system, messages} = convertMessages(encodedMessages);

  const maxTokens = resolveMaxTokens(extras.max_tokens);
  const requestBody: Record<string, unknown> = {
    ...extras,
    model: params.model,
    max_tokens: maxTokens,
    messages,
    stream: true,
  };
  const thinking = fitThinkingBudget(extras.thinking, maxTokens);
  if (thinking) {
    requestBody.thinking = thinking;
  } else {
    delete requestBody.thinking;
  }
  if (system) {
    requestBody.system = system;
  }
  if (params.stop && params.stop.length > 0) {
    requestBody.stop_sequences = Array.isArray(params.stop)
      ? params.stop
      : [params.stop];
  }
  const tools = mapTools(params.tools);
  if (tools) {
    requestBody.tools = tools;
  }
  const toolChoice = mapToolChoice(params.tool_choice);
  if (toolChoice) {
    requestBody.tool_choice = toolChoice;
  }

  return new Promise<CompletionResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'anthropic-version': ANTHROPIC_VERSION,
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      headers.Authorization = `Bearer ${apiKey}`;
    }
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    const parser = new SSEParser();
    let fullContent = '';
    let fullReasoningContent = '';
    let stopReason: string | null = null;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let lastProcessedLength = 0;
    let settled = false;
    const toolAcc: ToolUseAccumulator = new Map();

    const connectionTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        xhr.abort();
        reject(new Error('Connection timed out'));
      }
    }, connectionTimeoutMs);

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          xhr.abort();
          reject(new Error('Idle timeout: no data received'));
        }
      }, idleTimeoutMs);
    };

    const onAbort = () => {
      xhr.abort();
    };
    if (signal) {
      if (signal.aborted) {
        reject(new Error('Completion aborted'));
        return;
      }
      signal.addEventListener('abort', onAbort, {once: true});
    }

    const cleanup = () => {
      clearTimeout(connectionTimer);
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    /** Fold one SSE event into the accumulated turn and emit its delta. */
    const handleEvent = (event: any) => {
      if (!event || typeof event !== 'object') {
        return;
      }
      switch (event.type) {
        case 'message_start': {
          const input = event.message?.usage?.input_tokens;
          if (typeof input === 'number') {
            inputTokens = input;
          }
          break;
        }
        case 'content_block_start': {
          const block = event.content_block;
          if (block?.type === 'tool_use' && typeof event.index === 'number') {
            toolAcc.set(event.index, {
              id: typeof block.id === 'string' ? block.id : '',
              name: typeof block.name === 'string' ? block.name : '',
              argsFragments: [],
            });
          }
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta ?? {};
          if (delta.type === 'text_delta' && delta.text) {
            fullContent += delta.text;
            onToken?.({token: delta.text, content: fullContent});
          } else if (delta.type === 'thinking_delta' && delta.thinking) {
            fullReasoningContent += delta.thinking;
            onToken?.({
              token: delta.thinking,
              reasoning_content: fullReasoningContent,
            });
          } else if (
            delta.type === 'input_json_delta' &&
            typeof event.index === 'number'
          ) {
            const entry = toolAcc.get(event.index);
            const fragment: string = delta.partial_json ?? '';
            if (entry && fragment) {
              entry.argsFragments.push(fragment);
              onToken?.({
                tool_calls: [
                  {
                    id: entry.id,
                    type: 'function',
                    function: {name: entry.name, arguments: fragment},
                  },
                ],
              });
            }
          }
          // signature_delta: thinking-block signature; nothing to render.
          break;
        }
        case 'message_delta': {
          const reason = event.delta?.stop_reason;
          if (typeof reason === 'string') {
            stopReason = reason;
          }
          const output = event.usage?.output_tokens;
          if (typeof output === 'number') {
            outputTokens = output;
          }
          break;
        }
        case 'error': {
          // Mid-stream error event: reject with the server's message.
          if (!settled) {
            settled = true;
            cleanup();
            const message =
              event.error?.message || event.error?.type || 'Stream error';
            reject(new Error(`Server error: ${message}`));
          }
          break;
        }
        default:
          break;
      }
    };

    const processChunk = (chunk: string) => {
      for (const event of parser.feed(chunk)) {
        if (event === 'done') {
          return;
        }
        resetIdleTimer();
        handleEvent(event);
        if (settled) {
          return;
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        // Headers received — clear connection timeout
        clearTimeout(connectionTimer);
        if (xhr.status === 200) {
          resetIdleTimer();
        }
        // Non-200: wait for DONE to read the (non-SSE, JSON) error body.
      }

      if (
        xhr.readyState === XMLHttpRequest.DONE &&
        xhr.status !== 200 &&
        xhr.status !== 0
      ) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();

        let detailText: string | undefined;
        try {
          const errorBody = JSON.parse(xhr.responseText);
          detailText =
            errorBody?.error?.message || errorBody?.error || undefined;
        } catch {
          if (xhr.responseText) {
            detailText = xhr.responseText.substring(0, 200);
          }
        }

        if (xhr.status === 401 || xhr.status === 403) {
          reject(new Error('Unauthorized: Invalid or missing API key'));
        } else if (xhr.status === 429) {
          const quotaText =
            'Rate limit reached — the server is limiting requests right now. Try again in a few minutes.';
          reject(
            new Error(detailText ? `${quotaText} (${detailText})` : quotaText),
          );
        } else {
          reject(
            new Error(
              detailText
                ? `Server error: ${xhr.status} — ${detailText.substring(0, 200)}`
                : `Server error: ${xhr.status}`,
            ),
          );
        }
        xhr.abort();
      }
    };

    xhr.onprogress = () => {
      if (signal?.aborted) {
        lastProcessedLength = xhr.responseText.length;
        return;
      }
      const newText = xhr.responseText.substring(lastProcessedLength);
      lastProcessedLength = xhr.responseText.length;
      if (newText) {
        processChunk(newText);
      }
    };

    xhr.onload = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      const remaining = xhr.responseText.substring(lastProcessedLength);
      if (remaining) {
        processChunk(remaining);
      }
      for (const event of parser.flush()) {
        if (event === 'done') {
          break;
        }
        handleEvent(event);
      }

      const finalToolCalls = assembleToolCalls(toolAcc);
      const timings = timingsFromUsage(inputTokens, outputTokens);

      if (signal?.aborted) {
        resolve({
          text: fullContent,
          content: fullContent,
          reasoning_content: fullReasoningContent || undefined,
          tool_calls: finalToolCalls,
          tokens_predicted: outputTokens,
          interrupted: true,
        });
        return;
      }

      const result: CompletionResult = {
        text: fullContent,
        content: fullContent,
        reasoning_content: fullReasoningContent || undefined,
        tool_calls: finalToolCalls,
        tokens_evaluated: inputTokens,
        tokens_predicted: outputTokens,
        timings,
      };

      switch (stopReason) {
        case 'end_turn':
        case 'stop_sequence':
        case 'tool_use':
          result.stopped_eos = true;
          break;
        case 'max_tokens':
          result.stopped_limit = 1;
          break;
        case 'refusal':
          result.interrupted = true;
          break;
      }

      resolve(result);
    };

    xhr.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (signal?.aborted) {
        reject(new Error('Completion aborted'));
      } else {
        reject(new Error('Network error'));
      }
    };

    xhr.onabort = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (signal?.aborted) {
        resolve({
          text: fullContent,
          content: fullContent,
          reasoning_content: fullReasoningContent || undefined,
          tokens_predicted: outputTokens,
          interrupted: true,
        });
      }
    };

    xhr.send(JSON.stringify(requestBody));
  });
}

/**
 * List models from the native Anthropic Models API.
 * GET {base}/models?limit=1000 with x-api-key + anthropic-version.
 */
export async function fetchAnthropicModels(
  url: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<RemoteModelInfo[]> {
  const modelsUrl = `${versionedBaseUrl(url)}/models?limit=1000`;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    resolveTimeout(timeoutMs, CONNECTION_TIMEOUT_MS),
  );

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized: Invalid or missing API key');
      }
      throw new Error(
        `Server error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows
      .filter((row: any) => row && typeof row.id === 'string' && row.id)
      .map((row: {id: string}) => ({
        id: row.id,
        object: 'model',
        owned_by: 'anthropic',
      }));
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Connection timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
