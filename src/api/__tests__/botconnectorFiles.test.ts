import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  BOTCONNECTOR_FILE_MAX_BYTES,
  getBotConnectorFile,
  uploadBotConnectorFile,
} from '../botconnectorFiles';

jest.mock('@dr.pogodin/react-native-fs', () => ({
  uploadFiles: jest.fn(),
}));

describe('BotConnector Files API', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('uploads with native progress and returns a stable BotConnector file id', async () => {
    (RNFS.uploadFiles as jest.Mock).mockImplementation(options => {
      options.begin?.({jobId: 1});
      options.progress?.({
        jobId: 1,
        totalBytesSent: 5,
        totalBytesExpectedToSend: 10,
      });
      return {
        jobId: 1,
        promise: Promise.resolve({
          statusCode: 201,
          headers: {},
          body: JSON.stringify({
            id: 'file_bc_11111111-1111-1111-1111-111111111111',
            object: 'file',
            bytes: 10,
            filename: 'report.pdf',
            media_type: 'application/pdf',
            status: 'queued',
            route: 'retrieval',
          }),
        }),
      };
    });
    const progress = jest.fn();

    const result = await uploadBotConnectorFile({
      serverUrl: 'https://api.botconnector.id/',
      apiKey: 'bc_live_test',
      file: {
        uri: 'file:///tmp/report.pdf',
        name: 'report.pdf',
        size: 10,
        mediaType: 'application/pdf',
      },
      onProgress: progress,
    });

    expect(result.id).toBe('file_bc_11111111-1111-1111-1111-111111111111');
    expect(RNFS.uploadFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        toUrl: 'https://api.botconnector.id/v1/client/files',
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer bc_live_test',
        }),
        files: [
          expect.objectContaining({
            name: 'upload',
            filename: 'report.pdf',
            filepath: '/tmp/report.pdf',
            filetype: 'application/pdf',
          }),
        ],
      }),
    );
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it('rejects a file larger than 512 MB before upload', async () => {
    await expect(
      uploadBotConnectorFile({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        file: {
          uri: 'file:///tmp/huge.pdf',
          name: 'huge.pdf',
          size: BOTCONNECTOR_FILE_MAX_BYTES + 1,
          mediaType: 'application/pdf',
        },
      }),
    ).rejects.toThrow('512 MB');
    expect(RNFS.uploadFiles).not.toHaveBeenCalled();
  });

  it('polls file status with the same API key', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'file_bc_11111111-1111-1111-1111-111111111111',
        object: 'file',
        bytes: 10,
        filename: 'report.pdf',
        status: 'ready',
        route: 'retrieval',
      }),
    } as any);

    const result = await getBotConnectorFile({
      serverUrl: 'https://api.botconnector.id',
      apiKey: 'bc_live_test',
      fileId: 'file_bc_11111111-1111-1111-1111-111111111111',
    });

    expect(result.status).toBe('ready');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.botconnector.id/v1/client/files/file_bc_11111111-1111-1111-1111-111111111111',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer bc_live_test',
        }),
      }),
    );
  });
});
