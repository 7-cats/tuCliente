import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed';
import { balance } from '../domain/queries';

describe('seed', () => {
  it('genera datos consistentes (ningún saldo negativo)', () => {
    const db = buildSeed(new Date('2026-11-03T12:00:00'));
    expect(db.purchases.length).toBeGreaterThan(30);
    expect(db.agreements.map((a) => a.status).sort()).toEqual(['active', 'pending']);
    expect(db.promotions).toHaveLength(2);
    for (const m of db.memberships) expect(balance(db, m.customerId, m.businessId)).toBeGreaterThanOrEqual(0);
  });
});
