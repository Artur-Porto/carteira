import { describe, expect, it } from 'vitest';
import { tablesSchema } from '../../src/data/schemas';
import { demoTables } from '../../src/demo/demo';
import { INITIAL_SCENARIOS, INITIAL_TARGETS, bandFor, initialPolicy } from '../../src/domain/policy';
import { ASSET_CLASSES } from '../../src/domain/types';

describe('initial policy (SPEC)', () => {
  it('targets add up to 100%', () => {
    expect(ASSET_CLASSES.reduce((sum, c) => sum + INITIAL_TARGETS[c], 0)).toBe(100);
  });

  it('bands follow the 5/25 rule of the SPEC table', () => {
    const policy = initialPolicy(new Date().toISOString());
    expect(policy.bands).toEqual({
      rfPosFixada: { min: 17, max: 27 },
      rfIpcaCurta: { min: 12, max: 20 },
      rfPrefixada: { min: 6, max: 10 },
      rfIpcaLonga: { min: 13.5, max: 22.5 },
      acoesBrasil: { min: 9, max: 15 },
      fiis: { min: 6, max: 10 },
      exterior: { min: 9.75, max: 16.25 },
      cripto: { min: 2.25, max: 3.75 },
    });
    expect(bandFor(40)).toEqual({ min: 35, max: 45 });
  });

  it('scenario losses of the target allocation match the SPEC', () => {
    // Weight times shock, in hundredths of a percent, so the sum is exact.
    const loss = (id: string) => {
      const scenario = INITIAL_SCENARIOS.find(s => s.id === id)!;
      return ASSET_CLASSES.reduce((sum, c) => sum + INITIAL_TARGETS[c] * scenario.shocks[c], 0) / 100;
    };
    expect(loss('criseGlobal')).toBe(-18.38);
    expect(loss('criseLocal')).toBe(-12.02);
    expect(loss('jurosEmAlta')).toBe(-11.7);
    expect(loss('apertoGlobal')).toBe(-11.92);
    expect(loss('invernoCripto')).toBe(-2.4);
  });

  it('demo data passes the import schemas', () => {
    const result = tablesSchema.safeParse(demoTables(new Date()));
    expect(result.error?.issues ?? []).toEqual([]);
  });
});
