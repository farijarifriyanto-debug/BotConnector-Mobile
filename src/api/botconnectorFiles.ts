import * as RNFS from '@dr.pogodin/react-native-fs';

import {normalizeUrl} from './http';

export const BOTCONNECTOR_FILE_MAX_BYTES = 512 * 1024 * 1024;
export const BOTCONNECTOR_FILE_MAX_COUNT = 10;
export const BOTCONNECTOR_FILE_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

// Server-side parsing/OCR of large files legitimately takes minutes. Poll
// until this deadline, then fail with a clear retryable state instead of
// showing "Processing…" forever.
export const BOTCONNECTOR_FILE_POLL_DEADLINE_MS = 10 * 60 * 1000;
// Contract: never poll tighter than 3 s, wait_parser defaults to 10 s, and
// rate-limit backoff may grow up to 60 s.
export const BOTCONNECTOR_FILE_POLL_INITIAL_DELAY_MS = 3000;
export const BOTCONNECTOR_FILE_POLL_MAX_DELAY_MS = 10000;
export const BOTCONNECTOR_FILE_POLL_MAX_BACKOFF_MS = 60000;
export const BOTCONNECTOR_FILE_POLL_ERROR_LIMIT = 3;

export type BotConnectorFileStatus =
  | 'uploading'
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'waiting_parser'
  | 'ocr_required'
  | 'waiting_retrieval'
  | 'ready'
  | 'failed';

export type BotConnectorFileRoute = 'retrieval' | 'data_analysis' | 'vision';

export interface BotConnectorFile {
  id?: string;
  uri: string;
  name: string;
  size: number;
  mediaType: string;
  status: BotConnectorFileStatus;
  route?: BotConnectorFileRoute;
  parser?: string | null;
  progress: number;
  /** True when uri points at an app-cache copy created from the document picker. */
  temporary?: boolean;
  error?: string;
}

interface BotConnectorFileResponse {
  id: string;
  object: 'file';
  bytes: number;
  filename: string;
  media_type?: string;
  status: Exclude<BotConnectorFileStatus, 'uploading'>;
  route?: BotConnectorFileRoute;
  parser?: string | null;
  /** Server-hinted delay before the next status poll, in milliseconds. */
  poll_after_ms?: number | null;
  /** Present with `status: 'failed'`: machine code + human message. */
  error?: {code?: string; message?: string};
}

export type BotConnectorFileErrorKind =
  | 'auth'
  | 'too_large'
  | 'paid_required'
  | 'unsupported_type'
  | 'invalid'
  | 'transient'
  | 'server'
  | 'unknown_size';

/**
 * Upload failure carrying a machine-readable `kind` so the UI can localize
 * the explanation (especially the 413/rejected-as-too-large case) instead of
 * surfacing raw gateway/English text.
 */
export class BotConnectorFileUploadError extends Error {
  readonly kind: BotConnectorFileErrorKind;
  readonly statusCode?: number;

  constructor(
    kind: BotConnectorFileErrorKind,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    // Keep `instanceof` working under Hermes/Babel transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BotConnectorFileUploadError';
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

/**
 * Status-poll failure that exposes the HTTP status so callers can treat
 * 429 (rate limiting) as a backoff signal instead of a hard failure.
 */
export class BotConnectorFileStatusError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    // Keep `instanceof` working under Hermes/Babel transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BotConnectorFileStatusError';
    this.statusCode = statusCode;
  }
}

const GATEWAY_TOO_LARGE_MESSAGE =
  'This file is larger than the server currently accepts. Try a smaller file or split it.';

/**
 * Map an upload HTTP status + `{error: {code, message}}` payload onto a
 * machine-readable kind so the UI can localize the explanation. Pure and
 * unit-testable: the message is always the server's when it sent one.
 */
