import {matchesModelSearch} from '../botconnectorModels';

describe('matchesModelSearch', () => {
  it('matches every query word against the joined fields', () => {
    expect(
      matchesModelSearch('sonnet vision', ['Claude Sonnet 5.5', 'Vision']),
    ).toBe(true);
    expect(matchesModelSearch('opus', ['Claude Sonnet 5.5'])).toBe(false);
  });

  it('matches everything on an empty query and skips missing fields', () => {
    expect(matchesModelSearch('', ['Anything'])).toBe(true);
    expect(matchesModelSearch('   ', [undefined])).toBe(true);
    expect(matchesModelSearch('gpt', [undefined, 'GPT OSS 120B'])).toBe(true);
  });
});
