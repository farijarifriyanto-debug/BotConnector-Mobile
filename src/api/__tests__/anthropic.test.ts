import {fetchAnthropicModels, streamAnthropicCompletion} from '../anthropic';
import {OpenAICompletionEngine} from '../completionEngines';
import {fetchModels} from '../openai';
import type {StreamChatParams} from '../openai';
import type {RemoteEndpoint} from '../servers';

// Mock XMLHttpRequest for streaming tests — same pattern as openai.test.ts
type XHREventHandler = (() => void) | null;

class MockXHR {
  static instances: MockXHR[] = [];
  static HEADERS_RECEIVED = 2;
  static DONE = 4;

  method = '';
  url = '';
  requestHeaders: Record<string, string> = {};
  requestBody = '';
  responseText = '';
  readyState = 0;
  status = 0;
  statusText = '';

  onreadystatechange: XHREventHandler = null;
  onprogress: XHREventHandler = null;
  onload: XHREventHandler = null;
  onerror: XHREventHandler = null;
  onabort: XHREventHandler = null;

  constructor() {
    MockXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value;
  }

  send(body?: string) {
    this.requestBody = body || '';
  }

  abort() {
    this.onabort?.();
  }

  simulateHeaders(status: number, statusText = 'OK') {
    this.readyState = 2;
    this.status = status;
    this.statusText = statusText;
    this.onreadystatechange?.();
  }

  simulateErrorResponse(status: number, body: string | object) {
    this.readyState = 2;
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.onreadystatechange?.();
    this.readyState = 4;
    this.onreadystatechange?.();
  }

  simulateProgress(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }

  simulateLoad() {
    this.readyState = 4;
    this.onload?.();
  }
}

const endpointFor = (
  overrides: Partial<RemoteEndpoint> = {},
): RemoteEndpoint => ({
  url: 'https://api.anthropic.com/v1',
  remoteModelId: 'claude-test',
  apiKey: 'sk-ant-test',
  serverType: 'Anthropic',
  ...overrides,
});

const textParams = (
  overrides: Partial<StreamChatParams> = {},
): StreamChatParams => ({
  samplers: {},
  messages: [{role: 'user', content: 'Hi'}],
  model: 'claude-test',
  ...overrides,
});

const postedBody = (xhr: MockXHR): Record<string, any> =>
  JSON.parse(xhr.requestBody);

