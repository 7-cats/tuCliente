import { useState } from 'react';
import { useBusiness, useStore } from '../../data/store';
import { calculateStamps, describeRule, WEEKDAYS } from '../../domain/rules';
import { deleteRule, updateBusiness, upsertRule, type RuleDraft } from '../../domain/services';
import type { StampRule, StampRuleKind } from '../../domain/types';
import { money } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Empty, Field, Modal, NumberInput, PageHead } from '../../components/ui';

const KINDS: { kind: StampRuleKind; title: string; desc: string }[] = [
  { kind: 'min_amount', title: 'Monto mínimo', desc: 'Compras desde $X suman N sellos' },
  { kind: 'per_amount', title: 'Por cada $X', desc: 'Cada $X gastados suma N sellos' },
  { kind: 'per_visit', title: 'Por visita', desc: 'Cada compra suma N sellos' },
  { kind: 'weekday_bonus', title: 'Bonus por día', desc: 'Sellos extra ciertos días' },
];

function blank(kind: StampRuleKind, businessId: string): RuleDraft {
  const base = { businessId, active: true };
  switch (kind) {
    case 'min_amount':
      return { ...base, kind, name: 'Compra desde $10.000', minAmount: 10000, stamps: 1 };
    case 'per_amount':
      return { ...base, kind, name: 'Cada $5.000', stepAmount: 5000, stamps: 1 };
    case 'per_visit':
      return { ...base, kind, name: 'Visita', stamps: 1 };
    case 'weekday_bonus':
      return { ...base, kind, name: 'Bonus de martes', weekdays: [2], extraStamps: 1 };
  }
}

