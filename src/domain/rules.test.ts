import { describe, expect, it } from 'vitest';
import { calculateStamps, stampsForRule } from './rules';
import type { StampRule } from './types';

const base = { businessId: 'b', active: true };
const tuesday = new Date('2026-11-03T12:00:00'); // martes

describe('stampsForRule', () => {
  it('min_amount: suma solo si supera el mínimo', () => {
    const r: StampRule = { ...base, id: 'r', name: '+10k', kind: 'min_amount', minAmount: 10000, stamps: 1 };
    expect(stampsForRule(r, { amount: 9999, date: tuesday })).toBe(0);
    expect(stampsForRule(r, { amount: 10000, date: tuesday })).toBe(1);
  });

  it('per_amount: un sello por tramo, con tope', () => {
    const r: StampRule = { ...base, id: 'r', name: 'cada 5k', kind: 'per_amount', stepAmount: 5000, stamps: 1, maxPerPurchase: 3 };
    expect(stampsForRule(r, { amount: 4999, date: tuesday })).toBe(0);
    expect(stampsForRule(r, { amount: 12000, date: tuesday })).toBe(2);
    expect(stampsForRule(r, { amount: 100000, date: tuesday })).toBe(3);
  });

  it('weekday_bonus: solo los días configurados', () => {
    const r: StampRule = { ...base, id: 'r', name: 'martes', kind: 'weekday_bonus', weekdays: [2], extraStamps: 2 };
    expect(stampsForRule(r, { amount: 100, date: tuesday })).toBe(2);
    expect(stampsForRule(r, { amount: 100, date: new Date('2026-11-04T12:00:00') })).toBe(0);
  });

  it('reglas inactivas no suman', () => {
    const r: StampRule = { ...base, active: false, id: 'r', name: 'x', kind: 'per_visit', stamps: 1 };
    expect(stampsForRule(r, { amount: 100, date: tuesday })).toBe(0);
  });
});

describe('calculateStamps', () => {
  const rules: StampRule[] = [
    { ...base, id: 'a', name: 'visita', kind: 'per_visit', stamps: 1 },
    { ...base, id: 'b', name: '+10k', kind: 'min_amount', minAmount: 10000, stamps: 1 },
    { ...base, id: 'c', name: 'martes', kind: 'weekday_bonus', weekdays: [2], extraStamps: 1 },
  ];

  it('acumula reglas y devuelve el detalle', () => {
    const r = calculateStamps(rules, { amount: 12000, date: tuesday });
    expect(r.total).toBe(3);
    expect(r.breakdown.map((b) => b.ruleId)).toEqual(['a', 'b', 'c']);
    expect(r.capped).toBe(false);
  });

  it('respeta el tope por compra del comercio', () => {
    const r = calculateStamps(rules, { amount: 12000, date: tuesday }, { maxStampsPerPurchase: 2 });
    expect(r.total).toBe(2);
    expect(r.capped).toBe(true);
  });
});