describe('streamAnthropicCompletion', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    MockXHR.instances = [];
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  it('streams text deltas and maps usage to timings', async () => {
    const onToken = jest.fn();
    const resultPromise = streamAnthropicCompletion(
      textParams(),
      endpointFor(),
      undefined,
      onToken,
    );
    const xhr = MockXHR.instances[0];

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('https://api.anthropic.com/v1/messages');
    expect(xhr.requestHeaders).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'x-api-key': 'sk-ant-test',
        'anthropic-version': '2023-06-01',
        Authorization: 'Bearer sk-ant-test',
        Accept: 'text/event-stream',
      }),
    );
    expect(postedBody(xhr)).toEqual(
      expect.objectContaining({
        model: 'claude-test',
        stream: true,
      }),
    );

    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"content_block_stop","index":0}\n\n');
    xhr.simulateProgress(
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.text).toBe('Hello world');
    expect(result.content).toBe('Hello world');
    expect(result.stopped_eos).toBe(true);
    expect(result.timings).toEqual({prompt_n: 12, predicted_n: 5});
    expect(result.tokens_evaluated).toBe(12);
    expect(result.tokens_predicted).toBe(5);

    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({token: 'Hello', content: 'Hello'}),
    );
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({token: ' world', content: 'Hello world'}),
    );
  });

  it('lifts system messages to a top-level system string, never into messages', async () => {
    const resultPromise = streamAnthropicCompletion(
      textParams({
        messages: [
          {role: 'system', content: 'First rule'},
          {role: 'system', content: 'Second rule'},
          {role: 'user', content: 'Hi'},
        ],
      }),
      endpointFor(),
    );
    const xhr = MockXHR.instances[0];
    const body = postedBody(xhr);

    expect(body.system).toBe('First rule\n\nSecond rule');
    expect(body.messages).toEqual([{role: 'user', content: 'Hi'}]);

    xhr.simulateHeaders(200);
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();
    await resultPromise;
  });

  it('defaults max_tokens to 4096 and takes n_predict when given', async () => {
    const p1 = streamAnthropicCompletion(textParams(), endpointFor());
    expect(postedBody(MockXHR.instances[0]).max_tokens).toBe(4096);
    MockXHR.instances[0].simulateHeaders(200);
    MockXHR.instances[0].simulateProgress('data: {"type":"message_stop"}\n\n');
    MockXHR.instances[0].simulateLoad();
    await p1;

    const p2 = streamAnthropicCompletion(
      textParams({samplers: {n_predict: 2048}}),
      endpointFor(),
    );
    expect(postedBody(MockXHR.instances[1]).max_tokens).toBe(2048);
    MockXHR.instances[1].simulateHeaders(200);
    MockXHR.instances[1].simulateProgress('data: {"type":"message_stop"}\n\n');
    MockXHR.instances[1].simulateLoad();
    await p2;
  });

  it('maps a 401 JSON error body to an actionable unauthorized error', async () => {
    const resultPromise = streamAnthropicCompletion(
      textParams(),
      endpointFor(),
    );
    MockXHR.instances[0].simulateErrorResponse(401, {
      type: 'error',
      error: {type: 'authentication_error', message: 'invalid x-api-key'},
    });

    await expect(resultPromise).rejects.toThrow(
      'Unauthorized: Invalid or missing API key',
    );
  });

  it('maps a 429 JSON error body to a rate-limit message', async () => {
    const resultPromise = streamAnthropicCompletion(
      textParams(),
      endpointFor(),
    );
    MockXHR.instances[0].simulateErrorResponse(429, {
      type: 'error',
      error: {type: 'rate_limit_error', message: 'too many requests'},
    });

    await expect(resultPromise).rejects.toThrow(/Rate limit/);
  });

  it('sends tools in Anthropic shape and rebuilds a streamed tool_use call', async () => {
    const resultPromise = streamAnthropicCompletion(
      textParams({
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: {
                type: 'object',
                properties: {location: {type: 'string'}},
              },
            },
          },
        ],
        tool_choice: 'auto',
      }),
      endpointFor(),
    );
    const xhr = MockXHR.instances[0];
    const body = postedBody(xhr);

    expect(body.tools).toEqual([
      {
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: {location: {type: 'string'}},
        },
      },
    ]);
    expect(body.tool_choice).toEqual({type: 'auto'});

    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather"}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"location\\":"}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"Paris\\"}"}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"content_block_stop","index":0}\n\n');
    xhr.simulateProgress(
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":9}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.stopped_eos).toBe(true);
    expect(result.tool_calls).toEqual([
      {
        id: 'toolu_1',
        type: 'function',
        function: {name: 'get_weather', arguments: '{"location":"Paris"}'},
      },
    ]);
    expect(JSON.parse(result.tool_calls![0].function.arguments)).toEqual({
      location: 'Paris',
    });
  });

  it('maps history tool messages to tool_result blocks', async () => {
    const resultPromise = streamAnthropicCompletion(
      textParams({
        messages: [
          {role: 'user', content: 'Weather?'},
          {
            role: 'assistant',
            content: '',
            ...({
              tool_calls: [
                {
                  id: 'toolu_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"Paris"}',
                  },
                },
              ],
            } as object),
          },
          {
            role: 'tool',
            content: 'sunny',
            ...({tool_call_id: 'toolu_1'} as object),
          },
        ],
      }),
      endpointFor(),
    );
    const xhr = MockXHR.instances[0];
    const body = postedBody(xhr);

    expect(body.messages).toEqual([
      {role: 'user', content: 'Weather?'},
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'get_weather',
            input: {location: 'Paris'},
          },
        ],
      },
      {
        role: 'user',
        content: [
          {type: 'tool_result', tool_use_id: 'toolu_1', content: 'sunny'},
        ],
      },
    ]);

    xhr.simulateHeaders(200);
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();
    await resultPromise;
  });

  it('streams thinking deltas into reasoning_content and sends the thinking budget', async () => {
    const onToken = jest.fn();
    const resultPromise = streamAnthropicCompletion(
      textParams({reasoning: {enabled: true}}),
      endpointFor(),
      undefined,
      onToken,
    );
    const xhr = MockXHR.instances[0];

    // Default cap is 4096, so the 10000-token budget is shrunk to fit:
    // Anthropic rejects budget_tokens >= max_tokens.
    expect(postedBody(xhr).max_tokens).toBe(4096);
    expect(postedBody(xhr).thinking).toEqual({
      type: 'enabled',
      budget_tokens: 3072,
    });

    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me"}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" think"}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"abc"}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"content_block_stop","index":0}\n\n');
    xhr.simulateProgress(
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Answer"}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"content_block_stop","index":1}\n\n');
    xhr.simulateProgress(
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.reasoning_content).toBe('Let me think');
    expect(result.text).toBe('Answer');
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({reasoning_content: 'Let me think'}),
    );
  });

  it('inlines a local image attachment as a base64 image block', async () => {
    const RNFS = require('@dr.pogodin/react-native-fs');
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce('QUJD');

    const resultPromise = streamAnthropicCompletion(
      textParams({
        messages: [
          {
            role: 'user',
            content: [
              {type: 'text', text: 'What is this?'},
              {type: 'image_url', image_url: {url: 'file:///tmp/pic.png'}},
            ],
          },
        ],
      }),
      endpointFor(),
    );

    // Image encoding is async — let it land before reading the body.
    await new Promise(resolve => setImmediate(resolve));
    const xhr = MockXHR.instances[0];
    const body = postedBody(xhr);

    expect(body.messages[0].content).toEqual([
      {type: 'text', text: 'What is this?'},
      {
        type: 'image',
        source: {type: 'base64', media_type: 'image/png', data: 'QUJD'},
      },
    ]);

    xhr.simulateHeaders(200);
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();
    await resultPromise;
  });

  it('maps max_tokens stop to stopped_limit', async () => {
    const resultPromise = streamAnthropicCompletion(
      textParams(),
      endpointFor(),
    );
    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"cut off"}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":4096}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.text).toBe('cut off');
    expect(result.stopped_limit).toBe(1);
    expect(result.stopped_eos).toBeUndefined();
  });
});

