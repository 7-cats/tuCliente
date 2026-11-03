import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBusiness, useStore } from '../../data/store';
import { balance, byId, customersOf, nextReward } from '../../domain/queries';
import { calculateStamps } from '../../domain/rules';
import { enrollCustomer, findCustomer, recordPurchase, type CustomerInput } from '../../domain/services';
import type { Customer, Purchase } from '../../domain/types';
import { initials, money, plural, toDateInput } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Field, Modal, NumberInput, PageHead } from '../../components/ui';
import { StampCard } from '../../components/StampCard';

/**
 * Flujo de caja: buscar cliente (o darlo de alta) → monto → confirmar.
 * Muestra en vivo cuántos sellos va a sumar según las reglas activas.
 */
export function NewPurchase() {
  const { db, run } = useStore();
  const business = useBusiness();
  const [params] = useSearchParams();
  const [customerId, setCustomerId] = useState<string | undefined>(params.get('cliente') ?? undefined);
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState<number | undefined>();
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(toDateInput());
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState<Purchase | null>(null);

  const customer = customerId ? byId(db.customers, customerId) : undefined;
  const members = customersOf(db, business.id);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    return members
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && (c.phone?.replace(/\D/g, '').includes(digits) || c.dni?.includes(digits))) ||
          c.email?.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [query, members]);

  // Cliente de OTRO comercio de la red que coincide por teléfono/DNI → se puede adherir en un click.
  const globalMatch = useMemo(() => {
    if (results.length) return undefined;
    const digits = query.replace(/\D/g, '');
    if (digits.length < 6) return undefined;
    const c = findCustomer(db, { phone: digits, dni: digits });
    return c && !members.some((m) => m.id === c.id) ? c : undefined;
  }, [db, query, results.length, members]);

  const purchaseDate = useMemo(() => {
    const d = new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [date]);

  const rules = db.stampRules.filter((r) => r.businessId === business.id);
  const preview = calculateStamps(rules, { amount: amount ?? 0, date: purchaseDate }, business);
  const current = customer ? balance(db, customer.id, business.id) : 0;

  function enrollExisting(c: Customer) {
    run((d) => enrollCustomer(d, business.id, c).db, `${c.name} se adhirió a ${business.name}`);
    setCustomerId(c.id);
    setQuery('');
  }

  function submit() {
    if (!customer || !amount) return;
    let created = null as Purchase | null;
    const ok = run((d) => {
      const r = recordPurchase(d, {
        businessId: business.id,
        customerId: customer.id,
        amount,
        date: purchaseDate,
        description,
      });
      created = r.value;
      return r.db;
    });
    if (ok && created) {
      setDone(created);
      setAmount(undefined);
      setDescription('');
    }
  }

  if (done && customer) {
    const after = balance(db, customer.id, business.id);
    return (
      <div className="page" style={{ maxWidth: 560 }}>
        <div className="card stack" style={{ gap: 18, textAlign: 'center', alignItems: 'center' }}>
          <div className="empty" style={{ padding: 0 }}>
            <div className="icon-wrap">
              <Icon name="check" size={26} />
            </div>
          </div>
          <h2>¡Compra registrada!</h2>
          <p className="muted">
            {money(done.amount)} · {customer.name}{' '}
            {done.stampsEarned > 0 ? `sumó ${plural(done.stampsEarned, 'sello')}` : 'no sumó sellos esta vez'}.
          </p>
          <div style={{ width: '100%', textAlign: 'left' }}>
            <StampCard business={business} stamps={after} next={nextReward(db, business.id, after)} />
          </div>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => setDone(null)}>
              Otra compra para {customer.name.split(' ')[0]}
            </button>
            <button
              className="btn"
              onClick={() => {
                setDone(null);
                setCustomerId(undefined);
              }}
            >
              Nuevo cliente
            </button>
            <Link to={`/clientes/${customer.id}`} className="btn ghost">
              Ver ficha
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Registrar compra" subtitle="Cargá la compra y los sellos se calculan solos según tus reglas." />

      <div className="grid grid-side">
        <div className="stack" style={{ gap: 16 }}>
          {/* Paso 1: cliente */}
          <div className="card stack">
            <div className="row between">
              <h3>1 · Cliente</h3>
              {customer && (
                <button className="link-arrow" onClick={() => setCustomerId(undefined)}>
                  Cambiar
                </button>
              )}
            </div>
            {customer ? (
              <div className="row">
                <span className="avatar lg">{initials(customer.name)}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{customer.name}</div>
                  <div className="subtle">{[customer.phone, customer.dni && `DNI ${customer.dni}`].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="spacer" />
                <span className="badge brand">{plural(current, 'sello')}</span>
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <Icon name="search" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 38 }}
                    placeholder="Buscar por nombre, teléfono o DNI"
                    value={query}
                    autoFocus
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {results.length > 0 && (
                  <div className="list">
                    {results.map((c) => (
                      <button
                        key={c.id}
                        className="list-item"
                        style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
                        onClick={() => {
                          setCustomerId(c.id);
                          setQuery('');
                        }}
                      >
                        <span className="avatar">{initials(c.name)}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{c.name}</div>
                          <div className="subtle">{c.phone}</div>
                        </div>
                        <span className="badge">{balance(db, c.id, business.id)} sellos</span>
                      </button>
                    ))}
                  </div>
                )}
                {globalMatch && (
                  <div className="preview-box row between wrap">
                    <span>
                      <strong>{globalMatch.name}</strong> ya es cliente de la red tuCliente. ¿Lo adherís a {business.name}?
                    </span>
                    <button className="btn sm primary" onClick={() => enrollExisting(globalMatch)}>
                      Adherir
                    </button>
                  </div>
                )}
                {query && !results.length && !globalMatch && <p className="subtle">No encontramos a nadie con "{query}".</p>}
                <button className="btn" onClick={() => setCreating(true)}>
                  <Icon name="plus" />
                  Nuevo cliente
                </button>
              </>
            )}
          </div>

          {/* Paso 2: compra */}
          <div className="card stack" style={{ opacity: customer ? 1 : 0.55, pointerEvents: customer ? 'auto' : 'none' }}>
            <h3>2 · Compra</h3>
            <Field label="Monto total">
              <NumberInput className="input lg" value={amount} onChange={setAmount} min={0} placeholder="$ 0" />
            </Field>
            <div className="grid grid-2">
              <Field label="Detalle (opcional)">
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: 2 cafés + medialunas" />
              </Field>
              <Field label="Fecha">
                <input className="input" type="date" value={date} max={toDateInput()} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        {/* Resumen */}
        <div className="card stack" style={{ position: 'sticky', top: 20 }}>
          <h3>Resumen</h3>
          <div className="preview-box stack tight">
            <span className="subtle">Esta compra suma</span>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 600, color: 'var(--brand-strong)', lineHeight: 1 }}>
                {preview.total}
              </span>
              <span className="muted">{preview.total === 1 ? 'sello' : 'sellos'}</span>
            </div>
          </div>
          {preview.breakdown.length > 0 ? (
            <div className="list">
              {preview.breakdown.map((b) => (
                <div key={b.ruleId} className="list-item" style={{ padding: '8px 0' }}>
                  <Icon name="check" size={15} style={{ color: 'var(--ok)' }} />
                  <span style={{ flex: 1 }}>{b.name}</span>
                  <span className="num">+{b.stamps}</span>
                </div>
              ))}
              {preview.capped && <p className="subtle">Se aplicó el tope de {business.maxStampsPerPurchase} sellos por compra.</p>}
            </div>
          ) : (
            <p className="subtle">
              {rules.some((r) => r.active) ? 'Ingresá un monto para ver qué reglas aplican.' : (
                <>No tenés reglas activas. <Link to="/reglas">Configurá una</Link>.</>
              )}
            </p>
          )}
          {customer && (
            <p className="subtle">
              Saldo: {current} → <strong>{current + preview.total}</strong>
            </p>
          )}
          <button className="btn primary block" disabled={!customer || !amount} onClick={submit}>
            Confirmar compra
          </button>
        </div>
      </div>

      {creating && (
        <NewCustomerModal
          initial={query}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCustomerId(c.id);
            setCreating(false);
            setQuery('');
          }}
        />
      )}
    </div>
  );
}

