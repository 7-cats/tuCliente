import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBusiness, useStore } from '../../data/store';
import { byId, isRewardAvailable } from '../../domain/queries';
import { cancelRedemption, deleteReward, markRedemptionUsed, upsertReward } from '../../domain/services';
import type { Reward, RewardKind } from '../../domain/types';
import { dateLong, money, toDateInput } from '../../lib/format';
import { Icon, Paw } from '../../components/Icon';
import { Empty, Field, Modal, NumberInput, PageHead } from '../../components/ui';
import { RedemptionBadge } from './CustomerDetail';

const KIND_LABEL: Record<RewardKind, string> = {
  discount_percent: '% de descuento',
  discount_amount: '$ de descuento',
  free_item: 'Producto gratis',
  other: 'Otro beneficio',
};

type Draft = Omit<Reward, 'id'> & { id?: string };

export function Rewards() {
  const { db, run } = useStore();
  const business = useBusiness();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [code, setCode] = useState('');
  const rewards = db.rewards.filter((r) => r.businessId === business.id);
  const redemptions = db.redemptions
    .filter((r) => r.businessId === business.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = redemptions.filter((r) => r.status === 'issued');
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const found = normalized.length >= 6 ? pending.find((r) => r.code.replace('-', '') === normalized) : undefined;

  return (
    <div className="page">
      <PageHead
        title="Premios y canjes"
        subtitle="Lo que tus clientes pueden canjear con sus sellos."
        actions={
          <button
            className="btn primary"
            onClick={() => setEditing({ businessId: business.id, name: '', kind: 'free_item', cost: 5, active: true, stock: null })}
          >
            <Icon name="plus" /> Nuevo premio
          </button>
        }
      />

      <div className="grid grid-3">
        {rewards.map((r) => {
          const available = isRewardAvailable(r);
          const used = db.redemptions.filter((x) => x.rewardId === r.id && x.status !== 'cancelled').length;
          return (
            <div key={r.id} className="card reward-card" style={{ opacity: available ? 1 : 0.6 }}>
              <div className="row between">
                <span className="badge">{KIND_LABEL[r.kind]}</span>
                {!available && <span className="badge danger">{!r.active ? 'Inactivo' : r.stock === 0 ? 'Sin stock' : 'Vencido'}</span>}
              </div>
              <h3>{r.name}</h3>
              {r.description && <p className="subtle">{r.description}</p>}
              <div className="reward-cost">
                <Paw size={18} /> {r.cost} sellos
              </div>
              <div className="subtle">
                {[
                  r.minPurchase && `Compra mín. ${money(r.minPurchase)}`,
                  r.stock != null && `Stock: ${r.stock}`,
                  r.validUntil && `Hasta ${dateLong(r.validUntil)}`,
                  `${used} canjes`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="row" style={{ marginTop: 'auto' }}>
                <button className="btn sm" onClick={() => setEditing({ ...r })}>
                  <Icon name="edit" size={14} /> Editar
                </button>
                <button
                  className="btn sm ghost danger"
                  onClick={() => confirm(`¿Eliminar "${r.name}"?`) && run((d) => deleteReward(d, r.id), used ? 'Premio desactivado (tiene canjes)' : 'Premio eliminado')}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {!rewards.length && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <Empty title="Todavía no hay premios" icon="gift">
              Creá el primero para que tus clientes tengan un objetivo.
            </Empty>
          </div>
        )}
      </div>

      <div className="grid grid-side">
        <div className="card flush">
          <div className="card-head" style={{ padding: '18px 20px 0' }}>
            <h3>Historial de canjes</h3>
            <span className="subtle">{pending.length} pendientes</span>
          </div>
          {redemptions.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Premio</th>
                    <th>Código</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.slice(0, 30).map((r) => (
                    <tr key={r.id}>
                      <td className="muted">{dateLong(r.createdAt)}</td>
                      <td>
                        <Link to={`/clientes/${r.customerId}`}>{byId(db.customers, r.customerId)?.name}</Link>
                      </td>
                      <td>{r.rewardName}</td>
                      <td className="mono">{r.code}</td>
                      <td>
                        <RedemptionBadge r={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Sin canjes todavía" icon="ticket" />
          )}
        </div>

        <div className="card stack">
          <h3>Validar código</h3>
          <p className="subtle">El cliente puede canjear desde su billetera y mostrarte el código.</p>
          <input className="input mono" placeholder="ABC-123" value={code} onChange={(e) => setCode(e.target.value)} style={{ textTransform: 'uppercase', fontSize: 18 }} />
          {found ? (
            <div className="preview-box stack tight">
              <strong>{found.rewardName}</strong>
              <span className="subtle">
                {byId(db.customers, found.customerId)?.name} · {dateLong(found.createdAt)}
              </span>
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn sm primary" onClick={() => run((d) => markRedemptionUsed(d, found.id), 'Premio entregado') && setCode('')}>
                  Entregar
                </button>
                <button className="btn sm ghost danger" onClick={() => run((d) => cancelRedemption(d, found.id), 'Canje cancelado') && setCode('')}>
                  Cancelar canje
                </button>
              </div>
            </div>
          ) : (
            normalized.length >= 6 && <p className="subtle">No hay un canje pendiente con ese código.</p>
          )}
        </div>
      </div>

      {editing && <RewardModal draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RewardModal({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { run } = useStore();
  const [r, setR] = useState<Draft>(draft);
  const p = (x: Partial<Draft>) => setR({ ...r, ...x });
  return (
    <Modal
      title={draft.id ? 'Editar premio' : 'Nuevo premio'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => run((d) => upsertReward(d, r).db, 'Premio guardado') && onClose()}>
            Guardar
          </button>
        </>
      }
    >
      <Field label="Nombre">
        <input className="input" value={r.name} onChange={(e) => p({ name: e.target.value })} placeholder="Ej: Café gratis" autoFocus />
      </Field>
      <Field label="Descripción (opcional)">
        <input className="input" value={r.description ?? ''} onChange={(e) => p({ description: e.target.value || undefined })} />
      </Field>
      <div className="grid grid-2">
        <Field label="Tipo">
          <select className="select" value={r.kind} onChange={(e) => p({ kind: e.target.value as RewardKind })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {(r.kind === 'discount_percent' || r.kind === 'discount_amount') && (
          <Field label={r.kind === 'discount_percent' ? 'Porcentaje' : 'Monto ($)'}>
            <NumberInput value={r.value} onChange={(v) => p({ value: v })} min={1} />
          </Field>
        )}
      </div>
      <div className="grid grid-2">
        <Field label="Costo en sellos">
          <NumberInput value={r.cost} onChange={(v) => p({ cost: v ?? 0 })} min={1} />
        </Field>
        <Field label="Compra mínima (opcional)">
          <NumberInput value={r.minPurchase} onChange={(v) => p({ minPurchase: v })} placeholder="Sin mínimo" />
        </Field>
      </div>
      <div className="grid grid-2">
        <Field label="Stock" hint="Vacío = ilimitado">
          <NumberInput value={r.stock ?? undefined} onChange={(v) => p({ stock: v ?? null })} min={0} />
        </Field>
        <Field label="Válido hasta (opcional)">
          <input
            className="input"
            type="date"
            value={r.validUntil ? toDateInput(new Date(r.validUntil)) : ''}
            onChange={(e) => p({ validUntil: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined })}
          />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={r.active} onChange={(e) => p({ active: e.target.checked })} />
        Activo (visible para clientes)
      </label>
    </Modal>
  );
}