describe('fetchAnthropicModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GETs the native models endpoint with Anthropic auth headers', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {id: 'claude-a', display_name: 'Claude A', type: 'model'},
            {id: 'claude-b', display_name: 'Claude B', type: 'model'},
          ],
          has_more: false,
        }),
    });

    const models = await fetchAnthropicModels(
      'https://api.anthropic.com/v1',
      'sk-ant-test',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models?limit=1000',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
          Authorization: 'Bearer sk-ant-test',
        }),
      }),
    );
    expect(models).toEqual([
      {id: 'claude-a', object: 'model', owned_by: 'anthropic'},
      {id: 'claude-b', object: 'model', owned_by: 'anthropic'},
    ]);
  });

  it('rejects 401 with an actionable message', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(
      fetchAnthropicModels('https://api.anthropic.com/v1', 'bad'),
    ).rejects.toThrow('Unauthorized: Invalid or missing API key');
  });
});

describe('Anthropic dispatch', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    MockXHR.instances = [];
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  it('routes an Anthropic-typed engine completion to /messages', async () => {
    const engine = new OpenAICompletionEngine(endpointFor());
    const pending = engine.completion({
      messages: [{role: 'user', content: 'Hi'}],
    } as any);

    const xhr = MockXHR.instances[0];
    expect(xhr.url).toBe('https://api.anthropic.com/v1/messages');
    expect(postedBody(xhr)).toEqual(
      expect.objectContaining({model: 'claude-test', stream: true}),
    );

    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n',
    );
    xhr.simulateProgress(
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
    );
    xhr.simulateProgress('data: {"type":"message_stop"}\n\n');
    xhr.simulateLoad();

    const result = await pending;
    expect(result.text).toBe('Hi');
  });

  it('routes fetchModels with an Anthropic server type to the native models API', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({data: [{id: 'claude-a', type: 'model'}]}),
    });

    const models = await fetchModels(
      'https://api.anthropic.com/v1',
      'sk-ant-test',
      undefined,
      'Anthropic',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models?limit=1000',
      expect.objectContaining({
        headers: expect.objectContaining({'x-api-key': 'sk-ant-test'}),
      }),
    );
    expect(models).toEqual([
      {id: 'claude-a', object: 'model', owned_by: 'anthropic'},
    ]);
  });
});

describe('Anthropic request safety', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    MockXHR.instances = [];
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  const finish = async (index: number, promise: Promise<unknown>) => {
    MockXHR.instances[index].simulateHeaders(200);
    MockXHR.instances[index].simulateProgress(
      'data: {"type":"message_stop"}\n\n',
    );
    MockXHR.instances[index].simulateLoad();
    await promise;
  };

  it('substitutes the default cap when the app default leaves tokens unlimited', async () => {
    // The app sampler default is n_predict: -1 ("unlimited"), a legal
    // llama.cpp value and an illegal Anthropic max_tokens.
    const promise = streamAnthropicCompletion(
      textParams({samplers: {n_predict: -1}}),
      endpointFor(),
    );

    expect(postedBody(MockXHR.instances[0]).max_tokens).toBe(4096);
    await finish(0, promise);
  });

  it('keeps the thinking budget below max_tokens', async () => {
    const promise = streamAnthropicCompletion(
      textParams({samplers: {n_predict: 2048}, reasoning: {enabled: true}}),
      endpointFor(),
    );

    const body = postedBody(MockXHR.instances[0]);
    expect(body.max_tokens).toBe(2048);
    expect(body.thinking).toEqual(expect.objectContaining({type: 'enabled'}));
    expect(body.thinking.budget_tokens).toBeLessThan(body.max_tokens);
    await finish(0, promise);
  });

  it('drops thinking when the cap leaves no room for a valid budget', async () => {
    const promise = streamAnthropicCompletion(
      textParams({samplers: {n_predict: 1024}, reasoning: {enabled: true}}),
      endpointFor(),
    );

    const body = postedBody(MockXHR.instances[0]);
    expect(body.max_tokens).toBe(1024);
    expect(body.thinking).toBeUndefined();
    await finish(0, promise);
  });

  it('builds the native path from a root base too', async () => {
    const promise = streamAnthropicCompletion(
      textParams(),
      endpointFor({url: 'https://api.anthropic.com'}),
    );

    expect(MockXHR.instances[0].url).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    await finish(0, promise);
  });
});
