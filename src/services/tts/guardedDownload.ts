import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * RNFS.downloadFile with a stall watchdog. A plain download whose connection
 * goes quiet never settles (Kitten sat at ~20% forever); this stops the job when
 * no bytes arrive for `stallMs` and rejects with an actionable message, so the
 * sheet can show a failure + retry instead of hanging.
 */
export const DOWNLOAD_STALL_MS = 45_000;

export async function guardedDownload(opts: {
  fromUrl: string;
  toFile: string;
  onProgress?: (bytesWritten: number, contentLength: number) => void;
  stallMs?: number;
  /** Watchdog tick; only tests need a shorter one. */
  checkEveryMs?: number;
}): Promise<RNFS.DownloadResultT> {
  const stallMs = opts.stallMs ?? DOWNLOAD_STALL_MS;
  let lastActivity = Date.now();
  let lastBytes = -1;
  let stalled = false;

  const job = RNFS.downloadFile({
    fromUrl: opts.fromUrl,
    toFile: opts.toFile,
    background: false,
    discretionary: false,
    cacheable: false,
    progressInterval: 500,
    connectionTimeout: 30_000,
    readTimeout: 60_000,
    begin: () => {
      lastActivity = Date.now();
    },
    progress: res => {
      if (res.bytesWritten !== lastBytes) {
        lastBytes = res.bytesWritten;
        lastActivity = Date.now();
      }
      opts.onProgress?.(res.bytesWritten, res.contentLength || 0);
    },
  });

  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > stallMs) {
      stalled = true;
      clearInterval(watchdog);
      RNFS.stopDownload(job.jobId);
    }
  }, opts.checkEveryMs ?? 2_000);

  try {
    const result = await job.promise;
    if (stalled) {
      throw new Error('stalled');
    }
    return result;
  } catch (error) {
    if (stalled) {
      throw new Error(
        `Download stopped: no data received for ${Math.round(
          stallMs / 1000,
        )} seconds. Check your connection and try again.`,
      );
    }
    throw error;
  } finally {
    clearInterval(watchdog);
  }
}
