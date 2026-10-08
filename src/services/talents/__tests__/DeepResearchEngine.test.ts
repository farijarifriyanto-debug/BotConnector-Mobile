import {
  DEEP_RESEARCH_LIMITS,
  DeepResearchEngine,
  normalizeUrl,
  pickPages,
  resetDeepResearchRun,
} from '../DeepResearchEngine';
import type {SearchAccess} from '../searchAccess';
import type {SearchHit, SearchProvider} from '../../search/types';

const PAGE = (t: string) => ({url: t, text: `${t} `.repeat(80)});

function setup(
  opts: {
    canSearch?: boolean;
    fail?: (q: string) => boolean;
    read?: (url: string) => Promise<{url: string; text: string}>;
  } = {},
) {
  const log = {searches: [] as string[], reads: [] as string[]};
  const provider: SearchProvider = {
    id: 'tavily',
    search: async (q): Promise<SearchHit[]> => {
      log.searches.push(q);
      if (opts.fail?.(q)) {
        throw new Error('boom');
      }
      const s = q.replace(/\W+/g, '-');
      return [
        {
          title: 'Shared',
          url: 'https://www.shared.example/a?utm_source=x#top',
          snippet: 'shared snippet '.repeat(10),
        },
        {
          title: 'A ' + q,
          url: `https://a-${s}.example/p`,
          snippet: 'snippet '.repeat(20),
        },
        {
          title: 'B ' + q,
          url: `https://b-${s}.example/p`,
          snippet: 'snippet '.repeat(20),
        },
      ];
    },
    read: async url => {
      log.reads.push(url);
      return opts.read ? opts.read(url) : PAGE(url);
    },
  };
  const access: SearchAccess = {
    getActiveProvider: () => provider,
    canSearch: () => opts.canSearch ?? true,
    getResultCount: () => 5,
    readWithDefaultReader: async url => PAGE(url),
  };
  return {engine: new DeepResearchEngine(access), log};
}

describe('DeepResearchEngine', () => {
  beforeEach(() => resetDeepResearchRun());

  it('searches in parallel, reads the best pages and returns numbered sources', async () => {
    const {engine, log} = setup();
    const r = await engine.execute({queries: ['q one', 'q two', 'q three']});
    expect(r.type).toBe('search');
    if (r.type !== 'search') {
      return;
    }
    expect(log.searches.sort()).toEqual(['q one', 'q three', 'q two']);
    expect(r.results.length).toBe(7);
    // found by all three queries, so it ranks first, with tracking parameters removed
    expect(r.results[0]).toMatchObject({
      id: 1,
      url: 'https://www.shared.example/a',
    });
    expect(r.results.map(x => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.summary).toContain(
      '<source id="1" url="https://www.shared.example/a"',
    );
    expect(r.summary).toContain('UNTRUSTED WEB CONTENT');
    expect(r.query).toBe('q one · q two · q three');
  });

  it('continues numbering across calls, never rereads a page, and respects the per-run budget', async () => {
    const {engine, log} = setup();
    await engine.execute({queries: ['one', 'two', 'three']});
    const second = await engine.execute({queries: ['one', 'four', 'five']});
    expect(second.type).toBe('search');
    if (second.type === 'search') {
      expect(second.results[0].id).toBe(8);
      expect(second.results.length).toBeLessThanOrEqual(4);
    }
    expect(new Set(log.reads).size).toBe(log.reads.length);
    const used = log.searches.length;
    expect(used).toBeLessThanOrEqual(DEEP_RESEARCH_LIMITS.searchesPerRun);
    // more queries than are left: trimmed, then refused
    await engine.execute({queries: ['six', 'seven', 'eight', 'nine', 'ten']});
    const last = await engine.execute({queries: ['eleven']});
    expect(last.type).toBe('error');
    expect(last.summary).toMatch(/budget/);
  });

  it('starts again at 1 after resetDeepResearchRun', async () => {
    const {engine} = setup();
    await engine.execute({queries: ['one']});
    resetDeepResearchRun();
    const r = await engine.execute({queries: ['one']});
    expect(r.type === 'search' && r.results[0].id).toBe(1);
  });

  it('falls back to the search snippet for pages that cannot be read and flags it', async () => {
    const {engine} = setup({
      read: async url => {
        if (url.includes('a-')) {
          throw new Error('403');
        }
        return PAGE(url);
      },
    });
    const r = await engine.execute({queries: ['x y z']});
    expect(r.summary).toContain('excerpt="search snippet only"');
    expect(r.type === 'search' && r.results.length).toBe(3);
  });

  it('keeps going when some searches fail and errors clearly when all do', async () => {
    const ok = setup({fail: q => q === 'bad'});
    expect((await ok.engine.execute({queries: ['good', 'bad']})).type).toBe(
      'search',
    );
    const allBad = setup({fail: () => true});
    const r = await allBad.engine.execute({queries: ['a b', 'c d']});
    expect(r.type).toBe('error');
    expect(r.summary).toMatch(/web search failed/);
  });

  it('refuses without search access, with no queries, and when nothing is readable', async () => {
    expect(
      (await setup({canSearch: false}).engine.execute({queries: ['abc']})).type,
    ).toBe('error');
    expect((await setup().engine.execute({queries: []})).type).toBe('error');
    expect((await setup().engine.execute({})).summary).toMatch(/queries/);
    const unreadable = setup({
      read: async () => {
        throw new Error('x');
      },
    });
    unreadable.engine = new DeepResearchEngine({
      getActiveProvider: () => ({
        id: 'tavily',
        search: async () => [
          {title: 't', url: 'https://x.example/1', snippet: 'tiny'},
        ],
        read: async () => {
          throw new Error('x');
        },
      }),
      canSearch: () => true,
      getResultCount: () => 5,
      readWithDefaultReader: async () => {
        throw new Error('x');
      },
    });
    expect(
      (await unreadable.engine.execute({queries: ['abc']})).summary,
    ).toMatch(/no readable pages/);
  });

  it('describes itself as a tool and as a prompt fragment', () => {
    const {engine} = setup();
    const t = engine.toToolDefinition();
    expect(t.function.name).toBe('deep_research');
    expect(t.function.parameters.required).toEqual(['queries']);
    const f = engine.systemPromptFragment({
      now: new Date('2026-10-08T00:00:00Z'),
      maxToolTurns: 5,
      activeTalents: new Set(['deep_research']),
    });
    expect(f).toContain('2026-10-08');
    expect(f).toContain('untrusted');
    expect(f).toContain('square brackets');
  });

  it('helpers: url normalizing and page picking (two per site, none taken)', () => {
    expect(normalizeUrl('https://x.com/a/?utm_source=t&id=2#h')).toBe(
      'https://x.com/a?id=2',
    );
    const mk = (k: string, score: number) => ({
      url: `https://${k.split('/')[0]}.com/${k.split('/')[1]}`,
      title: k,
      snippet: '',
      score,
    });
    const pool = new Map(
      [mk('a/1', 9), mk('a/2', 8), mk('a/3', 7), mk('b/1', 6)].map(h => [
        h.url,
        h,
      ]),
    );
    expect(pickPages(pool, 5, new Set()).map(h => h.title)).toEqual([
      'a/1',
      'a/2',
      'b/1',
    ]);
    expect(
      pickPages(pool, 5, new Set(['https://a.com/1'])).map(h => h.title),
    ).toEqual(['a/2', 'a/3', 'b/1']);
  });
});
