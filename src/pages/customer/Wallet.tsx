import { useState } from 'react';
import { useStore } from '../../data/store';
import {
  activeRewards,
  balance,
  balancesForCustomer,
  byId,
  maxExchangeUnits,
  nextReward,
  routesFrom,
  type ExchangeRoute,
} from '../../domain/queries';
import { exchangeStamps, redeemReward, renderMessage } from '../../domain/services';
import type { Redemption } from '../../domain/types';
import { dateLong, dateShort, plural } from '../../lib/format';
import { Icon, Paw } from '../../components/Icon';
import { Empty, Modal } from '../../components/ui';
import { StampCard } from '../../components/StampCard';

export function Wallet() {
  const { db, session, run } = useStore();
  const customer = session.customerId ? byId(db.customers, session.customerId) : db.customers[0];
  const cards = customer ? balancesForCustomer(db, customer.id).sort((a, b) => b.stamps - a.stamps) : [];
  const [selected, setSelected] = useState<string | undefined>();
  const [exchanging, setExchanging] = useState<ExchangeRoute | null>(null);
  const [code, setCode] = useState<Redemption | null>(null);

  if (!customer) return <Empty title="No hay clientes en la demo" icon="users" />;

  const current = cards.find((c) => c.business.id === selected) ?? cards[0];
  const total = cards.reduce((a, c) => a + c.stamps, 0);
  const pendingCodes = db.redemptions.filter((r) => r.customerId === customer.id && r.status === 'issued');
  const inbox = db.promotions
    .filter((p) => p.recipientIds.includes(customer.id))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 5);

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head">
        <div>
          <p className="muted">Hola,</p>
          <h1>{customer.name.split(' ')[0]} 👋</h1>
        </div>
        <div className="card row" style={{ padding: '12px 18px' }}>
          <Paw size={22} style={{ color: 'var(--brand)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{total}</div>
            <div className="subtle">sellos en {plural(cards.length, 'comercio')}</div>
          </div>
        </div>
      </div>

      {pendingCodes.length > 0 && (
        <div className="card stack">
          <h3>Tus premios para usar</h3>
          <div className="grid grid-3">
            {pendingCodes.map((r) => (
              <button key={r.id} className="preview-box stack tight" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setCode(r)}>
                <strong>{r.rewardName}</strong>
                <span className="subtle">{byId(db.businesses, r.businessId)?.name}</span>
                <span className="mono" style={{ color: 'var(--brand-strong)', fontWeight: 600 }}>
                  {r.code}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <Empty title="Todavía no tenés tarjetas" icon="wallet">
          Pedí que te sumen en tu próximo comercio adherido.
        </Empty>
      ) : (
        <>
          <div className="grid grid-3">
            {cards.map((c) => (
              <button
                key={c.business.id}
                onClick={() => setSelected(c.business.id)}
                style={{
                  border: 'none',
                  padding: 0,
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: 'var(--radius-lg)',
                  outline: current?.business.id === c.business.id ? '3px solid var(--brand-soft-2)' : 'none',
                  outlineOffset: 3,
                }}
              >
                <StampCard compact business={c.business} stamps={c.stamps} next={nextReward(db, c.business.id, c.stamps)} />
              </button>
            ))}
          </div>

          {current && (
            <div className="grid grid-2">
              <div className="card stack">
                <div className="row between">
                  <h3>Premios en {current.business.name}</h3>
                  <span className="badge brand">{plural(current.stamps, 'sello')}</span>
                </div>
                {activeRewards(db, current.business.id).map((r) => {
                  const can = current.stamps >= r.cost;
                  return (
                    <div key={r.id} className="stack tight" style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                      <div className="row between">
                        <div>
                          <div style={{ fontWeight: 500 }}>{r.name}</div>
                          <div className="subtle">
                            {r.cost} sellos{r.description ? ` · ${r.description}` : ''}
                          </div>
                        </div>
                        <button
                          className={`btn sm ${can ? 'primary' : ''}`}
                          disabled={!can}
                          onClick={() => {
                            if (!confirm(`¿Canjear ${r.cost} sellos por "${r.name}"?`)) return;
                            let red = null as Redemption | null;
                            const ok = run((d) => {
                              const res = redeemReward(d, customer.id, r.id);
                              red = res.value;
                              return res.db;
                            });
                            if (ok && red) setCode(red);
                          }}
                        >
                          {can ? 'Canjear' : `Faltan ${r.cost - current.stamps}`}
                        </button>
                      </div>
                      <div className="progress">
                        <div style={{ width: `${Math.min(100, (current.stamps / r.cost) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
                {!activeRewards(db, current.business.id).length && <p className="subtle">Este comercio todavía no cargó premios.</p>}
              </div>

              <div className="card stack">
                <h3>Usá tus sellos en otros comercios</h3>
                <p className="subtle">Convertí sellos de {current.business.name} gracias a la red de intercambio.</p>
                {routesFrom(db, current.business.id).length ? (
                  routesFrom(db, current.business.id).map((route) => {
                    const to = byId(db.businesses, route.toBusinessId)!;
                    const max = maxExchangeUnits(db, customer.id, route);
                    return (
                      <div key={route.agreement.id + route.toBusinessId} className="row between" style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div className="row" style={{ gap: 6, fontWeight: 500 }}>
                            <Icon name="swap" size={15} /> {to.name}
                          </div>
                          <div className="subtle">
                            {route.give} → {route.get} sello{route.get > 1 ? 's' : ''}
                            {route.agreement.monthlyLimit ? ` · tope ${route.agreement.monthlyLimit}/mes` : ''}
                          </div>
                        </div>
                        <button className="btn sm" disabled={max < 1} onClick={() => setExchanging(route)}>
                          {max < 1 ? (current.stamps < route.give ? `Necesitás ${route.give}` : 'Tope alcanzado') : 'Convertir'}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="subtle">{current.business.name} todavía no tiene acuerdos de intercambio activos.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid grid-2">
        <div className="card stack">
          <h3>Mensajes</h3>
          {inbox.length ? (
            inbox.map((p) => {
              const b = byId(db.businesses, p.businessId);
              return (
                <div key={p.id} className="stack tight" style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div className="row between">
                    <strong>{p.title}</strong>
                    <span className="subtle">{dateShort(p.sentAt)}</span>
                  </div>
                  <span className="subtle">{b?.name}</span>
                  <p className="muted" style={{ fontSize: 14 }}>
                    {renderMessage(p.message, { nombre: customer.name, sellos: balance(db, customer.id, p.businessId), comercio: b?.name ?? '' })}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="subtle">Sin mensajes por ahora.</p>
          )}
        </div>
        <div className="card stack">
          <h3>Actividad reciente</h3>
          {db.transactions
            .filter((t) => t.customerId === customer.id)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 7)
            .map((t) => (
              <div key={t.id} className="row between">
                <div>
                  <div style={{ fontSize: 14 }}>{byId(db.businesses, t.businessId)?.name}</div>
                  <div className="subtle">
                    {dateShort(t.date)} · {t.note ?? (t.kind === 'earn' ? 'Compra' : t.kind)}
                  </div>
                </div>
                <span className="num" style={{ fontWeight: 600, color: t.delta > 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  {t.delta > 0 ? `+${t.delta}` : t.delta}
                </span>
              </div>
            ))}
        </div>
      </div>

      {exchanging && (
        <ExchangeModal customerId={customer.id} route={exchanging} onClose={() => setExchanging(null)} onDone={(to) => { setExchanging(null); setSelected(to); }} />
      )}

      {code && (
        <Modal title={code.rewardName} onClose={() => setCode(null)}>
          <p className="muted">Mostrá este código en {byId(db.businesses, code.businessId)?.name} para recibir tu premio.</p>
          <div className="code-box">{code.code}</div>
          <p className="subtle">Canjeado el {dateLong(code.createdAt)}.</p>
        </Modal>
      )}
    </div>
  );
}

function ExchangeModal({
  customerId,
  route,
  onClose,
  onDone,
}: {
  customerId: string;
  route: ExchangeRoute;
  onClose: () => void;
  onDone: (toBusinessId: string) => void;
}) {
  const { db, run } = useStore();
  const max = maxExchangeUnits(db, customerId, route);
  const [units, setUnits] = useState(1);
  const from = byId(db.businesses, route.fromBusinessId)!;
  const to = byId(db.businesses, route.toBusinessId)!;
  return (
    <Modal
      title="Convertir sellos"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            onClick={() =>
              run(
                (d) => exchangeStamps(d, { customerId, agreementId: route.agreement.id, fromBusinessId: route.fromBusinessId, units }).db,
                `¡Listo! Sumaste ${plural(route.get * units, 'sello')} en ${to.name}`,
              ) && onDone(to.id)
            }
          >
            Convertir
          </button>
        </>
      }
    >
      <div className="grid grid-2" style={{ alignItems: 'center' }}>
        <div className="preview-box" style={{ textAlign: 'center' }}>
          <div className="subtle">Entregás</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>{route.give * units}</div>
          <div className="subtle">{from.name}</div>
        </div>
        <div className="preview-box" style={{ textAlign: 'center', background: 'var(--ok-soft)', borderColor: 'transparent' }}>
          <div className="subtle">Recibís</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, color: 'var(--ok)' }}>{route.get * units}</div>
          <div className="subtle">{to.name}</div>
        </div>
      </div>
      <input type="range" min={1} max={Math.max(1, max)} value={units} onChange={(e) => setUnits(Number(e.target.value))} style={{ accentColor: 'var(--brand)' }} />
      <p className="subtle">
        Tenés {balance(db, customerId, from.id)} sellos en {from.name}. Podés convertir hasta {route.give * max}.
      </p>
    </Modal>
  );
}
