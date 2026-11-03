import type { AppliedRule, Business, StampRule } from './types';

export interface PurchaseInput {
  amount: number;
  date: Date;
}

export interface StampCalculation {
  total: number;
  breakdown: AppliedRule[];
  /** true si el total se recortó por el tope del comercio. */
  capped: boolean;
}

/** Cuántos sellos aporta UNA regla para una compra. Pura y sin efectos. */
export function stampsForRule(rule: StampRule, p: PurchaseInput): number {
  if (!rule.active || p.amount <= 0) return 0;
  switch (rule.kind) {
    case 'per_visit':
      return p.amount >= (rule.minAmount ?? 0) ? rule.stamps : 0;
    case 'min_amount':
      return p.amount >= rule.minAmount ? rule.stamps : 0;
    case 'per_amount': {
      if (rule.stepAmount <= 0) return 0;
      const n = Math.floor(p.amount / rule.stepAmount) * rule.stamps;
      return rule.maxPerPurchase != null ? Math.min(n, rule.maxPerPurchase) : n;
    }
    case 'weekday_bonus':
      return rule.weekdays.includes(p.date.getDay()) && p.amount >= (rule.minAmount ?? 0)
        ? rule.extraStamps
        : 0;
  }
}

/**
 * Calcula los sellos de una compra aplicando TODAS las reglas activas del comercio
 * (son acumulables) y respetando el tope por compra si existe.
 */
export function calculateStamps(
  rules: StampRule[],
  p: PurchaseInput,
  business?: Pick<Business, 'maxStampsPerPurchase'>,
): StampCalculation {
  const breakdown: AppliedRule[] = [];
  for (const r of rules) {
    const s = stampsForRule(r, p);
    if (s > 0) breakdown.push({ ruleId: r.id, name: r.name, stamps: s });
  }
  const raw = breakdown.reduce((a, b) => a + b.stamps, 0);
  const cap = business?.maxStampsPerPurchase;
  const total = cap != null && cap > 0 ? Math.min(raw, cap) : raw;
  return { total, breakdown, capped: total < raw };
}

export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Descripción en lenguaje natural de una regla, para mostrar en UI. */
export function describeRule(rule: StampRule, money: (n: number) => string): string {
  const s = (n: number) => `${n} sello${n === 1 ? '' : 's'}`;
  switch (rule.kind) {
    case 'per_visit':
      return rule.minAmount
        ? `Cada compra desde ${money(rule.minAmount)} suma ${s(rule.stamps)}`
        : `Cada compra suma ${s(rule.stamps)}`;
    case 'min_amount':
      return `Compras desde ${money(rule.minAmount)} suman ${s(rule.stamps)}`;
    case 'per_amount':
      return `Cada ${money(rule.stepAmount)} suma ${s(rule.stamps)}${
        rule.maxPerPurchase != null ? ` (máx. ${rule.maxPerPurchase} por compra)` : ''
      }`;
    case 'weekday_bonus':
      return `Los ${rule.weekdays.map((d) => WEEKDAYS[d]).join(', ')} suman ${s(rule.extraStamps)} extra${
        rule.minAmount ? ` en compras desde ${money(rule.minAmount)}` : ''
      }`;
  }
}
