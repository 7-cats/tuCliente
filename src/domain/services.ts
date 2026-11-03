/**
 * Casos de uso. Cada función es pura: recibe la DB actual y devuelve una DB nueva
 * (más un resultado). Validan reglas de negocio y lanzan DomainError si algo no corresponde.
 *
 * Esta capa es la que en el futuro se mueve a un backend (Supabase / API) sin tocar la UI.
 */
import { redemptionCode, uid } from '../lib/id';
import { calculateStamps } from './rules';
import {
  balance,
  byId,
  isMember,
  isRewardAvailable,
  maxExchangeUnits,
  resolveSegment,
  routesOf,
} from './queries';
import type {
  AgreementStatus,
  Channel,
  Customer,
  DB,
  ExchangeAgreement,
  ID,
  Promotion,
  Purchase,
  Redemption,
  Reward,
  Segment,
  StampRule,
  StampTransaction,
} from './types';

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export interface Result<T> {
  db: DB;
  value: T;
}

const nowISO = (d?: Date | string) => (d ? new Date(d) : new Date()).toISOString();
const normPhone = (p?: string) => (p ?? '').replace(/\D/g, '');

function must<T>(v: T | undefined, msg: string): T {
  if (v === undefined) throw new DomainError(msg);
  return v;
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  dni?: string;
  birthday?: string;
}

/** Busca un cliente global por teléfono, DNI o email. */
export function findCustomer(db: DB, q: { phone?: string; dni?: string; email?: string }): Customer | undefined {
  const phone = normPhone(q.phone);
  const dni = (q.dni ?? '').trim();
  const email = (q.email ?? '').trim().toLowerCase();
  return db.customers.find(
    (c) =>
      (phone && normPhone(c.phone) === phone) ||
      (dni && c.dni === dni) ||
      (email && c.email?.toLowerCase() === email),
  );
}

/**
 * Da de alta (o reutiliza) un cliente y lo adhiere al comercio.
 * Si el cliente ya existe en la plataforma (otro comercio), se reutiliza su identidad.
 */
export function enrollCustomer(db: DB, businessId: ID, input: CustomerInput, at?: Date): Result<Customer> {
  must(byId(db.businesses, businessId), 'Comercio inexistente');
  const name = input.name.trim();
  if (!name) throw new DomainError('El nombre es obligatorio');
  if (!input.phone && !input.dni && !input.email) {
    throw new DomainError('Cargá al menos teléfono, DNI o email para identificar al cliente');
  }
  let customer = findCustomer(db, input);
  let customers = db.customers;
  if (!customer) {
    customer = {
      id: uid('cus'),
      name,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      dni: input.dni?.trim() || undefined,
      birthday: input.birthday || undefined,
      createdAt: nowISO(at),
    };
    customers = [...customers, customer];
  }
  const memberships = isMember(db, customer.id, businessId)
    ? db.memberships
    : [...db.memberships, { customerId: customer.id, businessId, joinedAt: nowISO(at) }];
  return { db: { ...db, customers, memberships }, value: customer };
}

