import { Link, useNavigate } from 'react-router-dom';
import { useBusiness, useStore } from '../../data/store';
import { byId, customerStats, customersOf } from '../../domain/queries';
import { dateTime, initials, money, relativeDays } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Empty, Kpi, PageHead } from '../../components/ui';

const DAY = 86_400_000;

export function Dashboard() {
  const { db } = useStore();
  const business = useBusiness();
  const nav = useNavigate();
  const now = Date.now();
  const since = now - 30 * DAY;

  const purchases = db.purchases.filter((p) => p.businessId === business.id);
  const last30 = purchases.filter((p) => new Date(p.date).getTime() >= since);
  const revenue = last30.reduce((a, p) => a + p.amount, 0);
  const stampsIssued = db.transactions
    .filter((t) => t.businessId === business.id && t.kind === 'earn' && new Date(t.date).getTime() >= since)
    .reduce((a, t) => a + t.delta, 0);
  const redemptions30 = db.redemptions.filter(
    (r) => r.businessId === business.id && r.status !== 'cancelled' && new Date(r.createdAt).getTime() >= since,
  ).length;
  const customers = customersOf(db, business.id);
  const activeCustomers = new Set(last30.map((p) => p.customerId)).size;

  // Ventas por semana (últimas 8)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const total = purchases
      .filter((p) => {
        const t = new Date(p.date).getTime();
        return t > start && t <= end;
      })
      .reduce((a, p) => a + p.amount, 0);
    return { label: new Date(end).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), total };
  });
  const maxWeek = Math.max(1, ...weeks.map((w) => w.total));

  const recent = [...purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const top = customers
    .map((c) => customerStats(db, business.id, c))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5);
  const issued = db.redemptions.filter((r) => r.businessId === business.id && r.status === 'issued');
  const pendingAgreements = db.agreements.filter((a) => a.status === 'pending' && a.toBusinessId === business.id);

  return (
    <div className="page">
      <PageHead
        title={`Hola, ${business.name}`}
        subtitle="Así viene tu programa de fidelización en los últimos 30 días."
        actions={
          <Link to="/venta" className="btn primary">
            <Icon name="plus" />
            Registrar compra
          </Link>
        }
      />

      {pendingAgreements.length > 0 && (
        <div className="preview-box row between wrap">
          <div className="row">
            <Icon name="network" />
            <span>
              Tenés {pendingAgreements.length} propuesta{pendingAgreements.length > 1 ? 's' : ''} de intercambio de sellos de{' '}
              <strong>{pendingAgreements.map((a) => byId(db.businesses, a.fromBusinessId)?.name).join(', ')}</strong>.
            </span>
          </div>
          <Link to="/red" className="btn sm primary">
            Revisar
          </Link>
        </div>
      )}

      <div className="grid grid-4">
        <Kpi icon="users" label="Clientes adheridos" value={customers.length} hint={`${activeCustomers} compraron este mes`} />
        <Kpi icon="trend" label="Ventas registradas" value={money(revenue)} hint={`${last30.length} compras`} />
        <Kpi icon="paw" label="Sellos entregados" value={stampsIssued} hint="por compras" />
        <Kpi icon="gift" label="Canjes" value={redemptions30} hint={`${issued.length} pendientes de usar`} />
      </div>

      <div className="grid grid-side">
        <div className="card">
          <div className="card-head">
            <h3>Ventas por semana</h3>
            <span className="subtle">últimas 8 semanas</span>
          </div>
          <div className="bars">
            {weeks.map((w) => (
              <div className="bar" key={w.label} title={money(w.total)}>
                <div style={{ height: `${(w.total / maxWeek) * 100}%` }} />
                <span>{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Mejores clientes</h3>
            <Link to="/clientes" className="link-arrow">
              Ver todos <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          {top.length ? (
            <div className="list">
              {top.map((s) => (
                <Link key={s.customer.id} to={`/clientes/${s.customer.id}`} className="list-item" style={{ textDecoration: 'none' }}>
                  <span className="avatar">{initials(s.customer.name)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{s.customer.name}</div>
                    <div className="subtle">
                      {s.visits} visitas · {money(s.totalSpent)}
                    </div>
                  </div>
                  <span className="badge brand">{s.stamps} sellos</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Todavía no hay clientes" icon="users" />
          )}
        </div>
      </div>

      <div className="card flush">
        <div className="card-head" style={{ padding: '18px 20px 0' }}>
          <h3>Últimas compras</h3>
        </div>
        {recent.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="hide-sm">Detalle</th>
                  <th>Fecha</th>
                  <th className="r">Monto</th>
                  <th className="r">Sellos</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => {
                  const c = byId(db.customers, p.customerId);
                  return (
                    <tr key={p.id} className="click" onClick={() => nav(`/clientes/${p.customerId}`)}>
                      <td>{c?.name}</td>
                      <td className="muted hide-sm">{p.description ?? '—'}</td>
                      <td className="muted" title={dateTime(p.date)}>
                        {relativeDays(p.date)}
                      </td>
                      <td className="r num">{money(p.amount)}</td>
                      <td className="r">{p.stampsEarned > 0 ? <span className="badge brand">+{p.stampsEarned}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Sin compras todavía" icon="receipt">
            <Link to="/venta" className="btn primary sm">
              Registrar la primera
            </Link>
          </Empty>
        )}
      </div>
    </div>
  );
}
