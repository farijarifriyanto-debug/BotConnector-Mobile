import * as RNFS from '@dr.pogodin/react-native-fs';

import {normalizeUrl} from './http';

export const BOTCONNECTOR_FILE_MAX_BYTES = 512 * 1024 * 1024;
export const BOTCONNECTOR_FILE_MAX_COUNT = 10;
export const BOTCONNECTOR_FILE_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

export type BotConnectorFileStatus =
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'waiting_parser'
  | 'ocr_required'
  | 'waiting_retrieval'
  | 'ready'
  | 'failed';

export type BotConnectorFileRoute =
  | 'retrieval'
  | 'data_analysis'
  | 'vision'
  | string;

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
  error?: string;
}

interface BotConnectorFileResponse {
  id: string;
  object: 'file';
  bytes: number;
  filename: string;
  media_type?: string;
  status: Exclude<BotConnectorFileStatus, 'uploading' | 'failed'>;
  route?: BotConnectorFileRoute;
  parser?: string | null;
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
    throw new Error('BotConnector API key is required');
  }
  if (file.size > BOTCONNECTOR_FILE_MAX_BYTES) {
    throw new Error('File exceeds the 512 MB limit');
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
    throw new Error(
      payload?.error?.message ||
        payload?.detail ||
        `File upload failed (${response.statusCode})`,
    );
  }
  if (!payload?.id || !String(payload.id).startsWith('file_bc_')) {
    throw new Error('Invalid BotConnector file response');
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
    throw new Error(
      payload?.error?.message ||
        payload?.detail ||
        `File status failed (${response.status})`,
    );
  }
  return payload as BotConnectorFileResponse;
}

export const isBotConnectorFileReady = (
  file: Pick<BotConnectorFile, 'status' | 'id'>,
): boolean => file.status === 'ready' && Boolean(file.id);
