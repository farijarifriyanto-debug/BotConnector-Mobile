import * as RNFS from '@dr.pogodin/react-native-fs';

import {guardedDownload} from '../guardedDownload';

describe('guardedDownload', () => {
  beforeEach(() => {
    (RNFS.stopDownload as jest.Mock).mockClear();
  });

  it('stops a stalled download and rejects with an actionable message', async () => {
    let rejectJob: (e: Error) => void = () => undefined;
    (RNFS.downloadFile as jest.Mock).mockImplementation(() => ({
      jobId: 7,
      promise: new Promise((_resolve, reject) => {
        rejectJob = reject;
      }),
    }));
    (RNFS.stopDownload as jest.Mock).mockImplementation(() =>
      rejectJob(new Error('cancelled')),
    );

    await expect(
      guardedDownload({
        fromUrl: 'https://example.com/model.onnx',
        toFile: '/tmp/model.onnx',
        stallMs: 150,
        checkEveryMs: 25,
      }),
    ).rejects.toThrow(/no data received/);
    expect(RNFS.stopDownload).toHaveBeenCalledWith(7);
  });

  it('resolves normally when the download completes', async () => {
    (RNFS.downloadFile as jest.Mock).mockImplementation(() => ({
      jobId: 8,
      promise: Promise.resolve({statusCode: 200, bytesWritten: 10, jobId: 8}),
    }));
    await expect(
      guardedDownload({fromUrl: 'https://x/y', toFile: '/tmp/y'}),
    ).resolves.toMatchObject({statusCode: 200});
    expect(RNFS.stopDownload).not.toHaveBeenCalled();
  });
});