export function Rules() {
  const { db, run } = useStore();
  const business = useBusiness();
  const rules = db.stampRules.filter((r) => r.businessId === business.id);
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [simAmount, setSimAmount] = useState<number | undefined>(12000);
  const [simDay, setSimDay] = useState(new Date().getDay());

  const simDate = new Date();
  simDate.setDate(simDate.getDate() + ((simDay - simDate.getDay() + 7) % 7));
  const sim = calculateStamps(rules, { amount: simAmount ?? 0, date: simDate }, business);

  return (
    <div className="page">
      <PageHead
        title="Reglas de sellos"
        subtitle="Definí cómo suman sellos tus clientes. Las reglas activas se acumulan entre sí."
        actions={
          <button className="btn primary" onClick={() => setEditing(blank('min_amount', business.id))}>
            <Icon name="plus" /> Nueva regla
          </button>
        }
      />

      <div className="grid grid-side">
        <div className="card flush">
          {rules.length ? (
            <div className="list" style={{ padding: '0 20px' }}>
              {rules.map((r) => (
                <div key={r.id} className="list-item" style={{ padding: '16px 0', opacity: r.active ? 1 : 0.55 }}>
                  <div className="avatar" style={{ borderRadius: 10 }}>
                    <Icon name={r.kind === 'weekday_bonus' ? 'clock' : r.kind === 'per_visit' ? 'store' : 'receipt'} size={17} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="subtle">{describeRule(r, money)}</div>
                  </div>
                  <label className="check" title={r.active ? 'Desactivar' : 'Activar'}>
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={() => run((d) => upsertRule(d, { ...r, active: !r.active } as RuleDraft).db)}
                    />
                    <span className="subtle">{r.active ? 'Activa' : 'Inactiva'}</span>
                  </label>
                  <button className="btn ghost icon" onClick={() => setEditing({ ...r } as RuleDraft)} aria-label="Editar">
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="btn ghost icon danger"
                    aria-label="Eliminar"
                    onClick={() => confirm(`¿Eliminar la regla "${r.name}"?`) && run((d) => deleteRule(d, r.id), 'Regla eliminada')}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Sin reglas" icon="rules">
              Sin reglas, las compras no suman sellos.
            </Empty>
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card stack">
            <h3>Simulador</h3>
            <p className="subtle">Probá cuántos sellos sumaría una compra.</p>
            <Field label="Monto">
              <NumberInput value={simAmount} onChange={setSimAmount} min={0} />
            </Field>
            <div className="chips">
              {WEEKDAYS.map((d, i) => (
                <button key={d} className={`chip ${simDay === i ? 'on' : ''}`} onClick={() => setSimDay(i)}>
                  {d}
                </button>
              ))}
            </div>
            <div className="preview-box">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--brand-strong)' }}>
                {sim.total} {sim.total === 1 ? 'sello' : 'sellos'}
              </div>
              <div className="subtle">
                {sim.breakdown.map((b) => `${b.name} (+${b.stamps})`).join(' · ') || 'Ninguna regla aplica'}
                {sim.capped && ' · tope aplicado'}
              </div>
            </div>
          </div>

          <BusinessSettings />
        </div>
      </div>

      {editing && <RuleModal draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BusinessSettings() {
  const { run } = useStore();
  const business = useBusiness();
  const [cap, setCap] = useState<number | undefined>(business.maxStampsPerPurchase);
  const [size, setSize] = useState<number | undefined>(business.cardSize);
  return (
    <div className="card stack" key={business.id}>
      <h3>Ajustes de la tarjeta</h3>
      <Field label="Tope de sellos por compra" hint="Vacío = sin tope">
        <NumberInput value={cap} onChange={setCap} min={1} />
      </Field>
      <Field label="Casilleros de la tarjeta" hint="Solo visual (entre 4 y 15)">
        <NumberInput value={size} onChange={setSize} min={4} />
      </Field>
      <button
        className="btn"
        onClick={() =>
          run(
            (d) =>
              updateBusiness(d, business.id, {
                maxStampsPerPurchase: cap && cap > 0 ? Math.floor(cap) : undefined,
                cardSize: Math.min(15, Math.max(4, Math.floor(size ?? 10))),
              }),
            'Ajustes guardados',
          )
        }
      >
        Guardar ajustes
      </button>
    </div>
  );
}

function RuleModal({ draft, onClose }: { draft: RuleDraft; onClose: () => void }) {
  const { run } = useStore();
  const [r, setR] = useState<RuleDraft>(draft);
  const isNew = !draft.id;
  const patch = (p: Partial<StampRule>) => setR({ ...r, ...p } as RuleDraft);

  return (
    <Modal
      title={isNew ? 'Nueva regla' : 'Editar regla'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => run((d) => upsertRule(d, r).db, 'Regla guardada') && onClose()}>
            Guardar
          </button>
        </>
      }
    >
      {isNew && (
        <div className="grid grid-2" style={{ gap: 8 }}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              className="card"
              style={{
                textAlign: 'left',
                padding: 12,
                cursor: 'pointer',
                borderColor: r.kind === k.kind ? 'var(--brand)' : undefined,
                background: r.kind === k.kind ? 'var(--brand-soft)' : undefined,
              }}
              onClick={() => setR(blank(k.kind, r.businessId))}
            >
              <div style={{ fontWeight: 600 }}>{k.title}</div>
              <div className="subtle">{k.desc}</div>
            </button>
          ))}
        </div>
      )}

      <Field label="Nombre">
        <input className="input" value={r.name} onChange={(e) => patch({ name: e.target.value })} />
      </Field>

      {r.kind === 'min_amount' && (
        <div className="grid grid-2">
          <Field label="Monto mínimo ($)">
            <NumberInput value={r.minAmount} onChange={(v) => patch({ minAmount: v ?? 0 })} />
          </Field>
          <Field label="Sellos">
            <NumberInput value={r.stamps} onChange={(v) => patch({ stamps: v ?? 0 })} />
          </Field>
        </div>
      )}
      {r.kind === 'per_amount' && (
        <div className="grid grid-3">
          <Field label="Cada ($)">
            <NumberInput value={r.stepAmount} onChange={(v) => patch({ stepAmount: v ?? 0 })} />
          </Field>
          <Field label="Sellos">
            <NumberInput value={r.stamps} onChange={(v) => patch({ stamps: v ?? 0 })} />
          </Field>
          <Field label="Máx. por compra">
            <NumberInput value={r.maxPerPurchase} onChange={(v) => patch({ maxPerPurchase: v } as Partial<StampRule>)} placeholder="Sin tope" />
          </Field>
        </div>
      )}
      {r.kind === 'per_visit' && (
        <div className="grid grid-2">
          <Field label="Sellos por compra">
            <NumberInput value={r.stamps} onChange={(v) => patch({ stamps: v ?? 0 })} />
          </Field>
          <Field label="Monto mínimo (opcional)">
            <NumberInput value={r.minAmount} onChange={(v) => patch({ minAmount: v } as Partial<StampRule>)} placeholder="Cualquiera" />
          </Field>
        </div>
      )}
      {r.kind === 'weekday_bonus' && (
        <>
          <Field label="Días">
            <div className="chips">
              {WEEKDAYS.map((d, i) => {
                const on = r.weekdays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${on ? 'on' : ''}`}
                    onClick={() => patch({ weekdays: on ? r.weekdays.filter((x) => x !== i) : [...r.weekdays, i].sort() } as Partial<StampRule>)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-2">
            <Field label="Sellos extra">
              <NumberInput value={r.extraStamps} onChange={(v) => patch({ extraStamps: v ?? 0 } as Partial<StampRule>)} />
            </Field>
            <Field label="Monto mínimo (opcional)">
              <NumberInput value={r.minAmount} onChange={(v) => patch({ minAmount: v } as Partial<StampRule>)} placeholder="Cualquiera" />
            </Field>
          </div>
        </>
      )}

      <div className="preview-box subtle">{describeRule({ ...r, id: 'x' } as StampRule, money)}</div>
    </Modal>
  );
}
