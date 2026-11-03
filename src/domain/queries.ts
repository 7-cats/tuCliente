import type {
  Business,
  Customer,
  DB,
  ExchangeAgreement,
  ID,
  Purchase,
  Reward,
  Segment,
} from './types';

export const byId = <T extends { id: ID }>(list: T[], id: ID): T | undefined =>
  list.find((x) => x.id === id);

export function balance(db: DB, customerId: ID, businessId: ID): number {
  let total = 0;
  for (const t of db.transactions) {
    if (t.customerId === customerId && t.businessId === businessId) total += t.delta;
  }
  return total;
}

/** Saldos de un cliente en todos los comercios donde tiene movimientos o membresía. */
export function balancesForCustomer(db: DB, customerId: ID): { business: Business; stamps: number }[] {
  const ids = new Set<ID>(
    db.memberships.filter((m) => m.customerId === customerId).map((m) => m.businessId),
  );
  for (const t of db.transactions) if (t.customerId === customerId) ids.add(t.businessId);
  return [...ids]
    .map((bid) => byId(db.businesses, bid))
    .filter((b): b is Business => !!b)
    .map((business) => ({ business, stamps: balance(db, customerId, business.id) }));
}

export function isMember(db: DB, customerId: ID, businessId: ID): boolean {
  return db.memberships.some((m) => m.customerId === customerId && m.businessId === businessId);
}

export function customersOf(db: DB, businessId: ID): Customer[] {
  const ids = new Set(db.memberships.filter((m) => m.businessId === businessId).map((m) => m.customerId));
  return db.customers.filter((c) => ids.has(c.id));
}

export function purchasesOf(db: DB, businessId: ID, customerId?: ID): Purchase[] {
  return db.purchases
    .filter((p) => p.businessId === businessId && (!customerId || p.customerId === customerId))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface CustomerStats {
  customer: Customer;
  stamps: number;
  totalSpent: number;
  visits: number;
  lastVisit?: string;
  avgTicket: number;
}

export function customerStats(db: DB, businessId: ID, customer: Customer): CustomerStats {
  const ps = db.purchases.filter((p) => p.businessId === businessId && p.customerId === customer.id);
  const totalSpent = ps.reduce((a, p) => a + p.amount, 0);
  const lastVisit = ps.reduce<string | undefined>((a, p) => (!a || p.date > a ? p.date : a), undefined);
  return {
    customer,
    stamps: balance(db, customer.id, businessId),
    totalSpent,
    visits: ps.length,
    lastVisit,
    avgTicket: ps.length ? totalSpent / ps.length : 0,
  };
}

export function activeRewards(db: DB, businessId: ID, now = new Date()): Reward[] {
  return db.rewards
    .filter((r) => r.businessId === businessId && isRewardAvailable(r, now))
    .sort((a, b) => a.cost - b.cost);
}

export function isRewardAvailable(r: Reward, now = new Date()): boolean {
  if (!r.active) return false;
  if (r.stock != null && r.stock <= 0) return false;
  if (r.validUntil && new Date(r.validUntil) < now) return false;
  return true;
}

/** Premio más barato que el cliente todavía no alcanza (para "te faltan X"). */
export function nextReward(db: DB, businessId: ID, stamps: number): Reward | undefined {
  return activeRewards(db, businessId).find((r) => r.cost > stamps);
}

/* ------------------------------------------------------------------ */
/* Segmentación para promociones                                       */
/* ------------------------------------------------------------------ */

export function resolveSegment(db: DB, businessId: ID, segment: Segment, now = new Date()): Customer[] {
  const stats = customersOf(db, businessId).map((c) => customerStats(db, businessId, c));
  switch (segment.kind) {
    case 'all':
      return stats.map((s) => s.customer);
    case 'min_stamps':
      return stats.filter((s) => s.stamps >= segment.min).map((s) => s.customer);
    case 'inactive_days': {
      const limit = now.getTime() - segment.days * 86_400_000;
      return stats
        .filter((s) => !s.lastVisit || new Date(s.lastVisit).getTime() < limit)
        .map((s) => s.customer);
    }
    case 'top_spenders':
      return [...stats]
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, segment.top)
        .map((s) => s.customer);
    case 'near_reward': {
      const rewards = activeRewards(db, businessId, now);
      return stats
        .filter((s) => rewards.some((r) => r.cost > s.stamps && r.cost - s.stamps <= segment.within))
        .map((s) => s.customer);
    }
  }
}

export function describeSegment(s: Segment): string {
  switch (s.kind) {
    case 'all':
      return 'Todos los clientes';
    case 'min_stamps':
      return `Clientes con ${s.min}+ sellos`;
    case 'inactive_days':
      return `Sin visitas hace ${s.days}+ días`;
    case 'top_spenders':
      return `Top ${s.top} por gasto`;
    case 'near_reward':
      return `A ${s.within} sello${s.within === 1 ? '' : 's'} o menos de un premio`;
  }
}

/* ------------------------------------------------------------------ */
/* Red de intercambio                                                  */
/* ------------------------------------------------------------------ */

/** Una dirección concreta en la que se pueden convertir sellos. */
export interface ExchangeRoute {
  agreement: ExchangeAgreement;
  fromBusinessId: ID;
  toBusinessId: ID;
  /** `give` sellos de origen → `get` sellos de destino. */
  give: number;
  get: number;
}

export function routesOf(a: ExchangeAgreement): ExchangeRoute[] {
  const out: ExchangeRoute[] = [
    { agreement: a, fromBusinessId: a.fromBusinessId, toBusinessId: a.toBusinessId, give: a.rateFrom, get: a.rateTo },
  ];
  if (a.bidirectional) {
    out.push({ agreement: a, fromBusinessId: a.toBusinessId, toBusinessId: a.fromBusinessId, give: a.rateTo, get: a.rateFrom });
  }
  return out;
}

export function activeRoutes(db: DB): ExchangeRoute[] {
  return db.agreements.filter((a) => a.status === 'active').flatMap(routesOf);
}

export function routesFrom(db: DB, businessId: ID): ExchangeRoute[] {
  return activeRoutes(db).filter((r) => r.fromBusinessId === businessId);
}

export function routesTo(db: DB, businessId: ID): ExchangeRoute[] {
  return activeRoutes(db).filter((r) => r.toBusinessId === businessId);
}

/** Sellos que un cliente ya recibió este mes en `toBusinessId` vía un acuerdo. */
export function receivedThisMonth(db: DB, customerId: ID, agreementId: ID, toBusinessId: ID, now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  return db.transactions
    .filter((t) => {
      if (t.kind !== 'exchange_in' || t.customerId !== customerId) return false;
      if (t.agreementId !== agreementId || t.businessId !== toBusinessId) return false;
      const d = new Date(t.date);
      return d.getFullYear() === y && d.getMonth() === m;
    })
    .reduce((a, t) => a + t.delta, 0);
}

/**
 * Máximo de "paquetes" (give→get) que un cliente puede convertir ahora mismo por una ruta,
 * considerando su saldo de origen y el tope mensual del acuerdo.
 */
export function maxExchangeUnits(db: DB, customerId: ID, route: ExchangeRoute, now = new Date()): number {
  const byBalance = Math.floor(balance(db, customerId, route.fromBusinessId) / route.give);
  const limit = route.agreement.monthlyLimit;
  if (limit == null) return Math.max(0, byBalance);
  const left = limit - receivedThisMonth(db, customerId, route.agreement.id, route.toBusinessId, now);
  return Math.max(0, Math.min(byBalance, Math.floor(left / route.get)));
}
