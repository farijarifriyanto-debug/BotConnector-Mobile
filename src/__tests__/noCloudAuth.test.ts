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
