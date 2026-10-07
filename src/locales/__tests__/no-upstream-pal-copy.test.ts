import enData from '../en.json';
import idData from '../id.json';

/**
 * Spec Q (Build 16): user-facing copy must not use the upstream "Pal/Pals/
 * PalsHub" terminology — the product talks about Personas, Assistants,
 * Models, and BotConnector instead (spec K).
 *
 * Scope: en + id (the locales owned by this build; the other 19 fall back
 * to English for missing keys and are reworded separately). Only VALUES are
 * checked — l10n key identifiers (`palSettings`, `{{palName}}`, …) are
 * internal and stay as they are. The factual domain "palshub.ai" is a
 * website address, not a brand word, so it is allowed.
 */
const collectValues = (node: unknown, out: string[]): void => {
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(item => collectValues(item, out));
    return;
  }
  if (node && typeof node === 'object') {
    Object.values(node).forEach(value => collectValues(value, out));
  }
};

const locales: Array<[string, string[]]> = [
  ['en', [] as string[]],
  ['id', [] as string[]],
];
collectValues(enData, locales[0][1]);
collectValues(idData, locales[1][1]);

describe('spec Q: no user-facing Pal terminology', () => {
  it.each(locales)('%s has values to check', (_lang, values) => {
    expect(values.length).toBeGreaterThan(500);
  });

  it.each(locales)(
    '%s values contain no standalone Pal/Pals word',
    (_lang, values) => {
      const offenders = values.filter(value => /\bpal(s)?\b/i.test(value));
      expect(offenders).toEqual([]);
    },
  );

  it.each(locales)(
    '%s values contain no PalsHub/Palshub brand',
    (_lang, values) => {
      const offenders = values.filter(value => /PalsHub|Palshub/.test(value));
      expect(offenders).toEqual([]);
    },
  );
});
