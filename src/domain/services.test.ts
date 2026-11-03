import { beforeEach, describe, expect, it } from 'vitest';
import { balance, maxExchangeUnits, resolveSegment, routesOf } from './queries';
import {
  DomainError,
  cancelRedemption,
  enrollCustomer,
  exchangeStamps,
  proposeAgreement,
  recordPurchase,
  redeemReward,
  sendPromotion,
  setAgreementStatus,
  upsertReward,
  upsertRule,
  voidPurchase,
} from './services';
import { emptyDB, type DB } from './types';

const now = new Date('2026-11-03T12:00:00');

function setup(): { db: DB; cafe: string; libro: string; ana: string } {
  let db = emptyDB();
  db.businesses.push(
    { id: 'cafe', name: 'Café', category: 'cafeteria', cardSize: 10, createdAt: now.toISOString() },
    { id: 'libro', name: 'Librería', category: 'libreria', cardSize: 8, createdAt: now.toISOString() },
  );
  db = upsertRule(db, { businessId: 'cafe', name: '+10k', active: true, kind: 'min_amount', minAmount: 10000, stamps: 1 }).db;
  db = upsertRule(db, { businessId: 'libro', name: 'cada 5k', active: true, kind: 'per_amount', stepAmount: 5000, stamps: 1 }).db;
  const r = enrollCustomer(db, 'cafe', { name: 'Ana Pérez', phone: '11 5555-1234' }, now);
  return { db: r.db, cafe: 'cafe', libro: 'libro', ana: r.value.id };
}

let s: ReturnType<typeof setup>;
beforeEach(() => {
  s = setup();
});

describe('clientes', () => {
  it('reutiliza la identidad global al adherirse a otro comercio', () => {
    const r = enrollCustomer(s.db, s.libro, { name: 'Ana', phone: '1155551234' }, now);
    expect(r.value.id).toBe(s.ana);
    expect(r.db.customers).toHaveLength(1);
    expect(r.db.memberships).toHaveLength(2);
  });

  it('exige un dato de contacto', () => {
    expect(() => enrollCustomer(s.db, s.cafe, { name: 'X' })).toThrow(DomainError);
  });
});

describe('compras', () => {
  it('registra la compra y suma sellos según reglas', () => {
    const r = recordPurchase(s.db, { businessId: s.cafe, customerId: s.ana, amount: 15000, date: now });
    expect(r.value.stampsEarned).toBe(1);
    expect(balance(r.db, s.ana, s.cafe)).toBe(1);
    const r2 = recordPurchase(r.db, { businessId: s.cafe, customerId: s.ana, amount: 5000, date: now });
    expect(r2.value.stampsEarned).toBe(0);
    expect(r2.db.purchases).toHaveLength(2);
  });

  it('no permite registrar compras de no adheridos', () => {
    expect(() => recordPurchase(s.db, { businessId: s.libro, customerId: s.ana, amount: 1000 })).toThrow(/adherido/);
  });

  it('anular una compra descuenta los sellos', () => {
    const r = recordPurchase(s.db, { businessId: s.cafe, customerId: s.ana, amount: 15000, date: now });
    const db = voidPurchase(r.db, r.value.id);
    expect(balance(db, s.ana, s.cafe)).toBe(0);
    expect(db.purchases).toHaveLength(0);
  });
});

describe('canjes', () => {
  it('canjea si alcanza, descuenta stock y se puede cancelar', () => {
    let db = s.db;
    for (let i = 0; i < 3; i++) db = recordPurchase(db, { businessId: s.cafe, customerId: s.ana, amount: 12000, date: now }).db;
    const rw = upsertReward(db, { businessId: s.cafe, name: 'Café gratis', kind: 'free_item', cost: 3, stock: 1, active: true });
    db = rw.db;
    const red = redeemReward(db, s.ana, rw.value.id, now);
    expect(balance(red.db, s.ana, s.cafe)).toBe(0);
    expect(red.db.rewards[0].stock).toBe(0);
    expect(red.value.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);

    const back = cancelRedemption(red.db, red.value.id);
    expect(balance(back, s.ana, s.cafe)).toBe(3);
    expect(back.rewards[0].stock).toBe(1);
  });

  it('rechaza si no alcanzan los sellos', () => {
    const rw = upsertReward(s.db, { businessId: s.cafe, name: 'X', kind: 'other', cost: 5, active: true });
    expect(() => redeemReward(rw.db, s.ana, rw.value.id, now)).toThrow(/insuficientes/);
  });
});