export function updateCustomer(db: DB, id: ID, patch: Partial<CustomerInput>): DB {
  must(byId(db.customers, id), 'Cliente inexistente');
  return { ...db, customers: db.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/* ------------------------------------------------------------------ */
/* Compras                                                             */
/* ------------------------------------------------------------------ */

export interface PurchaseInput {
  businessId: ID;
  customerId: ID;
  amount: number;
  date?: Date | string;
  description?: string;
}

export function recordPurchase(db: DB, input: PurchaseInput): Result<Purchase> {
  const business = must(byId(db.businesses, input.businessId), 'Comercio inexistente');
  must(byId(db.customers, input.customerId), 'Cliente inexistente');
  if (!(input.amount > 0)) throw new DomainError('El monto debe ser mayor a 0');
  if (!isMember(db, input.customerId, input.businessId)) {
    throw new DomainError('El cliente no está adherido a este comercio');
  }
  const date = input.date ? new Date(input.date) : new Date();
  const rules = db.stampRules.filter((r) => r.businessId === business.id);
  const calc = calculateStamps(rules, { amount: input.amount, date }, business);

  const purchase: Purchase = {
    id: uid('pur'),
    businessId: business.id,
    customerId: input.customerId,
    amount: Math.round(input.amount * 100) / 100,
    date: date.toISOString(),
    description: input.description?.trim() || undefined,
    stampsEarned: calc.total,
    appliedRules: calc.breakdown,
  };
  const txs: StampTransaction[] =
    calc.total > 0
      ? [
          {
            id: uid('tx'),
            customerId: input.customerId,
            businessId: business.id,
            date: purchase.date,
            delta: calc.total,
            kind: 'earn',
            refId: purchase.id,
            note: calc.capped ? 'Tope por compra aplicado' : undefined,
          },
        ]
      : [];
  return {
    db: { ...db, purchases: [...db.purchases, purchase], transactions: [...db.transactions, ...txs] },
    value: purchase,
  };
}

/** Anula una compra: la borra del historial y descuenta los sellos que había otorgado. */
export function voidPurchase(db: DB, purchaseId: ID): DB {
  const p = must(byId(db.purchases, purchaseId), 'Compra inexistente');
  const txs: StampTransaction[] =
    p.stampsEarned > 0
      ? [
          {
            id: uid('tx'),
            customerId: p.customerId,
            businessId: p.businessId,
            date: nowISO(),
            delta: -p.stampsEarned,
            kind: 'refund',
            refId: p.id,
            note: 'Compra anulada',
          },
        ]
      : [];
  return {
    ...db,
    purchases: db.purchases.filter((x) => x.id !== purchaseId),
    transactions: [...db.transactions, ...txs],
  };
}

/** Ajuste manual (con motivo) — para corregir errores o regalar sellos. */
export function adjustStamps(db: DB, customerId: ID, businessId: ID, delta: number, note: string): DB {
  if (!Number.isInteger(delta) || delta === 0) throw new DomainError('El ajuste debe ser un entero distinto de 0');
  if (!note.trim()) throw new DomainError('Indicá el motivo del ajuste');
  if (balance(db, customerId, businessId) + delta < 0) throw new DomainError('El saldo no puede quedar negativo');
  const tx: StampTransaction = {
    id: uid('tx'),
    customerId,
    businessId,
    date: nowISO(),
    delta,
    kind: 'adjust',
    note: note.trim(),
  };
  return { ...db, transactions: [...db.transactions, tx] };
}

/* ------------------------------------------------------------------ */
/* Premios y canjes                                                    */
/* ------------------------------------------------------------------ */

export function redeemReward(db: DB, customerId: ID, rewardId: ID, at?: Date): Result<Redemption> {
  const reward = must(byId(db.rewards, rewardId), 'Premio inexistente');
  must(byId(db.customers, customerId), 'Cliente inexistente');
  const now = at ?? new Date();
  if (!isRewardAvailable(reward, now)) throw new DomainError('El premio no está disponible');
  const have = balance(db, customerId, reward.businessId);
  if (have < reward.cost) {
    throw new DomainError(`Sellos insuficientes: tiene ${have}, necesita ${reward.cost}`);
  }
  const redemption: Redemption = {
    id: uid('red'),
    customerId,
    businessId: reward.businessId,
    rewardId: reward.id,
    rewardName: reward.name,
    stampsSpent: reward.cost,
    code: redemptionCode(),
    status: 'issued',
    createdAt: now.toISOString(),
  };
  const tx: StampTransaction = {
    id: uid('tx'),
    customerId,
    businessId: reward.businessId,
    date: redemption.createdAt,
    delta: -reward.cost,
    kind: 'redeem',
    refId: redemption.id,
    note: reward.name,
  };
  const rewards =
    reward.stock != null
      ? db.rewards.map((r) => (r.id === reward.id ? { ...r, stock: (r.stock ?? 0) - 1 } : r))
      : db.rewards;
  return {
    db: { ...db, rewards, redemptions: [...db.redemptions, redemption], transactions: [...db.transactions, tx] },
    value: redemption,
  };
}

export function markRedemptionUsed(db: DB, redemptionId: ID): DB {
  const r = must(byId(db.redemptions, redemptionId), 'Canje inexistente');
  if (r.status !== 'issued') throw new DomainError('El canje ya fue usado o cancelado');
  return {
    ...db,
    redemptions: db.redemptions.map((x) => (x.id === r.id ? { ...x, status: 'used', usedAt: nowISO() } : x)),
  };
}

/** Cancela un canje no usado y devuelve los sellos (y el stock). */
export function cancelRedemption(db: DB, redemptionId: ID): DB {
  const r = must(byId(db.redemptions, redemptionId), 'Canje inexistente');
  if (r.status !== 'issued') throw new DomainError('Solo se pueden cancelar canjes pendientes');
  const tx: StampTransaction = {
    id: uid('tx'),
    customerId: r.customerId,
    businessId: r.businessId,
    date: nowISO(),
    delta: r.stampsSpent,
    kind: 'refund',
    refId: r.id,
    note: `Canje cancelado: ${r.rewardName}`,
  };
  return {
    ...db,
    redemptions: db.redemptions.map((x) => (x.id === r.id ? { ...x, status: 'cancelled' } : x)),
    rewards: db.rewards.map((w) => (w.id === r.rewardId && w.stock != null ? { ...w, stock: w.stock + 1 } : w)),
    transactions: [...db.transactions, tx],
  };
}

export function upsertReward(db: DB, reward: Omit<Reward, 'id'> & { id?: ID }): Result<Reward> {
  if (!reward.name.trim()) throw new DomainError('El premio necesita un nombre');
  if (!(reward.cost >= 1) || !Number.isInteger(reward.cost)) throw new DomainError('El costo debe ser un entero ≥ 1');
  if (reward.kind === 'discount_percent' && !(reward.value! > 0 && reward.value! <= 100)) {
    throw new DomainError('El porcentaje debe estar entre 1 y 100');
  }
  const value: Reward = { ...reward, id: reward.id ?? uid('rwd') };
  const exists = db.rewards.some((r) => r.id === value.id);
  return {
    db: { ...db, rewards: exists ? db.rewards.map((r) => (r.id === value.id ? value : r)) : [...db.rewards, value] },
    value,
  };
}

export function deleteReward(db: DB, id: ID): DB {
  // Si ya tiene canjes, se desactiva para no romper el historial.
  if (db.redemptions.some((r) => r.rewardId === id)) {
    return { ...db, rewards: db.rewards.map((r) => (r.id === id ? { ...r, active: false } : r)) };
  }
  return { ...db, rewards: db.rewards.filter((r) => r.id !== id) };
}

/* ------------------------------------------------------------------ */
/* Reglas de sellos                                                    */
/* ------------------------------------------------------------------ */

export type RuleDraft = StampRule extends infer R ? (R extends StampRule ? Omit<R, 'id'> & { id?: ID } : never) : never;

export function validateRule(r: RuleDraft): void {
  if (!r.name.trim()) throw new DomainError('La regla necesita un nombre');
  const posInt = (n: number | undefined) => n != null && Number.isInteger(n) && n > 0;
  switch (r.kind) {
    case 'per_visit':
      if (!posInt(r.stamps)) throw new DomainError('Los sellos deben ser un entero ≥ 1');
      break;
    case 'min_amount':
      if (!(r.minAmount > 0)) throw new DomainError('El monto mínimo debe ser mayor a 0');
      if (!posInt(r.stamps)) throw new DomainError('Los sellos deben ser un entero ≥ 1');
      break;
    case 'per_amount':
      if (!(r.stepAmount > 0)) throw new DomainError('El monto por sello debe ser mayor a 0');
      if (!posInt(r.stamps)) throw new DomainError('Los sellos deben ser un entero ≥ 1');
      break;
    case 'weekday_bonus':
      if (!r.weekdays.length) throw new DomainError('Elegí al menos un día');
      if (!posInt(r.extraStamps)) throw new DomainError('Los sellos extra deben ser un entero ≥ 1');
      break;
  }
}

export function upsertRule(db: DB, rule: RuleDraft): Result<StampRule> {
  validateRule(rule);
  const value = { ...rule, id: rule.id ?? uid('rul') } as StampRule;
  const exists = db.stampRules.some((r) => r.id === value.id);
  return {
    db: {
      ...db,
      stampRules: exists ? db.stampRules.map((r) => (r.id === value.id ? value : r)) : [...db.stampRules, value],
    },
    value,
  };
}

export function deleteRule(db: DB, id: ID): DB {
  return { ...db, stampRules: db.stampRules.filter((r) => r.id !== id) };
}

export function updateBusiness(db: DB, id: ID, patch: Partial<Pick<DB['businesses'][number], 'name' | 'address' | 'maxStampsPerPurchase' | 'cardSize'>>): DB {
  must(byId(db.businesses, id), 'Comercio inexistente');
  return { ...db, businesses: db.businesses.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

/* ------------------------------------------------------------------ */
/* Promociones                                                         */
/* ------------------------------------------------------------------ */

export interface PromotionInput {
  businessId: ID;
  title: string;
  message: string;
  segment: Segment;
  channel: Channel;
  validUntil?: string;
}

export function sendPromotion(db: DB, input: PromotionInput, at?: Date): Result<Promotion> {
  if (!input.title.trim()) throw new DomainError('La promo necesita un título');
  if (!input.message.trim()) throw new DomainError('Escribí el mensaje');
  const recipients = resolveSegment(db, input.businessId, input.segment, at);
  if (!recipients.length) throw new DomainError('El segmento elegido no tiene clientes');
  const promo: Promotion = {
    id: uid('pro'),
    businessId: input.businessId,
    title: input.title.trim(),
    message: input.message.trim(),
    segment: input.segment,
    channel: input.channel,
    recipientIds: recipients.map((c) => c.id),
    sentAt: nowISO(at),
    validUntil: input.validUntil || undefined,
  };
  return { db: { ...db, promotions: [...db.promotions, promo] }, value: promo };
}

/** Reemplaza {nombre} y {sellos} en el mensaje para un cliente concreto. */
export function renderMessage(template: string, vars: { nombre: string; sellos: number; comercio: string }): string {
  return template
    .replace(/\{nombre\}/gi, vars.nombre.split(' ')[0])
    .replace(/\{sellos\}/gi, String(vars.sellos))
    .replace(/\{comercio\}/gi, vars.comercio);
}

/* ------------------------------------------------------------------ */
/* Red de intercambio                                                  */
/* ------------------------------------------------------------------ */

export interface AgreementInput {
  fromBusinessId: ID;
  toBusinessId: ID;
  rateFrom: number;
  rateTo: number;
  bidirectional: boolean;
  monthlyLimit?: number;
}

export function proposeAgreement(db: DB, input: AgreementInput, at?: Date): Result<ExchangeAgreement> {
  if (input.fromBusinessId === input.toBusinessId) throw new DomainError('Elegí otro comercio');
  must(byId(db.businesses, input.fromBusinessId), 'Comercio origen inexistente');
  must(byId(db.businesses, input.toBusinessId), 'Comercio destino inexistente');
  const posInt = (n: number) => Number.isInteger(n) && n > 0;
  if (!posInt(input.rateFrom) || !posInt(input.rateTo)) throw new DomainError('Las tasas deben ser enteros ≥ 1');
  if (input.monthlyLimit != null && !posInt(input.monthlyLimit)) throw new DomainError('El tope mensual debe ser un entero ≥ 1');
  const dup = db.agreements.find(
    (a) =>
      a.status !== 'rejected' &&
      ((a.fromBusinessId === input.fromBusinessId && a.toBusinessId === input.toBusinessId) ||
        (a.fromBusinessId === input.toBusinessId && a.toBusinessId === input.fromBusinessId)),
  );
  if (dup) throw new DomainError('Ya existe un acuerdo entre estos comercios');
  const agreement: ExchangeAgreement = { ...input, id: uid('agr'), status: 'pending', createdAt: nowISO(at) };
  return { db: { ...db, agreements: [...db.agreements, agreement] }, value: agreement };
}

/**
 * Cambia el estado de un acuerdo. Solo el comercio destino puede aceptar/rechazar
 * una propuesta pendiente; cualquiera de los dos puede pausar o reactivar.
 */
export function setAgreementStatus(db: DB, id: ID, status: AgreementStatus, actorBusinessId: ID): DB {
  const a = must(byId(db.agreements, id), 'Acuerdo inexistente');
  const party = a.fromBusinessId === actorBusinessId || a.toBusinessId === actorBusinessId;
  if (!party) throw new DomainError('Solo los comercios del acuerdo pueden modificarlo');
  if (a.status === 'pending' && (status === 'active' || status === 'rejected') && a.toBusinessId !== actorBusinessId) {
    throw new DomainError('La propuesta la tiene que responder el otro comercio');
  }
  if (a.status === 'rejected') throw new DomainError('El acuerdo fue rechazado');
  return { ...db, agreements: db.agreements.map((x) => (x.id === id ? { ...x, status } : x)) };
}

export interface ExchangeInput {
  customerId: ID;
  agreementId: ID;
  fromBusinessId: ID;
  /** Cantidad de "paquetes" a convertir (cada paquete = give sellos → get sellos). */
  units: number;
}

export function exchangeStamps(db: DB, input: ExchangeInput, at?: Date): Result<{ given: number; received: number }> {
  const agreement = must(byId(db.agreements, input.agreementId), 'Acuerdo inexistente');
  if (agreement.status !== 'active') throw new DomainError('El acuerdo no está activo');
  const route = routesOf(agreement).find((r) => r.fromBusinessId === input.fromBusinessId);
  if (!route) throw new DomainError('Este acuerdo no permite intercambiar en esa dirección');
  if (!Number.isInteger(input.units) || input.units < 1) throw new DomainError('Cantidad inválida');
  const now = at ?? new Date();
  const max = maxExchangeUnits(db, input.customerId, route, now);
  if (input.units > max) {
    throw new DomainError(
      max === 0 ? 'No alcanzan los sellos o se llegó al tope mensual' : `Podés convertir como máximo ${max} vez/veces`,
    );
  }
  const given = route.give * input.units;
  const received = route.get * input.units;
  const ref = uid('xch');
  const date = now.toISOString();
  const txs: StampTransaction[] = [
    {
      id: uid('tx'),
      customerId: input.customerId,
      businessId: route.fromBusinessId,
      date,
      delta: -given,
      kind: 'exchange_out',
      refId: ref,
      agreementId: agreement.id,
      note: `Intercambio → ${byId(db.businesses, route.toBusinessId)?.name ?? ''}`,
    },
    {
      id: uid('tx'),
      customerId: input.customerId,
      businessId: route.toBusinessId,
      date,
      delta: received,
      kind: 'exchange_in',
      refId: ref,
      agreementId: agreement.id,
      note: `Intercambio ← ${byId(db.businesses, route.fromBusinessId)?.name ?? ''}`,
    },
  ];
  // El cliente queda adherido al comercio destino si no lo estaba.
  const memberships = isMember(db, input.customerId, route.toBusinessId)
    ? db.memberships
    : [...db.memberships, { customerId: input.customerId, businessId: route.toBusinessId, joinedAt: date }];
  return {
    db: { ...db, memberships, transactions: [...db.transactions, ...txs] },
    value: { given, received },
  };
}