export function classifyUploadFailure(
  statusCode: number,
  errorCode?: string | null,
  message?: string | null,
): {kind: BotConnectorFileErrorKind; message: string} {
  const serverMessage = message?.trim() ? message.trim() : null;
  if (statusCode === 413 || errorCode === 'file_too_large') {
    return {
      kind: 'too_large',
      message: serverMessage ?? GATEWAY_TOO_LARGE_MESSAGE,
    };
  }
  if (statusCode === 403 && errorCode === 'files_paid_access_required') {
    return {
      kind: 'paid_required',
      message: serverMessage ?? `File upload failed (${statusCode})`,
    };
  }
  if (statusCode === 415) {
    return {
      kind: 'unsupported_type',
      message: serverMessage ?? `File upload failed (${statusCode})`,
    };
  }
  if (statusCode === 422) {
    return {
      kind: 'invalid',
      message: serverMessage ?? `File upload failed (${statusCode})`,
    };
  }
  if (statusCode === 401) {
    return {
      kind: 'auth',
      message: serverMessage ?? `File upload failed (${statusCode})`,
    };
  }
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    // Temporary disruption: the UI offers a retry, not a dead end.
    return {
      kind: 'transient',
      message: serverMessage ?? `File upload failed (${statusCode})`,
    };
  }
  return {
    kind: 'server',
    message: serverMessage ?? `File upload failed (${statusCode})`,
  };
}

export interface NextFilePollDelayInput {
  /** `poll_after_ms` from the last response (number or null). */
  serverPollAfterMs?: number | null;
  /** Current file status; `waiting_parser` defaults to the slower cadence. */
  status?: string;
  /** Consecutive poll attempts since the last success (0 = fresh). */
  attempt?: number;
  /** Delay used for the previous wait; base for backoff. */
  previousDelay?: number;
  /** HTTP status of the last attempt; 429 triggers exponential backoff. */
  lastStatus?: number;
}

/**
 * Compute the delay until the next status poll. Contract:
 * - a positive `poll_after_ms` wins (never clamped below 3000 ms),
 * - otherwise `waiting_parser` → 10000 ms, everything else → 3000 ms,
 * - a 429 doubles the previous delay up to 60000 ms,
 * - other errors creep the delay up but keep the 3000 ms floor / 10000 ms cap.
 */
export function nextFilePollDelayMs({
  serverPollAfterMs,
  status,
  attempt = 0,
  previousDelay,
  lastStatus,
}: NextFilePollDelayInput): number {
  const floor = BOTCONNECTOR_FILE_POLL_INITIAL_DELAY_MS;
  const defaultDelay =
    status === 'waiting_parser'
      ? BOTCONNECTOR_FILE_POLL_MAX_DELAY_MS
      : BOTCONNECTOR_FILE_POLL_INITIAL_DELAY_MS;
  if (lastStatus === 429) {
    const base = previousDelay ?? defaultDelay;
    return Math.min(
      Math.max(base, floor) * 2,
      BOTCONNECTOR_FILE_POLL_MAX_BACKOFF_MS,
    );
  }
  if (
    typeof serverPollAfterMs === 'number' &&
    Number.isFinite(serverPollAfterMs) &&
    serverPollAfterMs > 0
  ) {
    return Math.max(Math.round(serverPollAfterMs), floor);
  }
  if (attempt > 0) {
    const base = previousDelay ?? defaultDelay;
    return Math.min(
      Math.max(base, floor) + 500,
      BOTCONNECTOR_FILE_POLL_MAX_DELAY_MS,
    );
  }
  return defaultDelay;
}

export interface BotConnectorFileFailureStrings {
  fileErrParserUnavailable: string;
  fileErrDocumentRejected: string;
  fileErrProcessingTimeout: string;
  fileErrNoExtractableText: string;
  fileErrProcessingFailed: string;
  fileErrFileNotFound: string;
  fileProcessingError: string;
}

const FAILURE_CODE_KEYS: Record<string, keyof BotConnectorFileFailureStrings> =
  {
    parser_unavailable: 'fileErrParserUnavailable',
    document_rejected: 'fileErrDocumentRejected',
    processing_timeout: 'fileErrProcessingTimeout',
    no_extractable_text: 'fileErrNoExtractableText',
    processing_failed: 'fileErrProcessingFailed',
    file_not_found: 'fileErrFileNotFound',
  };

/**
 * Resolve the human message for a `failed` status: the server's message when
 * it sent one (safe to show), otherwise the localized fallback for its
 * `error.code`, otherwise the generic processing error.
 */