export function NewCustomerModal({
  initial = '',
  onClose,
  onCreated,
}: {
  initial?: string;
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const { run } = useStore();
  const business = useBusiness();
  const looksNumeric = /\d{3,}/.test(initial);
  const [form, setForm] = useState<CustomerInput>({
    name: looksNumeric ? '' : initial,
    phone: looksNumeric ? initial : '',
    email: '',
    dni: '',
  });
  const set = (k: keyof CustomerInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function save() {
    let created = undefined as Customer | undefined;
    const ok = run((d) => {
      const r = enrollCustomer(d, business.id, form);
      created = r.value;
      return r.db;
    }, 'Cliente adherido');
    if (ok && created) onCreated(created);
  }

  return (
    <Modal
      title="Nuevo cliente"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Guardar y continuar
          </button>
        </>
      }
    >
      <p className="muted">
        Si ya es cliente de otro comercio de la red (mismo teléfono, DNI o email), se reutiliza su cuenta y se adhiere a{' '}
        {business.name}.
      </p>
      <div className="stack">
        <Field label="Nombre y apellido">
          <input className="input" value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <div className="grid grid-2">
          <Field label="Teléfono / WhatsApp">
            <input className="input" value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="11 5555-5555" />
          </Field>
          <Field label="DNI">
            <input className="input" value={form.dni} onChange={set('dni')} inputMode="numeric" />
          </Field>
        </div>
        <Field label="Email">
          <input className="input" value={form.email} onChange={set('email')} type="email" />
        </Field>
      </div>
    </Modal>
  );
}
