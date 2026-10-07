import {
  canonicalCloudModelId,
  catalogSupportsVision,
  cloudModelSupportsTools,
  describeCloudModel,
  humanizeModelId,
  isChatCatalogEntry,
  matchesModelSearch,
  sortCloudModels,
} from '../botconnectorModels';
import type {RemoteModelInfo} from '../types';

const row = (
  id: string,
  extra: Partial<RemoteModelInfo> = {},
): RemoteModelInfo => ({
  id,
  object: 'model',
  owned_by: 'BotConnector',
  ...extra,
});

const catalog = {
  'claude-sonnet-5-5': {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    displayFamily: 'Anthropic',
    category: 'chat',
    capabilities: ['Tools', 'Vision', 'Reasoning'],
  },
  'agnes-image': {id: 'agnes-image', name: 'Agnes Image', category: 'image'},
  'gpt-oss-120b': {
    id: 'gpt-oss-120b',
    category: 'chat',
    capabilities: ['Tools'],
  },
};

describe('botconnectorModels', () => {
  it('maps internal route ids to the canonical model id', () => {
    expect(
      canonicalCloudModelId(row('payg:anthropic_direct:claude-sonnet-5-5')),
    ).toBe('claude-sonnet-5-5');
    expect(
      canonicalCloudModelId(
        row('payg:x:y', {botconnector_canonical_model: 'claude-opus-5-5'}),
      ),
    ).toBe('claude-opus-5-5');
    expect(canonicalCloudModelId(row('gpt-oss-120b'))).toBe('gpt-oss-120b');
  });

  it('humanizes ids the catalog does not know', () => {
    expect(humanizeModelId('gpt-oss-120b')).toBe('GPT OSS 120B');
    expect(humanizeModelId('claude-sonnet-5-5')).toBe('Claude Sonnet 5.5');
    expect(humanizeModelId('nemotron-3-ultra-free')).toBe('Nemotron 3 Ultra');
    expect(humanizeModelId('stealth/space-bunny-alpha')).toBe(
      'Space Bunny Alpha',
    );
    expect(humanizeModelId('qwen3.8-27b')).toBe('Qwen3.8 27B');
  });

  it('describes a PAYG route with catalog name, access and badges', () => {
    const d = describeCloudModel(
      row('payg:anthropic_direct:claude-sonnet-5-5', {
        botconnector_access: 'payg',
      }),
      catalog,
      {webSearch: true},
    );
    expect(d.displayName).toBe('Claude Sonnet 5.5');
    expect(d.remoteModelId).toBe('payg:anthropic_direct:claude-sonnet-5-5');
    expect(d.access).toBe('payg');
    expect(d.badges).toEqual({
      vision: true,
      think: true,
      tools: true,
      web: true,
    });
  });

  it('lets a verified runtime capability override the catalog tag', () => {
    const d = describeCloudModel(
      row('gpt-oss-120b', {
        botconnector_access: 'free',
        botconnector_capabilities: {tools: false, reasoning: true},
      }),
      catalog,
      {webSearch: true},
    );
    expect(d.badges.tools).toBe(false);
    expect(d.badges.web).toBe(false); // web search rides on tool calling
    expect(d.badges.think).toBe(true);
  });

  it('answers vision from the catalog and stays silent when unknown', () => {
    expect(catalogSupportsVision(row('claude-sonnet-5-5'), catalog)).toBe(true);
    expect(catalogSupportsVision(row('gpt-oss-120b'), catalog)).toBe(false);
    expect(
      catalogSupportsVision(row('unknown-model'), catalog),
    ).toBeUndefined();
  });

  it('keeps only chat models in the chat picker', () => {
    expect(isChatCatalogEntry(row('agnes-image'), catalog)).toBe(false);
    expect(isChatCatalogEntry(row('claude-sonnet-5-5'), catalog)).toBe(true);
    expect(isChatCatalogEntry(row('not-in-catalog'), catalog)).toBe(true);
  });

  it('searches across all words and sorts plan models first', () => {
    expect(
      matchesModelSearch('sonnet vision', ['Claude Sonnet 5.5', 'Vision']),
    ).toBe(true);
    expect(matchesModelSearch('opus', ['Claude Sonnet 5.5'])).toBe(false);
    const sorted = sortCloudModels([
      describeCloudModel(row('b', {botconnector_access: 'payg'}), {}),
      describeCloudModel(row('a', {botconnector_access: 'free'}), {}),
      describeCloudModel(row('c', {botconnector_access: 'plan'}), {}),
    ]);
    expect(sorted.map(m => m.access)).toEqual(['plan', 'free', 'payg']);
  });

  describe('cloudModelSupportsTools (model axis, not account)', () => {
    it('prefers the verified runtime answer from /v1/models', () => {
      expect(
        cloudModelSupportsTools(
          [row('m', {botconnector_capabilities: {tools: false}})],
          'm',
          {m: {id: 'm', category: 'chat', capabilities: ['Tools']}},
        ),
      ).toBe(false);
      expect(
        cloudModelSupportsTools(
          [row('m', {botconnector_capabilities: {tools: true}})],
          'm',
          {},
        ),
      ).toBe(true);
    });

    it('falls back to the catalog tag when no verified answer exists', () => {
      expect(
        cloudModelSupportsTools(
          [row('claude-sonnet-5-5')],
          'claude-sonnet-5-5',
          catalog,
        ),
      ).toBe(true);
      expect(
        cloudModelSupportsTools([row('agnes-image')], 'agnes-image', catalog),
      ).toBeUndefined();
    });

    it('stays silent for unknown models instead of blocking', () => {
      expect(cloudModelSupportsTools(undefined, 'm', catalog)).toBeUndefined();
      expect(cloudModelSupportsTools([], 'm', catalog)).toBeUndefined();
      expect(
        cloudModelSupportsTools([row('other')], 'm', catalog),
      ).toBeUndefined();
    });

    it('maps payg route ids before catalog lookup', () => {
      expect(
        cloudModelSupportsTools(
          [row('payg:anthropic_direct:claude-sonnet-5-5')],
          'payg:anthropic_direct:claude-sonnet-5-5',
          catalog,
        ),
      ).toBe(true);
    });
  });
});
