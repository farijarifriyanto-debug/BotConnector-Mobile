import {applyCitations, citationSourcesFromSteps} from '../cite';

const sources = new Map([
  [1, {url: 'https://one.example/a', title: 'One'}],
  [2, {url: 'https://two.example/b(1)', title: 'Two'}],
]);

describe('applyCitations', () => {
  it('turns valid [n] into links, splits lists and drops invented numbers', () => {
    expect(applyCitations('Fact [1]. More [1, 2] and [9].', sources)).toBe(
      'Fact [\\[1\\]](https://one.example/a). More [\\[1\\]](https://one.example/a) [\\[2\\]](https://two.example/b%281%29) and.',
    );
  });

  it('leaves code and markdown links alone', () => {
    const t = 'Use `a[1]` and\n```\nb[2]\n```\nand [1](https://x.example)';
    expect(applyCitations(t, sources)).toBe(t);
  });

  it('does nothing when there are no sources', () => {
    expect(applyCitations('Fact [1]', new Map())).toBe('Fact [1]');
  });

  it('never links a non-http source', () => {
    expect(
      applyCitations(
        'Hi [1]',
        new Map([[1, {url: `java${'script'}:alert(1)`}]]),
      ),
    ).toBe('Hi');
  });
});

describe('citationSourcesFromSteps', () => {
  it('collects numbered sources from deep_research outcomes only', () => {
    const steps = [
      {
        toolOutcomes: [
          {
            toolName: 'deep_research',
            result: {
              type: 'search',
              results: [
                {id: 1, url: 'https://a.example', title: 'A'},
                {id: 2, url: 'https://b.example', title: 'B'},
              ],
            },
          },
          {
            toolName: 'web_search',
            result: {
              type: 'search',
              results: [{id: 9, url: 'https://c.example'}],
            },
          },
        ],
      },
      {toolOutcomes: [{toolName: 'deep_research', result: {type: 'error'}}]},
      {},
    ];
    const m = citationSourcesFromSteps(steps);
    expect([...m.keys()]).toEqual([1, 2]);
    expect(m.get(2)?.url).toBe('https://b.example');
    expect(citationSourcesFromSteps(undefined).size).toBe(0);
  });
});
