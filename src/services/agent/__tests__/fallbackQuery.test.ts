import {lastUserQuery, withSearchFallback} from '../fallbackQuery';

describe('lastUserQuery', () => {
  it('takes the latest user text (string or parts), collapsed and capped', () => {
    expect(
      lastUserQuery([
        {role: 'user', content: 'old'},
        {role: 'assistant', content: 'a'},
        {role: 'user', content: '  buatkan   tabel\nperkabupaten  '},
      ]),
    ).toBe('buatkan tabel perkabupaten');
    expect(
      lastUserQuery([
        {
          role: 'user',
          content: [
            {type: 'text', text: 'lihat'},
            {type: 'image_url', image_url: {url: 'x'}},
            {type: 'text', text: 'gambar'},
          ],
        },
      ]),
    ).toBe('lihat gambar');
    expect(
      lastUserQuery([{role: 'user', content: 'x'.repeat(500)}]).length,
    ).toBe(240);
    expect(lastUserQuery(undefined)).toBe('');
    expect(lastUserQuery([{role: 'assistant', content: 'hi'}])).toBe('');
  });
});

describe('withSearchFallback', () => {
  it('fills a missing web_search query and a missing deep_research list', () => {
    expect(withSearchFallback('web_search', {}, 'harga beras')).toEqual({
      query: 'harga beras',
    });
    expect(withSearchFallback('web_search', {query: '  '}, 'q')).toEqual({
      query: 'q',
    });
    expect(withSearchFallback('deep_research', {queries: []}, 'q')).toEqual({
      queries: ['q'],
    });
    expect(withSearchFallback('deep_research', {}, 'q')).toEqual({
      queries: ['q'],
    });
  });

  it('never overrides what the model gave, and ignores other tools', () => {
    expect(withSearchFallback('web_search', {query: 'x'}, 'q')).toEqual({
      query: 'x',
    });
    expect(withSearchFallback('deep_research', {queries: ['a']}, 'q')).toEqual({
      queries: ['a'],
    });
    expect(withSearchFallback('calculate', {}, 'q')).toEqual({});
    expect(withSearchFallback('web_search', {}, undefined)).toEqual({});
  });
});
