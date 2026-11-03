/**
 * Datos de demostración. Se generan usando los MISMOS servicios de dominio que usa la app,
 * así los saldos e historiales son consistentes con las reglas.
 */
import {
  enrollCustomer,
  markRedemptionUsed,
  proposeAgreement,
  recordPurchase,
  redeemReward,
  sendPromotion,
  setAgreementStatus,
  upsertReward,
  upsertRule,
  type RuleDraft,
} from '../domain/services';
import { emptyDB, type Business, type DB } from '../domain/types';

/** PRNG determinístico (mulberry32) para que la demo sea siempre igual. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  { name: 'Lucía Fernández', phone: '11 4521-8890', email: 'lucia.f@mail.com', birthday: '03-14' },
  { name: 'Martín Gómez', phone: '11 6230-1145', dni: '32456789' },
  { name: 'Sofía Ramírez', phone: '11 5012-7731', email: 'sofi.ramirez@mail.com' },
  { name: 'Juan Pablo Ortiz', phone: '11 3398-2210' },
  { name: 'Valentina Sosa', phone: '11 4877-6612', email: 'vale.sosa@mail.com', birthday: '11-20' },
  { name: 'Diego Herrera', phone: '11 2290-5543', dni: '28999111' },
  { name: 'Camila Torres', phone: '11 6655-0098' },
  { name: 'Nicolás Acosta', phone: '11 4100-3321', email: 'nico.acosta@mail.com' },
  { name: 'Florencia Díaz', phone: '11 5789-4410' },
  { name: 'Tomás Benítez', phone: '11 3012-8876', dni: '40123456' },
  { name: 'Agustina Molina', phone: '11 6543-2109', email: 'agus.molina@mail.com' },
  { name: 'Federico Ruiz', phone: '11 4433-7765' },
];

const DESCRIPTIONS: Record<string, string[]> = {
  cafe: ['Café con leche + medialunas', 'Flat white', 'Desayuno completo', 'Brunch para dos', 'Café en grano 250g', 'Tostado + jugo'],
  libro: ['Novela', 'Cuaderno A5 + lapiceras', 'Libro infantil', 'Agenda 2027', 'Ensayo', 'Set de acuarelas'],
  alba: ['Remera básica', 'Jean', 'Campera', 'Vestido', 'Accesorios', 'Buzo oversize'],
};

export function buildSeed(now = new Date()): DB {
  const rand = rng(7);
  let db = emptyDB();
  const iso = now.toISOString();

  const businesses: Business[] = [
    { id: 'cafe', name: 'Café Bruma', category: 'cafeteria', address: 'Av. Corrientes 1840', cardSize: 10, maxStampsPerPurchase: 3, createdAt: iso },
    { id: 'libro', name: 'Librería Ombú', category: 'libreria', address: 'Thames 1230', cardSize: 8, createdAt: iso },
    { id: 'alba', name: 'Tienda Alba', category: 'indumentaria', address: 'Gorriti 4877', cardSize: 6, createdAt: iso },
  ];
  db.businesses = businesses;

  // Reglas de sellos
  const rules = [
    { businessId: 'cafe', name: 'Visita', active: true, kind: 'per_visit', stamps: 1 },
    { businessId: 'cafe', name: 'Compra grande', active: true, kind: 'min_amount', minAmount: 10000, stamps: 1 },
    { businessId: 'cafe', name: 'Martes de doble sello', active: true, kind: 'weekday_bonus', weekdays: [2], extraStamps: 1 },
    { businessId: 'libro', name: 'Cada $15.000', active: true, kind: 'per_amount', stepAmount: 15000, stamps: 1, maxPerPurchase: 4 },
    { businessId: 'alba', name: 'Compras desde $30.000', active: true, kind: 'min_amount', minAmount: 30000, stamps: 1 },
    { businessId: 'alba', name: 'Compras desde $60.000', active: true, kind: 'min_amount', minAmount: 60000, stamps: 1 },
  ] as const;
  for (const r of rules) db = upsertRule(db, JSON.parse(JSON.stringify(r)) as RuleDraft).db;

  // Premios
  const rewards = [
    { businessId: 'cafe', name: 'Café gratis', description: 'Cualquier café de la carta', kind: 'free_item', cost: 5, active: true },
    { businessId: 'cafe', name: '20% en tu próxima compra', kind: 'discount_percent', value: 20, cost: 8, active: true },
    { businessId: 'cafe', name: 'Desayuno para dos', kind: 'free_item', cost: 12, stock: 10, active: true },
    { businessId: 'libro', name: '$5.000 de descuento', kind: 'discount_amount', value: 5000, cost: 3, minPurchase: 20000, active: true },
    { businessId: 'libro', name: 'Libro de bolsillo a elección', kind: 'free_item', cost: 6, active: true },
    { businessId: 'alba', name: '15% off', kind: 'discount_percent', value: 15, cost: 3, active: true },
    { businessId: 'alba', name: 'Tote bag Alba', kind: 'free_item', cost: 5, stock: 20, active: true },
  ] as const;
  const rewardIds: Record<string, string[]> = { cafe: [], libro: [], alba: [] };
  for (const r of rewards) {
    const res = upsertReward(db, { ...r });
    db = res.db;
    rewardIds[r.businessId]!.push(res.value.id);
  }

  // Adhesiones: cada cliente se adhiere a 1–3 comercios.
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const ids: string[] = [];
  CUSTOMERS.forEach((c, i) => {
    const home = businesses[i % 3]!;
    const r = enrollCustomer(db, home.id, c, daysAgo(90 - i * 3));
    db = r.db;
    ids.push(r.value.id);
    for (const b of businesses) {
      if (b.id !== home.id && rand() < 0.45) db = enrollCustomer(db, b.id, c, daysAgo(60 - i * 2)).db;
    }
  });

  // Compras de los últimos 90 días
  const ticket: Record<string, [number, number]> = { cafe: [3500, 18000], libro: [8000, 55000], alba: [18000, 95000] };
  const freq: Record<string, number> = { cafe: 14, libro: 5, alba: 4 };
  for (const m of [...db.memberships]) {
    const n = Math.floor(rand() * freq[m.businessId]!) + 1;
    const joined = new Date(m.joinedAt).getTime();
    for (let k = 0; k < n; k++) {
      const t = joined + rand() * (now.getTime() - joined);
      const date = new Date(t);
      date.setHours(9 + Math.floor(rand() * 11), Math.floor(rand() * 60));
      const [lo, hi] = ticket[m.businessId]!;
      const amount = Math.round((lo + rand() * (hi - lo)) / 100) * 100;
      const opts = DESCRIPTIONS[m.businessId]!;
      db = recordPurchase(db, {
        businessId: m.businessId,
        customerId: m.customerId,
        amount,
        date,
        description: opts[Math.floor(rand() * opts.length)],
      }).db;
    }
  }

  // Algunos canjes históricos
  for (const cid of ids.slice(0, 6)) {
    for (const b of businesses) {
      const cheapest = rewardIds[b.id]![0]!;
      try {
        const r = redeemReward(db, cid, cheapest, daysAgo(Math.floor(rand() * 20)));
        db = r.db;
        if (rand() < 0.6) db = markRedemptionUsed(db, r.value.id);
      } catch {
        /* no le alcanza: ok */
      }
    }
  }

  // Red de intercambio
  const a1 = proposeAgreement(db, { fromBusinessId: 'cafe', toBusinessId: 'libro', rateFrom: 2, rateTo: 1, bidirectional: true, monthlyLimit: 6 }, daysAgo(30));
  db = setAgreementStatus(a1.db, a1.value.id, 'active', 'libro');
  db = proposeAgreement(db, { fromBusinessId: 'alba', toBusinessId: 'cafe', rateFrom: 1, rateTo: 2, bidirectional: false }, daysAgo(2)).db;

  // Promos enviadas
  db = sendPromotion(db, {
    businessId: 'cafe',
    title: 'Martes de doble sello ☕',
    message: 'Hola {nombre}! Este martes cada compra en {comercio} suma doble. Sellos acumulados: {sellos}.',
    segment: { kind: 'all' },
    channel: 'whatsapp',
  }, daysAgo(6)).db;
  db = sendPromotion(db, {
    businessId: 'cafe',
    title: 'Gracias por elegirnos',
    message: '{nombre}, sos de nuestros clientes más fieles. Esta semana la medialuna va de regalo.',
    segment: { kind: 'top_spenders', top: 5 },
    channel: 'whatsapp',
  }, daysAgo(3)).db;

  return db;
}
