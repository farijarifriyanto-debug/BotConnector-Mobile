/**
 * BYOK-only guard: after the Cloud removal, no source file may reference the
 * BotConnector account auth store. Task 12 formalizes a broader preflight
 * guard; this jest-level check fails the suite the moment an import creeps
 * back in.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry: any) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

describe('no Cloud account auth references', () => {
  it('no src file imports BotConnectorAuthStore or botConnectorAuthStore', () => {
    const needle = ['BotConnector', 'AuthStore'].join('');
    const offenders = walk(SRC).filter(file => {
      if (file === __filename) {
        return false; // the guard names the pattern it scans for
      }
      const text = fs.readFileSync(file, 'utf8');
      return text.includes(needle) || text.includes(needle.toLowerCase());
    });
    expect(offenders).toEqual([]);
  });
});

describe('no Cloud-only features (PalsHub / media / files / checkout)', () => {
  const read = (file: string) => fs.readFileSync(file, 'utf8');

  it('PalStore exposes no PalsHub members', () => {
    const palStoreSource = read(path.join(SRC, 'store', 'PalStore.ts'));
    expect(palStoreSource.includes('downloadPalsHubPal')).toBe(false);
    expect(palStoreSource.includes('palsHubService')).toBe(false);
    expect(palStoreSource.includes('PalsHubPal')).toBe(false);
  });

  it('no src file imports the PalsHub services or Cloud media/files APIs', () => {
    const needles = [
      ['services', '/pals', 'hub'].join(''),
      ['api/botconnector', 'Media'].join(''),
      ['api/botconnector', 'Files'].join(''),
      ['CheckoutFlow', 'Store'].join(''),
      ['hub', 'RunLink'].join(''),
      ['HubRun', 'SheetHost'].join(''),
      ['types/pals', 'hub'].join(''),
    ];
    const offenders = walk(SRC).filter(file => {
      if (file === __filename) {
        return false;
      }
      const text = read(file);
      return needles.some(n => text.includes(n));
    });
    expect(offenders).toEqual([]);
  });
});
