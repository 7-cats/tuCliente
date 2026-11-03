import { useMemo, useState } from 'react';
import { useBusiness, useStore } from '../../data/store';
import { balance, byId, describeSegment, resolveSegment } from '../../domain/queries';
import { renderMessage, sendPromotion } from '../../domain/services';
import type { Channel, Promotion, Segment } from '../../domain/types';
import { dateLong, dateTime, plural } from '../../lib/format';
import { Icon, type IconName } from '../../components/Icon';
import { Empty, Field, Modal, NumberInput, PageHead } from '../../components/ui';

const CHANNELS: { id: Channel; label: string; icon: IconName }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { id: 'email', label: 'Email', icon: 'mail' },
  { id: 'app', label: 'Billetera', icon: 'wallet' },
];

const SEGMENT_KINDS: { kind: Segment['kind']; label: string }[] = [
  { kind: 'all', label: 'Todos' },
  { kind: 'near_reward', label: 'Cerca de un premio' },
  { kind: 'inactive_days', label: 'Inactivos' },
  { kind: 'top_spenders', label: 'Mejores clientes' },
  { kind: 'min_stamps', label: 'Con sellos acumulados' },
];

const TEMPLATES = [
  { title: '¡Te falta poco!', message: 'Hola {nombre}! Ya juntaste {sellos} en tu tarjeta de {comercio}. Te falta muy poco para tu próximo premio 🎁' },
  { title: 'Te extrañamos', message: '{nombre}, hace rato que no pasás por {comercio}. Esta semana tu compra suma doble sello.' },
  { title: 'Promo de la semana', message: 'Hola {nombre}! Esta semana en {comercio}: 2x1 presentando este mensaje.' },
];

function defaultSegment(kind: Segment['kind']): Segment {
  switch (kind) {
    case 'all':
      return { kind };
    case 'near_reward':
      return { kind, within: 2 };
    case 'inactive_days':
      return { kind, days: 15 };
    case 'top_spenders':
      return { kind, top: 10 };
    case 'min_stamps':
      return { kind, min: 5 };
  }
}

