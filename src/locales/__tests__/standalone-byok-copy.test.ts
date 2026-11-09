import fs from 'fs';
import path from 'path';

import enData from '../en.json';
import idData from '../id.json';

/**
 * 2.1.0 resubmission (Guideline 3.1.1, 2.0.0 rejection): the app has no
 * BotConnector account, no BotConnector Cloud and no BotConnector search
 * route. Chats go to the provider the user chose with their own key, so copy
 * must neither promise "no cloud" nor send people to BotConnector Cloud.
 *
 * en + id are rewritten here; every other locale drops these keys so the
 * merge in locales/index.ts shows the corrected English instead of a stale
 * translation of the old claim.
 */
const KEYS = [
  'settings.internetSearch.description',
  'settings.internetSearch.consentDescription',
  'models.localUnavailableOnMac',
  'about.description',
  'onboarding.screen4.body',
  'onboarding.screen4.highlight',
];

const at = (obj: unknown, keyPath: string): unknown =>
  keyPath
    .split('.')
    .reduce<any>((node, key) => (node == null ? undefined : node[key]), obj);

const STALE =
  /no cloud|tanpa cloud|botconnector cloud|cloud botconnector|botconnector model|model botconnector|botconnector first|botconnector terlebih/i;

describe('standalone BYOK copy', () => {
  for (const [name, data] of [
    ['en', enData],
    ['id', idData],
  ] as const) {
    it(`${name}: no cloud-account or BotConnector-route claims`, () => {
      for (const key of KEYS) {
        const value = at(data, key);
        expect(typeof value).toBe('string');
        expect(value as string).not.toMatch(STALE);
      }
    });

    it(`${name}: the onboarding highlight is part of the body`, () => {
      expect(at(data, 'onboarding.screen4.body') as string).toContain(
        at(data, 'onboarding.screen4.highlight') as string,
      );
    });
  }

  it('other locales do not keep stale translations of these keys', () => {
    const dir = path.join(__dirname, '..');
    const stale: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json') || file === 'en.json' || file === 'id.json') {
        continue;
      }
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const key of KEYS) {
        if (at(data, key) !== undefined) {
          stale.push(`${file}:${key}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });
});