export function resolveFileFailureMessage(
  failure: {code?: string; message?: string} | null | undefined,
  strings: BotConnectorFileFailureStrings,
): string {
  const serverMessage = failure?.message?.trim();
  if (serverMessage) {
    return serverMessage;
  }
  const codeKey = failure?.code ? FAILURE_CODE_KEYS[failure.code] : undefined;
  if (codeKey) {
    return strings[codeKey];
  }
  return strings.fileProcessingError;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set<BotConnectorFileStatus>([
  'uploading',
  'uploaded',
  'queued',
  'processing',
  'waiting_parser',
  'ocr_required',
  'waiting_retrieval',
  'ready',
  'failed',
]);

/** Runtime guard: the server may add statuses the app does not know yet. */
export function isKnownBotConnectorFileStatus(
  status: string,
): status is BotConnectorFileStatus {
  return KNOWN_STATUSES.has(status);
}

/** `ready` and `failed` are terminal; every other status keeps polling. */
export function isTerminalBotConnectorFileStatus(status: string): boolean {
  return status === 'ready' || status === 'failed';
}

const filePathForUpload = (uri: string): string =>
  uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;

export async function uploadBotConnectorFile({
  serverUrl,
  apiKey,
  file,
  onProgress,
}: {
  serverUrl: string;
  apiKey: string;
  file: Pick<BotConnectorFile, 'uri' | 'name' | 'size' | 'mediaType'>;
  onProgress?: (progress: number) => void;
}): Promise<BotConnectorFileResponse> {
  if (!apiKey.trim()) {
    throw new BotConnectorFileUploadError(
      'auth',
      'BotConnector API key is required',
    );
  }
  if (!(file.size > 0)) {
    throw new BotConnectorFileUploadError(
      'unknown_size',
      'File size could not be determined',
    );
  }
  if (file.size > BOTCONNECTOR_FILE_MAX_BYTES) {
    throw new BotConnectorFileUploadError(
      'too_large',
      'File exceeds the 512 MB limit',
    );
  }

  const upload = RNFS.uploadFiles({
    toUrl: `${normalizeUrl(serverUrl)}/v1/client/files`,
    files: [
      {
        name: 'upload',
        filename: file.name,
        filepath: filePathForUpload(file.uri),
        filetype: file.mediaType || 'application/octet-stream',
      },
    ],
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    begin: () => onProgress?.(0),
    progress: event => {
      const expected = Number(event.totalBytesExpectedToSend) || file.size || 1;
      const sent = Number(event.totalBytesSent) || 0;
      onProgress?.(Math.max(0, Math.min(1, sent / expected)));
    },
  });

  const response = await upload.promise;
  let payload: any = {};
  try {
    payload = JSON.parse(response.body || '{}');
  } catch {
    // Handled by the status check below.
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const errorCode =
      typeof payload?.error?.code === 'string' ? payload.error.code : null;
    const serverMessage =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : typeof payload?.detail === 'string'
          ? payload.detail
          : null;
    const {kind, message} = classifyUploadFailure(
      response.statusCode,
      errorCode,
      serverMessage,
    );
    throw new BotConnectorFileUploadError(kind, message, response.statusCode);
  }
  if (!payload?.id || !String(payload.id).startsWith('file_bc_')) {
    throw new BotConnectorFileUploadError(
      'invalid',
      'Invalid BotConnector file response',
      response.statusCode,
    );
  }
  onProgress?.(1);
  return payload as BotConnectorFileResponse;
}

export async function getBotConnectorFile({
  serverUrl,
  apiKey,
  fileId,
}: {
  serverUrl: string;
  apiKey: string;
  fileId: string;
}): Promise<BotConnectorFileResponse> {
  const response = await fetch(
    `${normalizeUrl(serverUrl)}/v1/client/files/${encodeURIComponent(fileId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    },
  );
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BotConnectorFileStatusError(
      payload?.error?.message ||
        payload?.detail ||
        `File status failed (${response.status})`,
      response.status,
    );
  }
  return payload as BotConnectorFileResponse;
}

export const isBotConnectorFileReady = (
  file: Pick<BotConnectorFile, 'status' | 'id'>,
): boolean => file.status === 'ready' && Boolean(file.id);
