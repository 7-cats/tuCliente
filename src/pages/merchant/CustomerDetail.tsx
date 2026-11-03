import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useBusiness, useStore } from '../../data/store';
import { activeRewards, balancesForCustomer, byId, customerStats, isMember, nextReward, purchasesOf } from '../../domain/queries';
import { adjustStamps, cancelRedemption, markRedemptionUsed, redeemReward, updateCustomer, voidPurchase } from '../../domain/services';
import type { Redemption, StampTxKind } from '../../domain/types';
import { dateLong, dateTime, initials, money, plural, relativeDays } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Empty, Field, Modal, NumberInput } from '../../components/ui';
import { StampCard } from '../../components/StampCard';

const TX_LABEL: Record<StampTxKind, { label: string; cls: string }> = {
  earn: { label: 'Compra', cls: 'brand' },
  redeem: { label: 'Canje', cls: 'info' },
  exchange_in: { label: 'Intercambio recibido', cls: 'ok' },
  exchange_out: { label: 'Intercambio enviado', cls: 'warn' },
  adjust: { label: 'Ajuste', cls: '' },
  refund: { label: 'Devolución', cls: 'danger' },
};

type Tab = 'compras' | 'sellos' | 'canjes' | 'promos';

export function CustomerDetail() {
  const { id = '' } = useParams();
  const { db, run } = useStore();
  const business = useBusiness();
  const [tab, setTab] = useState<Tab>('compras');
  const [redeeming, setRedeeming] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [issuedCode, setIssuedCode] = useState<Redemption | null>(null);

  const customer = byId(db.customers, id);
  if (!customer || !isMember(db, customer.id, business.id)) return <Navigate to="/clientes" replace />;

  const stats = customerStats(db, business.id, customer);
  const purchases = purchasesOf(db, business.id, customer.id);
  const txs = db.transactions
    .filter((t) => t.customerId === customer.id && t.businessId === business.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const redemptions = db.redemptions
    .filter((r) => r.customerId === customer.id && r.businessId === business.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const promos = db.promotions
    .filter((p) => p.businessId === business.id && p.recipientIds.includes(customer.id))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const otherNetworks = balancesForCustomer(db, customer.id).filter((b) => b.business.id !== business.id);
  const rewards = activeRewards(db, business.id);

  return (
    <div className="page">
      <Link to="/clientes" className="link-arrow">
        <Icon name="arrowLeft" size={14} /> Clientes
      </Link>

      <div className="page-head">
        <div className="row" style={{ gap: 16 }}>
          <span className="avatar lg">{initials(customer.name)}</span>
          <div>
            <h1>{customer.name}</h1>
            <p className="muted row wrap" style={{ gap: 14, marginTop: 4 }}>
              {customer.phone && (
                <span className="row" style={{ gap: 5 }}>
                  <Icon name="phone" size={14} /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="row" style={{ gap: 5 }}>
                  <Icon name="mail" size={14} /> {customer.email}
                </span>
              )}
              {customer.dni && <span>DNI {customer.dni}</span>}
              <button className="link-arrow" onClick={() => setEditing(true)}>
                <Icon name="edit" size={13} /> Editar
              </button>
            </p>
          </div>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => setAdjusting(true)}>
            Ajustar sellos
          </button>
          <button className="btn" onClick={() => setRedeeming(true)}>
            <Icon name="gift" /> Canjear premio
          </button>
          <Link to={`/venta?cliente=${customer.id}`} className="btn primary">
            <Icon name="plus" /> Registrar compra
          </Link>
        </div>
      </div>

      <div className="grid grid-side">
        <div className="stack" style={{ gap: 16 }}>
          <div className="grid grid-4">
            <Stat label="Visitas" value={stats.visits} />
            <Stat label="Total gastado" value={money(stats.totalSpent)} />
            <Stat label="Ticket promedio" value={stats.visits ? money(stats.avgTicket) : '—'} />
            <Stat label="Última visita" value={relativeDays(stats.lastVisit)} />
          </div>

          <div className="card flush">
            <div className="tabs" style={{ padding: '0 12px' }}>
              {(
                [
                  ['compras', `Compras (${purchases.length})`],
                  ['sellos', `Movimientos (${txs.length})`],
                  ['canjes', `Canjes (${redemptions.length})`],
                  ['promos', `Promos (${promos.length})`],
                ] as [Tab, string][]
              ).map(([k, l]) => (
                <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>

            {tab === 'compras' &&
              (purchases.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Detalle</th>
                        <th className="r">Monto</th>
                        <th>Reglas aplicadas</th>
                        <th className="r">Sellos</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p) => (
                        <tr key={p.id}>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTime(p.date)}</td>
                          <td>{p.description ?? '—'}</td>
                          <td className="r num">{money(p.amount)}</td>
                          <td className="subtle">{p.appliedRules.map((r) => r.name).join(', ') || '—'}</td>
                          <td className="r">{p.stampsEarned ? <span className="badge brand">+{p.stampsEarned}</span> : '—'}</td>
                          <td className="r">
                            <button
                              className="btn ghost sm danger"
                              title="Anular compra"
                              onClick={() => {
                                if (confirm(`¿Anular la compra de ${money(p.amount)}? Se descontarán ${p.stampsEarned} sellos.`))
                                  run((d) => voidPurchase(d, p.id), 'Compra anulada');
                              }}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Sin compras" icon="receipt" />
              ))}

            {tab === 'sellos' &&
              (txs.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Nota</th>
                        <th className="r">Sellos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map((t) => (
                        <tr key={t.id}>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTime(t.date)}</td>
                          <td>
                            <span className={`badge ${TX_LABEL[t.kind].cls}`}>{TX_LABEL[t.kind].label}</span>
                          </td>
                          <td className="muted">{t.note ?? '—'}</td>
                          <td className="r num" style={{ color: t.delta > 0 ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>
                            {t.delta > 0 ? `+${t.delta}` : t.delta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Sin movimientos" icon="paw" />
              ))}

            {tab === 'canjes' &&
              (redemptions.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Premio</th>
                        <th>Código</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {redemptions.map((r) => (
                        <tr key={r.id}>
                          <td className="muted">{dateLong(r.createdAt)}</td>
                          <td>
                            {r.rewardName} <span className="subtle">· {r.stampsSpent} sellos</span>
                          </td>
                          <td className="mono">{r.code}</td>
                          <td>
                            <RedemptionBadge r={r} />
                          </td>
                          <td className="r">
                            {r.status === 'issued' && (
                              <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                                <button className="btn sm" onClick={() => run((d) => markRedemptionUsed(d, r.id), 'Canje marcado como usado')}>
                                  Marcar usado
                                </button>
                                <button className="btn sm ghost danger" onClick={() => run((d) => cancelRedemption(d, r.id), 'Canje cancelado, sellos devueltos')}>
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Sin canjes" icon="gift" />
              ))}

            {tab === 'promos' &&
              (promos.length ? (
                <div className="list" style={{ padding: '4px 20px' }}>
                  {promos.map((p) => (
                    <div key={p.id} className="list-item">
                      <Icon name="megaphone" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{p.title}</div>
                        <div className="subtle">{dateLong(p.sentAt)} · {p.channel}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="No recibió promociones" icon="megaphone" />
              ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <StampCard business={business} stamps={stats.stamps} next={nextReward(db, business.id, stats.stamps)} />
          <div className="card stack">
            <h3>Premios disponibles</h3>
            {rewards.length ? (
              rewards.map((r) => {
                const pct = Math.min(100, (stats.stamps / r.cost) * 100);
                return (
                  <div key={r.id} className="stack tight">
                    <div className="row between">
                      <span>{r.name}</span>
                      <span className="subtle num">
                        {Math.min(stats.stamps, r.cost)}/{r.cost}
                      </span>
                    </div>
                    <div className="progress">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="subtle">No hay premios activos.</p>
            )}
          </div>
          {otherNetworks.length > 0 && (
            <div className="card stack">
              <h3>En la red tuCliente</h3>
              <p className="subtle">Sellos de este cliente en otros comercios adheridos.</p>
              {otherNetworks.map((o) => (
                <div key={o.business.id} className="row between">
                  <span className="row">
                    <Icon name="store" size={16} />
                    {o.business.name}
                  </span>
                  <span className="badge">{plural(o.stamps, 'sello')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {redeeming && (
        <Modal title="Canjear premio" onClose={() => setRedeeming(false)}>
          <p className="muted">
            {customer.name} tiene <strong>{plural(stats.stamps, 'sello')}</strong> en {business.name}.
          </p>
          <div className="stack">
            {rewards.map((r) => {
              const can = stats.stamps >= r.cost;
              return (
                <div key={r.id} className="row between card" style={{ padding: 14 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="subtle">
                      {r.cost} sellos{r.stock != null ? ` · quedan ${r.stock}` : ''}
                      {r.minPurchase ? ` · compra mín. ${money(r.minPurchase)}` : ''}
                    </div>
                  </div>
                  <button
                    className="btn sm primary"
                    disabled={!can}
                    onClick={() => {
                      let red: Redemption | null = null as Redemption | null;
                      const ok = run((d) => {
                        const res = redeemReward(d, customer.id, r.id);
                        red = res.value;
                        return res.db;
                      });
                      if (ok && red) {
                        setRedeeming(false);
                        setIssuedCode(red);
                      }
                    }}
                  >
                    {can ? 'Canjear' : `Faltan ${r.cost - stats.stamps}`}
                  </button>
                </div>
              );
            })}
            {!rewards.length && <p className="subtle">No hay premios activos. Creá uno en Premios.</p>}
          </div>
        </Modal>
      )}

      {issuedCode && (
        <Modal
          title="¡Premio canjeado!"
          onClose={() => setIssuedCode(null)}
          footer={
            <>
              <button className="btn" onClick={() => setIssuedCode(null)}>
                Usar más tarde
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  run((d) => markRedemptionUsed(d, issuedCode.id), 'Premio entregado');
                  setIssuedCode(null);
                }}
              >
                Entregar ahora
              </button>
            </>
          }
        >
          <p className="muted">
            {issuedCode.rewardName} · se descontaron {issuedCode.stampsSpent} sellos.
          </p>
          <div className="code-box">{issuedCode.code}</div>
          <p className="subtle">El cliente también ve este código en su billetera.</p>
        </Modal>
      )}

      {adjusting && <AdjustModal customerId={customer.id} onClose={() => setAdjusting(false)} />}

      {editing && (
        <EditCustomerModal
          initial={customer}
          onClose={() => setEditing(false)}
          onSave={(patch) => run((d) => updateCustomer(d, customer.id, patch), 'Datos actualizados') && setEditing(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card kpi" style={{ padding: 16 }}>
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 22 }}>
        {value}
      </div>
    </div>
  );
}

export function RedemptionBadge({ r }: { r: Redemption }) {
  if (r.status === 'issued') return <span className="badge warn">Pendiente</span>;
  if (r.status === 'used') return <span className="badge ok">Usado</span>;
  return <span className="badge">Cancelado</span>;
}

function AdjustModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { run } = useStore();
  const business = useBusiness();
  const [delta, setDelta] = useState<number | undefined>(1);
  const [note, setNote] = useState('');
  return (
    <Modal
      title="Ajustar sellos"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            onClick={() => run((d) => adjustStamps(d, customerId, business.id, delta ?? 0, note), 'Ajuste registrado') && onClose()}
          >
            Guardar ajuste
          </button>
        </>
      }
    >
      <p className="muted">Usalo para corregir errores o regalar sellos. Queda registrado en el historial con el motivo.</p>
      <Field label="Sellos (negativo para restar)">
        <NumberInput value={delta} onChange={setDelta} />
      </Field>
      <Field label="Motivo">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: regalo de cumpleaños" />
      </Field>
    </Modal>
  );
}

function EditCustomerModal({
  initial,
  onClose,
  onSave,
}: {
  initial: { name: string; phone?: string; email?: string; dni?: string };
  onClose: () => void;
  onSave: (p: { name: string; phone?: string; email?: string; dni?: string }) => void;
}) {
  const [f, setF] = useState({ name: initial.name, phone: initial.phone ?? '', email: initial.email ?? '', dni: initial.dni ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      title="Editar cliente"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => onSave({ name: f.name.trim() || initial.name, phone: f.phone || undefined, email: f.email || undefined, dni: f.dni || undefined })}>
            Guardar
          </button>
        </>
      }
    >
      <Field label="Nombre">
        <input className="input" value={f.name} onChange={set('name')} />
      </Field>
      <div className="grid grid-2">
        <Field label="Teléfono">
          <input className="input" value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="DNI">
          <input className="input" value={f.dni} onChange={set('dni')} />
        </Field>
      </div>
      <Field label="Email">
        <input className="input" value={f.email} onChange={set('email')} />
      </Field>
    </Modal>
  );
}
