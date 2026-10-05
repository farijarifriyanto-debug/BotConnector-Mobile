import {parseBotConnectorCatalog} from '../botconnectorCatalog';

describe('parseBotConnectorCatalog', () => {
  it('indexes valid entries by id and ignores malformed ones', () => {
    const catalog = parseBotConnectorCatalog({
      models: [
        {
          id: 'agnes-3.0-flash',
          name: 'Agnes 3.0 Flash',
          capabilities: ['Vision', 3],
        },
        {name: 'no id'},
        {id: '  '},
      ],
    });
    expect(Object.keys(catalog)).toEqual(['agnes-3.0-flash']);
    expect(catalog['agnes-3.0-flash'].capabilities).toEqual(['Vision']);
  });

  it('returns an empty catalog for unexpected payloads', () => {
    expect(parseBotConnectorCatalog(null)).toEqual({});
    expect(parseBotConnectorCatalog({models: 'x'})).toEqual({});
  });
});