export function Promotions() {
  const { db, run } = useStore();
  const business = useBusiness();
  const [title, setTitle] = useState(TEMPLATES[0]!.title);
  const [message, setMessage] = useState(TEMPLATES[0]!.message);
  const [segment, setSegment] = useState<Segment>({ kind: 'near_reward', within: 2 });
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [sent, setSent] = useState<Promotion | null>(null);

  const recipients = useMemo(() => resolveSegment(db, business.id, segment), [db, business.id, segment]);
  const sample = recipients[0];
  const preview = renderMessage(message, {
    nombre: sample?.name ?? 'Lucía',
    sellos: sample ? balance(db, sample.id, business.id) : 4,
    comercio: business.name,
  });
  const history = db.promotions.filter((p) => p.businessId === business.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  function send() {
    let promo = null as Promotion | null;
    const ok = run((d) => {
      const r = sendPromotion(d, { businessId: business.id, title, message, segment, channel });
      promo = r.value;
      return r.db;
    }, `Promo enviada a ${plural(recipients.length, 'cliente')}`);
    if (ok && promo) setSent(promo);
  }

  return (
    <div className="page">
      <PageHead title="Promociones" subtitle="Enviá mensajes segmentados a tus clientes." />

      <div className="grid grid-side">
        <div className="card stack" style={{ gap: 18 }}>
          <Field label="Plantillas">
            <div className="chips">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  className={`chip ${title === t.title ? 'on' : ''}`}
                  onClick={() => {
                    setTitle(t.title);
                    setMessage(t.message);
                  }}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Título">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Mensaje" hint="Variables: {nombre}, {sellos}, {comercio}">
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>

          <Field label="¿A quién?">
            <div className="chips">
              {SEGMENT_KINDS.map((s) => (
                <button key={s.kind} className={`chip ${segment.kind === s.kind ? 'on' : ''}`} onClick={() => setSegment(defaultSegment(s.kind))}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
          {segment.kind === 'near_reward' && (
            <Field label="A cuántos sellos o menos de un premio">
              <NumberInput value={segment.within} onChange={(v) => setSegment({ ...segment, within: v ?? 1 })} min={1} />
            </Field>
          )}
          {segment.kind === 'inactive_days' && (
            <Field label="Días sin comprar">
              <NumberInput value={segment.days} onChange={(v) => setSegment({ ...segment, days: v ?? 1 })} min={1} />
            </Field>
          )}
          {segment.kind === 'top_spenders' && (
            <Field label="Cantidad de clientes">
              <NumberInput value={segment.top} onChange={(v) => setSegment({ ...segment, top: v ?? 1 })} min={1} />
            </Field>
          )}
          {segment.kind === 'min_stamps' && (
            <Field label="Mínimo de sellos">
              <NumberInput value={segment.min} onChange={(v) => setSegment({ ...segment, min: v ?? 1 })} min={1} />
            </Field>
          )}

          <Field label="Canal">
            <div className="chips">
              {CHANNELS.map((c) => (
                <button key={c.id} className={`chip ${channel === c.id ? 'on' : ''}`} onClick={() => setChannel(c.id)}>
                  <span className="row" style={{ gap: 6 }}>
                    <Icon name={c.icon} size={14} /> {c.label}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <div className="row between wrap">
            <span className="muted">
              <strong>{plural(recipients.length, 'cliente')}</strong> · {describeSegment(segment)}
            </span>
            <button className="btn primary" disabled={!recipients.length} onClick={send}>
              <Icon name="megaphone" /> Enviar promo
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="phone stack">
            <span className="subtle">Vista previa{sample ? ` · ${sample.name}` : ''}</span>
            <div className="bubble">
              <strong>{title}</strong>
              {'\n'}
              {preview}
            </div>
          </div>
          <div className="card stack">
            <h3>Destinatarios</h3>
            {recipients.length ? (
              <div className="chips">
                {recipients.slice(0, 18).map((c) => (
                  <span key={c.id} className="badge">
                    {c.name}
                  </span>
                ))}
                {recipients.length > 18 && <span className="badge">+{recipients.length - 18}</span>}
              </div>
            ) : (
              <p className="subtle">Nadie cumple este criterio todavía.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-head" style={{ padding: '18px 20px 0' }}>
          <h3>Enviadas</h3>
        </div>
        {history.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Promo</th>
                  <th>Segmento</th>
                  <th>Canal</th>
                  <th className="r">Destinatarios</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="muted">{dateTime(p.sentAt)}</td>
                    <td>{p.title}</td>
                    <td className="muted">{describeSegment(p.segment)}</td>
                    <td>
                      <span className="badge">{CHANNELS.find((c) => c.id === p.channel)?.label}</span>
                    </td>
                    <td className="r num">{p.recipientIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Todavía no enviaste promociones" icon="megaphone" />
        )}
      </div>

      {sent && (
        <Modal title="Promo registrada" onClose={() => setSent(null)} wide>
          <p className="muted">
            {sent.channel === 'whatsapp'
              ? 'En la demo no hay integración con la API de WhatsApp: podés abrir cada chat con el mensaje ya escrito.'
              : sent.channel === 'email'
                ? 'En la demo no se envían emails reales: podés abrir cada uno en tu cliente de correo.'
                : 'Los clientes la ven en su billetera.'}{' '}
            Enviada el {dateLong(sent.sentAt)}.
          </p>
          {sent.channel !== 'app' && (
            <div className="list">
              {sent.recipientIds.map((id) => {
                const c = byId(db.customers, id);
                if (!c) return null;
                const text = `${sent.title}\n${renderMessage(sent.message, { nombre: c.name, sellos: balance(db, c.id, business.id), comercio: business.name })}`;
                const phone = c.phone?.replace(/\D/g, '');
                const href =
                  sent.channel === 'whatsapp'
                    ? phone && `https://wa.me/549${phone}?text=${encodeURIComponent(text)}`
                    : c.email && `mailto:${c.email}?subject=${encodeURIComponent(sent.title)}&body=${encodeURIComponent(text)}`;
                return (
                  <div key={id} className="list-item">
                    <span style={{ flex: 1 }}>{c.name}</span>
                    {href ? (
                      <a className="btn sm" href={href} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    ) : (
                      <span className="subtle">sin {sent.channel === 'whatsapp' ? 'teléfono' : 'email'}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
