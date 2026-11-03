/**
 * Modelo de dominio de tuCliente.
 *
 * Principios:
 * - El cliente es una identidad GLOBAL de la plataforma (se identifica por teléfono / DNI),
 *   y se "adhiere" a cada comercio mediante una Membership. Eso es lo que habilita
 *   que dos comercios distintos compartan clientes y sellos vía acuerdos de intercambio.
 * - El saldo de sellos NUNCA se guarda: se deriva del libro mayor (StampTransaction).
 *   Cada movimiento (ganar, canjear, intercambiar, ajustar) queda auditado.
 * - Las reglas (cómo se ganan sellos, qué se puede canjear, cómo se intercambia)
 *   son datos configurables por cada comercio, no código.
 */

export type ID = string;
export type ISODate = string;

export type Category =
  | 'cafeteria'
  | 'gastronomia'
  | 'libreria'
  | 'indumentaria'
  | 'almacen'
  | 'belleza'
  | 'otro';

export interface Business {
  id: ID;
  name: string;
  category: Category;
  address?: string;
  /** Tope de sellos que se pueden ganar en una sola compra (opcional). */
  maxStampsPerPurchase?: number;
  /** Cuántos casilleros tiene la tarjeta visual de sellos. */
  cardSize: number;
  createdAt: ISODate;
}

export interface Customer {
  id: ID;
  name: string;
  phone?: string;
  email?: string;
  dni?: string;
  birthday?: string; // MM-DD
  createdAt: ISODate;
}

export interface Membership {
  customerId: ID;
  businessId: ID;
  joinedAt: ISODate;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Reglas para sumar sellos                                            */
/* ------------------------------------------------------------------ */

interface RuleBase {
  id: ID;
  businessId: ID;
  name: string;
  active: boolean;
}

/** Cada compra suma N sellos (sin importar el monto, opcionalmente con mínimo). */
export interface PerVisitRule extends RuleBase {
  kind: 'per_visit';
  stamps: number;
  minAmount?: number;
}

/** Si la compra supera un monto mínimo, suma N sellos. Ej: compras > $10.000 suman 1 sello. */
export interface MinAmountRule extends RuleBase {
  kind: 'min_amount';
  minAmount: number;
  stamps: number;
}

/** Cada X pesos suma N sellos. Ej: cada $15.000 → 1 sello. */
export interface PerAmountRule extends RuleBase {
  kind: 'per_amount';
  stepAmount: number;
  stamps: number;
  maxPerPurchase?: number;
}

/** Bonus en días específicos de la semana. 0 = domingo … 6 = sábado. */
export interface WeekdayBonusRule extends RuleBase {
  kind: 'weekday_bonus';
  weekdays: number[];
  extraStamps: number;
  minAmount?: number;
}

export type StampRule = PerVisitRule | MinAmountRule | PerAmountRule | WeekdayBonusRule;
export type StampRuleKind = StampRule['kind'];

/* ------------------------------------------------------------------ */
/* Premios                                                             */
/* ------------------------------------------------------------------ */

export type RewardKind = 'discount_percent' | 'discount_amount' | 'free_item' | 'other';

export interface Reward {
  id: ID;
  businessId: ID;
  name: string;
  description?: string;
  kind: RewardKind;
  /** % para discount_percent, $ para discount_amount. */
  value?: number;
  /** Costo en sellos del propio comercio. */
  cost: number;
  /** Compra mínima para poder aplicar el premio (informativo para el comercio). */
  minPurchase?: number;
  /** null/undefined = ilimitado. */
  stock?: number | null;
  validUntil?: ISODate;
  active: boolean;
}

export type RedemptionStatus = 'issued' | 'used' | 'cancelled';

export interface Redemption {
  id: ID;
  customerId: ID;
  businessId: ID;
  rewardId: ID;
  rewardName: string;
  stampsSpent: number;
  code: string;
  status: RedemptionStatus;
  createdAt: ISODate;
  usedAt?: ISODate;
}

/* ------------------------------------------------------------------ */
/* Compras e historial                                                 */
/* ------------------------------------------------------------------ */

export interface AppliedRule {
  ruleId: ID;
  name: string;
  stamps: number;
}

export interface Purchase {
  id: ID;
  businessId: ID;
  customerId: ID;
  amount: number;
  date: ISODate;
  description?: string;
  stampsEarned: number;
  appliedRules: AppliedRule[];
}

/* ------------------------------------------------------------------ */
/* Libro mayor de sellos                                               */
/* ------------------------------------------------------------------ */

export type StampTxKind = 'earn' | 'redeem' | 'exchange_out' | 'exchange_in' | 'adjust' | 'refund';

export interface StampTransaction {
  id: ID;
  customerId: ID;
  businessId: ID;
  date: ISODate;
  /** Positivo suma, negativo resta. */
  delta: number;
  kind: StampTxKind;
  /** Referencia al objeto que originó el movimiento (compra, canje, intercambio). */
  refId?: ID;
  agreementId?: ID;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Promociones                                                         */
/* ------------------------------------------------------------------ */

export type Segment =
  | { kind: 'all' }
  | { kind: 'min_stamps'; min: number }
  | { kind: 'inactive_days'; days: number }
  | { kind: 'top_spenders'; top: number }
  | { kind: 'near_reward'; within: number };

export type Channel = 'whatsapp' | 'email' | 'app';

export interface Promotion {
  id: ID;
  businessId: ID;
  title: string;
  message: string;
  segment: Segment;
  channel: Channel;
  recipientIds: ID[];
  sentAt: ISODate;
  validUntil?: ISODate;
}

/* ------------------------------------------------------------------ */
/* Red de intercambio entre comercios                                  */
/* ------------------------------------------------------------------ */

export type AgreementStatus = 'pending' | 'active' | 'paused' | 'rejected';

/**
 * Acuerdo de intercambio: `rateFrom` sellos del comercio origen equivalen a
 * `rateTo` sellos del comercio destino. Si es bidireccional, vale también al revés
 * con la relación inversa.
 *
 * Lo propone `fromBusinessId` y lo tiene que aceptar `toBusinessId`.
 */
export interface ExchangeAgreement {
  id: ID;
  fromBusinessId: ID;
  toBusinessId: ID;
  rateFrom: number;
  rateTo: number;
  bidirectional: boolean;
  /** Máximo de sellos que un cliente puede RECIBIR por mes vía este acuerdo (por dirección). */
  monthlyLimit?: number;
  status: AgreementStatus;
  createdAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Base de datos                                                       */
/* ------------------------------------------------------------------ */

export interface DB {
  version: number;
  businesses: Business[];
  customers: Customer[];
  memberships: Membership[];
  stampRules: StampRule[];
  rewards: Reward[];
  purchases: Purchase[];
  transactions: StampTransaction[];
  redemptions: Redemption[];
  promotions: Promotion[];
  agreements: ExchangeAgreement[];
}

export const DB_VERSION = 1;

export function emptyDB(): DB {
  return {
    version: DB_VERSION,
    businesses: [],
    customers: [],
    memberships: [],
    stampRules: [],
    rewards: [],
    purchases: [],
    transactions: [],
    redemptions: [],
    promotions: [],
    agreements: [],
  };
}
