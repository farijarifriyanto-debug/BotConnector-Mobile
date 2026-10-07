import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  BOTCONNECTOR_FILE_MAX_BYTES,
  BOTCONNECTOR_FILE_POLL_INITIAL_DELAY_MS,
  BOTCONNECTOR_FILE_POLL_MAX_DELAY_MS,
  BotConnectorFileStatusError,
  BotConnectorFileUploadError,
  classifyUploadFailure,
  getBotConnectorFile,
  isKnownBotConnectorFileStatus,
  isTerminalBotConnectorFileStatus,
  nextFilePollDelayMs,
  resolveFileFailureMessage,
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

  const rejectWith = async (response: {
    statusCode: number;
    body: string;
  }): Promise<any> => {
    (RNFS.uploadFiles as jest.Mock).mockImplementation(() => ({
      jobId: 2,
      promise: Promise.resolve({
        statusCode: response.statusCode,
        headers: {},
        body: response.body,
      }),
    }));
    try {
      await uploadBotConnectorFile({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        file: {
          uri: 'file:///tmp/report.pdf',
          name: 'report.pdf',
          size: 10,
          mediaType: 'application/pdf',
        },
      });
    } catch (error) {
      return error;
    }
    throw new Error('expected upload to fail');
  };

  it('flags gateway 413 rejections as too_large so the UI can localize them', async () => {
    const error = await rejectWith({
      statusCode: 413,
      body: '<html><body><h1>413 Request Entity Too Large</h1></body></html>',
    });
    expect(error).toBeInstanceOf(BotConnectorFileUploadError);
    expect(error.kind).toBe('too_large');
    expect(error.statusCode).toBe(413);
    expect(error.message).toContain('smaller file');
  });

  it('keeps the server message for JSON 413 rejections but still marks too_large', async () => {
    const error = await rejectWith({
      statusCode: 413,
      body: JSON.stringify({error: {message: 'Ukuran file melebihi 512 MB.'}}),
    });
    expect(error.kind).toBe('too_large');
    expect(error.message).toBe('Ukuran file melebihi 512 MB.');
  });

  it('classifies other non-2xx uploads as server errors', async () => {
    const error = await rejectWith({
      statusCode: 500,
      body: JSON.stringify({error: {message: 'backend exploded'}}),
    });
    expect(error.kind).toBe('server');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('backend exploded');
  });

  it('classifies a 2xx without a BotConnector file id as invalid', async () => {
    const error = await rejectWith({
      statusCode: 201,
      body: JSON.stringify({object: 'file'}),
    });
    expect(error.kind).toBe('invalid');
  });

  it('requires an API key with an auth kind', async () => {
    const error = await uploadBotConnectorFile({
      serverUrl: 'https://api.botconnector.id',
      apiKey: '   ',
      file: {
        uri: 'file:///tmp/report.pdf',
        name: 'report.pdf',
        size: 10,
        mediaType: 'application/pdf',
      },
    }).catch(e => e);
    expect(error.kind).toBe('auth');
  });

  it('treats ready/failed as terminal and knows every server status', () => {
    expect(isTerminalBotConnectorFileStatus('ready')).toBe(true);
    expect(isTerminalBotConnectorFileStatus('failed')).toBe(true);
    expect(isTerminalBotConnectorFileStatus('uploaded')).toBe(false);
    expect(isTerminalBotConnectorFileStatus('processing')).toBe(false);
    expect(isKnownBotConnectorFileStatus('uploaded')).toBe(true);
    expect(isKnownBotConnectorFileStatus('waiting_parser')).toBe(true);
    expect(isKnownBotConnectorFileStatus('archived')).toBe(false);
  });

  it('uses the contract poll cadence defaults (never tighter than 3 s)', () => {
    expect(BOTCONNECTOR_FILE_POLL_INITIAL_DELAY_MS).toBe(3000);
    expect(BOTCONNECTOR_FILE_POLL_MAX_DELAY_MS).toBe(10000);
  });

  describe('classifyUploadFailure', () => {
    it('maps 403 files_paid_access_required to paid_required', () => {
      expect(
        classifyUploadFailure(
          403,
          'files_paid_access_required',
          'Files need a paid plan',
        ),
      ).toEqual({kind: 'paid_required', message: 'Files need a paid plan'});
    });

    it('maps 415 to unsupported_type', () => {
      expect(classifyUploadFailure(415, undefined, 'bad type')).toEqual({
        kind: 'unsupported_type',
        message: 'bad type',
      });
    });

    it('maps 422 to invalid', () => {
      expect(classifyUploadFailure(422, undefined, undefined)).toEqual({
        kind: 'invalid',
        message: expect.stringContaining('422'),
      });
    });

    it('maps 401 to auth', () => {
      expect(classifyUploadFailure(401, undefined, 'expired')).toEqual({
        kind: 'auth',
        message: 'expired',
      });
    });

    it.each([502, 503, 504])('maps %s to transient', statusCode => {
      expect(classifyUploadFailure(statusCode, undefined, undefined)).toEqual({
        kind: 'transient',
        message: expect.stringContaining(String(statusCode)),
      });
    });

    it('keeps file_too_large as too_large even without a message', () => {
      const result = classifyUploadFailure(413, 'file_too_large', undefined);
      expect(result.kind).toBe('too_large');
      expect(result.message).toContain('smaller file');
    });

    it('keeps unknown non-2xx as server', () => {
      expect(classifyUploadFailure(418, undefined, undefined)).toEqual({
        kind: 'server',
        message: expect.stringContaining('418'),
      });
      expect(classifyUploadFailure(403, undefined, 'nope')).toEqual({
        kind: 'server',
        message: 'nope',
      });
    });
  });

  describe('upload wiring (status → kind)', () => {
    it('flags 403 files_paid_access_required as paid_required', async () => {
      const error = await rejectWith({
        statusCode: 403,
        body: JSON.stringify({
          error: {
            code: 'files_paid_access_required',
            message: 'Upgrade your plan',
          },
        }),
      });
      expect(error).toBeInstanceOf(BotConnectorFileUploadError);
      expect(error.kind).toBe('paid_required');
      expect(error.message).toBe('Upgrade your plan');
      expect(error.statusCode).toBe(403);
    });

    it('flags 415 as unsupported_type', async () => {
      const error = await rejectWith({
        statusCode: 415,
        body: JSON.stringify({error: {message: 'Only PDF allowed'}}),
      });
      expect(error.kind).toBe('unsupported_type');
      expect(error.message).toBe('Only PDF allowed');
    });

    it('flags 422 as invalid', async () => {
      const error = await rejectWith({
        statusCode: 422,
        body: JSON.stringify({error: {message: 'missing field'}}),
      });
      expect(error.kind).toBe('invalid');
    });

    it('flags 401 as auth', async () => {
      const error = await rejectWith({
        statusCode: 401,
        body: JSON.stringify({error: {message: 'invalid token'}}),
      });
      expect(error.kind).toBe('auth');
      expect(error.message).toBe('invalid token');
    });

    it.each([502, 503, 504])(
      'flags %s during upload as transient, not a permanent failure',
      async statusCode => {
        const error = await rejectWith({
          statusCode,
          body: JSON.stringify({error: {message: 'gateway hiccup'}}),
        });
        expect(error.kind).toBe('transient');
        expect(error.statusCode).toBe(statusCode);
      },
    );

    it('flags 413 with code file_too_large but no message as too_large', async () => {
      const error = await rejectWith({
        statusCode: 413,
        body: JSON.stringify({error: {code: 'file_too_large'}}),
      });
      expect(error.kind).toBe('too_large');
      expect(error.message).toContain('smaller file');
    });
  });

  describe('getBotConnectorFile error surfacing', () => {
    it('throws BotConnectorFileStatusError with statusCode 429 on rate limiting', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({error: {message: 'slow down'}}),
      } as any);

      const error = await getBotConnectorFile({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        fileId: 'file_bc_11111111-1111-1111-1111-111111111111',
      }).catch(e => e);

      expect(error).toBeInstanceOf(BotConnectorFileStatusError);
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('slow down');
    });

    it('surfaces poll_after_ms and the failure payload from a status response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'file_bc_11111111-1111-1111-1111-111111111111',
          object: 'file',
          bytes: 10,
          filename: 'report.pdf',
          status: 'failed',
          poll_after_ms: null,
          error: {code: 'document_rejected', message: 'encrypted PDF'},
        }),
      } as any);

      const result = await getBotConnectorFile({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        fileId: 'file_bc_11111111-1111-1111-1111-111111111111',
      });

      expect(result.poll_after_ms).toBeNull();
      expect(result.error).toEqual({
        code: 'document_rejected',
        message: 'encrypted PDF',
      });
    });
  });

  describe('nextFilePollDelayMs', () => {
    it('honors a positive server poll_after_ms', () => {
      expect(
        nextFilePollDelayMs({serverPollAfterMs: 3000, status: 'processing'}),
      ).toBe(3000);
      expect(
        nextFilePollDelayMs({
          serverPollAfterMs: 10000,
          status: 'waiting_parser',
        }),
      ).toBe(10000);
    });

    it('never polls tighter than 3000 ms even when the server asks', () => {
      expect(nextFilePollDelayMs({serverPollAfterMs: 500})).toBe(3000);
      expect(nextFilePollDelayMs({serverPollAfterMs: 0})).toBe(3000);
      expect(nextFilePollDelayMs({serverPollAfterMs: -1000})).toBe(3000);
    });

    it('falls back to defaults when the server sends null', () => {
      expect(
        nextFilePollDelayMs({
          serverPollAfterMs: null,
          status: 'waiting_parser',
        }),
      ).toBe(10000);
      expect(
        nextFilePollDelayMs({serverPollAfterMs: null, status: 'processing'}),
      ).toBe(3000);
      expect(nextFilePollDelayMs({serverPollAfterMs: undefined})).toBe(3000);
    });

    it('uses 10000 ms for waiting_parser even without a server value', () => {
      expect(nextFilePollDelayMs({status: 'waiting_parser'})).toBe(10000);
    });

    it('doubles the delay on 429 and never exceeds 60000 ms', () => {
      expect(
        nextFilePollDelayMs({
          lastStatus: 429,
          previousDelay: 3000,
          status: 'processing',
          attempt: 1,
        }),
      ).toBe(6000);
      expect(
        nextFilePollDelayMs({
          lastStatus: 429,
          previousDelay: 40000,
          status: 'processing',
          attempt: 2,
        }),
      ).toBe(60000);
      expect(
        nextFilePollDelayMs({
          lastStatus: 429,
          previousDelay: 60000,
          status: 'processing',
          attempt: 3,
        }),
      ).toBe(60000);
    });

    it('backs off gently on non-429 poll errors without breaking the floor', () => {
      expect(
        nextFilePollDelayMs({
          status: 'processing',
          attempt: 1,
          previousDelay: 3000,
        }),
      ).toBe(3500);
      expect(
        nextFilePollDelayMs({
          status: 'waiting_parser',
          attempt: 2,
          previousDelay: 10000,
        }),
      ).toBe(10000);
    });
  });

  describe('resolveFileFailureMessage', () => {
    const strings = {
      fileErrParserUnavailable: 'parser unavailable (localized)',
      fileErrDocumentRejected: 'document rejected (localized)',
      fileErrProcessingTimeout: 'processing timeout (localized)',
      fileErrNoExtractableText: 'no extractable text (localized)',
      fileErrProcessingFailed: 'processing failed (localized)',
      fileErrFileNotFound: 'file not found (localized)',
      fileProcessingError: 'file processing failed (fallback)',
    };

    it('prefers the server-provided message when present', () => {
      expect(
        resolveFileFailureMessage(
          {code: 'document_rejected', message: 'server says no'},
          strings,
        ),
      ).toBe('server says no');
    });

    it('maps known error codes to localized fallbacks', () => {
      expect(
        resolveFileFailureMessage({code: 'parser_unavailable'}, strings),
      ).toBe('parser unavailable (localized)');
      expect(
        resolveFileFailureMessage({code: 'document_rejected'}, strings),
      ).toBe('document rejected (localized)');
      expect(
        resolveFileFailureMessage({code: 'processing_timeout'}, strings),
      ).toBe('processing timeout (localized)');
      expect(
        resolveFileFailureMessage({code: 'no_extractable_text'}, strings),
      ).toBe('no extractable text (localized)');
      expect(
        resolveFileFailureMessage({code: 'processing_failed'}, strings),
      ).toBe('processing failed (localized)');
      expect(resolveFileFailureMessage({code: 'file_not_found'}, strings)).toBe(
        'file not found (localized)',
      );
    });

    it('treats a blank server message as absent', () => {
      expect(
        resolveFileFailureMessage(
          {code: 'file_not_found', message: '   '},
          strings,
        ),
      ).toBe('file not found (localized)');
    });

    it('falls back for unknown codes and missing failures', () => {
      expect(resolveFileFailureMessage({code: 'mystery'}, strings)).toBe(
        'file processing failed (fallback)',
      );
      expect(resolveFileFailureMessage(undefined, strings)).toBe(
        'file processing failed (fallback)',
      );
      expect(resolveFileFailureMessage({}, strings)).toBe(
        'file processing failed (fallback)',
      );
    });
  });
});