describe('red de intercambio', () => {
  function withAgreement(opts: { monthlyLimit?: number; bidirectional?: boolean } = {}) {
    let db = s.db;
    for (let i = 0; i < 5; i++) db = recordPurchase(db, { businessId: s.cafe, customerId: s.ana, amount: 12000, date: now }).db;
    const p = proposeAgreement(
      db,
      { fromBusinessId: s.cafe, toBusinessId: s.libro, rateFrom: 2, rateTo: 1, bidirectional: opts.bidirectional ?? true, monthlyLimit: opts.monthlyLimit },
      now,
    );
    return { db: p.db, agreement: p.value };
  }

  it('la propuesta la acepta el comercio destino', () => {
    const { db, agreement } = withAgreement();
    expect(() => setAgreementStatus(db, agreement.id, 'active', s.cafe)).toThrow(/otro comercio/);
    const ok = setAgreementStatus(db, agreement.id, 'active', s.libro);
    expect(ok.agreements[0].status).toBe('active');
  });

  it('no permite intercambiar con acuerdo pendiente', () => {
    const { db, agreement } = withAgreement();
    expect(() => exchangeStamps(db, { customerId: s.ana, agreementId: agreement.id, fromBusinessId: s.cafe, units: 1 }, now)).toThrow(/activo/);
  });

  it('convierte sellos a la tasa acordada y adhiere al destino', () => {
    const { db: d0, agreement } = withAgreement();
    const db = setAgreementStatus(d0, agreement.id, 'active', s.libro);
    const r = exchangeStamps(db, { customerId: s.ana, agreementId: agreement.id, fromBusinessId: s.cafe, units: 2 }, now);
    expect(r.value).toEqual({ given: 4, received: 2 });
    expect(balance(r.db, s.ana, s.cafe)).toBe(1);
    expect(balance(r.db, s.ana, s.libro)).toBe(2);
    expect(r.db.memberships.some((m) => m.businessId === s.libro && m.customerId === s.ana)).toBe(true);
  });

  it('bidireccional usa la tasa inversa', () => {
    const { agreement } = withAgreement();
    const routes = routesOf({ ...agreement, status: 'active' });
    expect(routes[1]).toMatchObject({ fromBusinessId: s.libro, toBusinessId: s.cafe, give: 1, get: 2 });
  });

  it('respeta el tope mensual', () => {
    const { db: d0, agreement } = withAgreement({ monthlyLimit: 1 });
    const db = setAgreementStatus(d0, agreement.id, 'active', s.libro);
    const route = routesOf({ ...agreement, status: 'active' })[0];
    expect(maxExchangeUnits(db, s.ana, route, now)).toBe(1);
    const r = exchangeStamps(db, { customerId: s.ana, agreementId: agreement.id, fromBusinessId: s.cafe, units: 1 }, now);
    expect(maxExchangeUnits(r.db, s.ana, route, now)).toBe(0);
    expect(() => exchangeStamps(r.db, { customerId: s.ana, agreementId: agreement.id, fromBusinessId: s.cafe, units: 1 }, now)).toThrow(DomainError);
  });

  it('no permite acuerdos duplicados', () => {
    const { db } = withAgreement();
    expect(() => proposeAgreement(db, { fromBusinessId: s.libro, toBusinessId: s.cafe, rateFrom: 1, rateTo: 1, bidirectional: false })).toThrow(/Ya existe/);
  });
});

describe('promociones', () => {
  it('resuelve segmentos y registra destinatarios', () => {
    let db = enrollCustomer(s.db, s.cafe, { name: 'Beto', dni: '30111222' }, now).db;
    db = recordPurchase(db, { businessId: s.cafe, customerId: s.ana, amount: 12000, date: now }).db;
    expect(resolveSegment(db, s.cafe, { kind: 'all' }, now)).toHaveLength(2);
    expect(resolveSegment(db, s.cafe, { kind: 'min_stamps', min: 1 }, now).map((c) => c.name)).toEqual(['Ana Pérez']);
    expect(resolveSegment(db, s.cafe, { kind: 'inactive_days', days: 30 }, now).map((c) => c.name)).toEqual(['Beto']);
    const p = sendPromotion(db, { businessId: s.cafe, title: 'Hola', message: 'Hola {nombre}', segment: { kind: 'all' }, channel: 'whatsapp' }, now);
    expect(p.value.recipientIds).toHaveLength(2);
  });
});
