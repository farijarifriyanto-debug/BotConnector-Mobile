import {
  derivePaygBalanceFromCapabilities,
  derivePaygBalanceMicros,
  derivePaygState,
  derivePaygStateFromCapabilities,
  formatPaygBalance,
} from '../paygStatus';

describe('paygStatus (account fields)', () => {
  it('reports unavailable without an account or without PAYG', () => {
    expect(derivePaygState(null)).toBe('unavailable');
    expect(derivePaygState(undefined)).toBe('unavailable');
    expect(derivePaygState({has_payg: false})).toBe('unavailable');
  });

  it('separates zero, active and not-reported balances', () => {
    expect(derivePaygState({has_payg: true, available_micros: 0})).toBe('zero');
    expect(derivePaygState({has_payg: true, available_micros: 123})).toBe(
      'active',
    );
    expect(derivePaygState({has_payg: true})).toBe('unknown');
    expect(derivePaygBalanceMicros({has_payg: false})).toBeNull();
  });

  it('formats USD micros without inventing digits', () => {
    expect(formatPaygBalance(5_000_000)).toBe('$5.00');
    expect(formatPaygBalance(0)).toBe('$0.00');
    expect(formatPaygBalance(5_000)).toBe('$0.0050');
  });
});

describe('paygStatus (capabilities payg.state — server truth)', () => {
  it('reads the three contract states verbatim', () => {
    expect(derivePaygStateFromCapabilities({state: 'unavailable'})).toBe(
      'unavailable',
    );
    expect(derivePaygStateFromCapabilities({state: 'zero'})).toBe('zero');
    expect(derivePaygStateFromCapabilities({state: 'active'})).toBe('active');
  });

  it('stays silent on a missing or malformed payload instead of guessing', () => {
    expect(derivePaygStateFromCapabilities(null)).toBeUndefined();
    expect(derivePaygStateFromCapabilities(undefined)).toBeUndefined();
    expect(derivePaygStateFromCapabilities({})).toBeUndefined();
    expect(
      derivePaygStateFromCapabilities({state: 'suspended'}),
    ).toBeUndefined();
  });

  it('only reports a balance for the active state', () => {
    expect(
      derivePaygBalanceFromCapabilities({
        state: 'active',
        available_micros: 2_500_000,
      }),
    ).toBe(2_500_000);
    expect(derivePaygBalanceFromCapabilities({state: 'active'})).toBeNull();
    expect(
      derivePaygBalanceFromCapabilities({
        state: 'zero',
        available_micros: 0,
      }),
    ).toBeNull();
    expect(derivePaygBalanceFromCapabilities(null)).toBeNull();
  });
});
