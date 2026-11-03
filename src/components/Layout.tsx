import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useBusiness, useStore } from '../data/store';
import { CATEGORY_LABEL } from '../lib/format';
import { Icon, Seal, type IconName } from './Icon';
import { Field, Toasts } from './ui';

const MERCHANT_NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/venta', label: 'Registrar compra', icon: 'receipt' },
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/premios', label: 'Premios y canjes', icon: 'gift' },
  { to: '/promociones', label: 'Promociones', icon: 'megaphone' },
];

const CONFIG_NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/reglas', label: 'Reglas de sellos', icon: 'rules' },
  { to: '/red', label: 'Red de intercambio', icon: 'network' },
];

export function Layout() {
  const { db, session, setSession, reset } = useStore();
  const business = useBusiness();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const isWallet = loc.pathname.startsWith('/billetera');

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const pending = db.agreements.filter((a) => a.status === 'pending' && a.toBusinessId === business.id).length;
  const issued = db.redemptions.filter((r) => r.status === 'issued' && r.businessId === business.id).length;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="btn ghost icon" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Icon name="menu" />
        </button>
        <Brand />
      </header>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand />

        <div className="mode-switch" role="tablist" aria-label="Modo">
          <NavLink to="/" className={!isWallet ? 'active' : ''}>
            Comercio
          </NavLink>
          <NavLink to="/billetera" className={isWallet ? 'active' : ''}>
            Cliente
          </NavLink>
        </div>

        {!isWallet ? (
          <>
            <Field label="Comercio activo">
              <select
                className="select"
                value={session.businessId}
                onChange={(e) => setSession({ businessId: e.target.value })}
              >
                {db.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {CATEGORY_LABEL[b.category]}
                  </option>
                ))}
              </select>
            </Field>

            <nav className="nav">
              {MERCHANT_NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  <Icon name={n.icon} />
                  {n.label}
                  {n.to === '/premios' && issued > 0 && <span className="badge brand">{issued}</span>}
                </NavLink>
              ))}
              <div className="nav-label">Configuración</div>
              {CONFIG_NAV.map((n) => (
                <NavLink key={n.to} to={n.to}>
                  <Icon name={n.icon} />
                  {n.label}
                  {n.to === '/red' && pending > 0 && <span className="badge brand">{pending}</span>}
                </NavLink>
              ))}
            </nav>
          </>
        ) : (
          <>
            <Field label="Ver como" hint="En producción, el cliente entra con su teléfono.">
              <select
                className="select"
                value={session.customerId}
                onChange={(e) => setSession({ customerId: e.target.value })}
              >
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <nav className="nav">
              <NavLink to="/billetera">
                <Icon name="wallet" />
                Mi billetera
              </NavLink>
            </nav>
          </>
        )}

        <div className="sidebar-foot">
          <button
            className="btn sm ghost"
            onClick={() => {
              if (confirm('¿Reiniciar la demo? Se pierden los cambios hechos.')) reset();
            }}
          >
            <Icon name="refresh" size={15} />
            Reiniciar demo
          </button>
          <span className="subtle" style={{ textAlign: 'center' }}>
            Demo v0.1 · datos guardados en este navegador
          </span>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}

function Brand() {
  return (
    <NavLink to="/" className="brand">
      <span className="brand-mark">
        <Seal size={30} detail={false} />
      </span>
      <span>
        <div className="brand-name">
          tu<b>Cliente</b>
        </div>
        <div className="brand-by">by Seven Cats</div>
      </span>
    </NavLink>
  );
}
