import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusiness, useStore } from '../../data/store';
import { customerStats, customersOf } from '../../domain/queries';
import { initials, money, relativeDays } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Empty, PageHead } from '../../components/ui';
import { NewCustomerModal } from './NewPurchase';

type Sort = 'recent' | 'spent' | 'stamps' | 'name';

export function Customers() {
  const { db } = useStore();
  const business = useBusiness();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const list = customersOf(db, business.id)
      .filter(
        (c) =>
          !term ||
          c.name.toLowerCase().includes(term) ||
          (digits && (c.phone?.replace(/\D/g, '').includes(digits) || c.dni?.includes(digits))) ||
          c.email?.toLowerCase().includes(term),
      )
      .map((c) => customerStats(db, business.id, c));
    const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      recent: (a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''),
      spent: (a, b) => b.totalSpent - a.totalSpent,
      stamps: (a, b) => b.stamps - a.stamps,
      name: (a, b) => a.customer.name.localeCompare(b.customer.name),
    };
    return list.sort(by[sort]);
  }, [db, business.id, q, sort]);

  return (
    <div className="page">
      <PageHead
        title="Clientes"
        subtitle={`${rows.length} clientes adheridos a ${business.name}`}
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            Nuevo cliente
          </button>
        }
      />

      <div className="row wrap">
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Icon name="search" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar por nombre, teléfono, DNI o email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="recent">Última visita</option>
          <option value="spent">Mayor gasto</option>
          <option value="stamps">Más sellos</option>
          <option value="name">Nombre</option>
        </select>
      </div>

      <div className="card flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="hide-sm">Contacto</th>
                  <th className="r">Visitas</th>
                  <th className="r">Gastado</th>
                  <th className="r hide-sm">Ticket prom.</th>
                  <th>Última visita</th>
                  <th className="r">Sellos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.customer.id} className="click" onClick={() => nav(`/clientes/${s.customer.id}`)}>
                    <td>
                      <div className="row">
                        <span className="avatar">{initials(s.customer.name)}</span>
                        <strong style={{ fontWeight: 500 }}>{s.customer.name}</strong>
                      </div>
                    </td>
                    <td className="muted hide-sm">{s.customer.phone ?? s.customer.email ?? '—'}</td>
                    <td className="r num">{s.visits}</td>
                    <td className="r num">{money(s.totalSpent)}</td>
                    <td className="r num muted hide-sm">{s.visits ? money(s.avgTicket) : '—'}</td>
                    <td className="muted">{relativeDays(s.lastVisit)}</td>
                    <td className="r">
                      <span className="badge brand">{s.stamps}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={q ? 'Sin resultados' : 'Todavía no hay clientes'} icon="users">
            {q ? `No hay clientes que coincidan con "${q}".` : 'Sumá tu primer cliente al registrar una compra.'}
          </Empty>
        )}
      </div>

      {creating && <NewCustomerModal onClose={() => setCreating(false)} onCreated={(c) => nav(`/clientes/${c.id}`)} />}
    </div>
  );
}
