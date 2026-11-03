import { useState } from 'react';
import { useBusiness, useStore } from '../../data/store';
import { byId } from '../../domain/queries';
import { proposeAgreement, setAgreementStatus, type AgreementInput } from '../../domain/services';
import type { AgreementStatus, ExchangeAgreement } from '../../domain/types';
import { CATEGORY_LABEL, dateLong } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Empty, Field, Modal, NumberInput, PageHead } from '../../components/ui';

const STATUS: Record<AgreementStatus, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'warn' },
  active: { label: 'Activo', cls: 'ok' },
  paused: { label: 'Pausado', cls: '' },
  rejected: { label: 'Rechazado', cls: 'danger' },
};

export function Network() {
  const { db, run } = useStore();
  const business = useBusiness();
  const [proposing, setProposing] = useState<string | null>(null);

  const mine = db.agreements
    .filter((a) => a.fromBusinessId === business.id || a.toBusinessId === business.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const partners = db.businesses.filter((b) => b.id !== business.id);
  const linked = new Set(
    mine.filter((a) => a.status !== 'rejected').map((a) => (a.fromBusinessId === business.id ? a.toBusinessId : a.fromBusinessId)),
  );

  const flow = (kind: 'exchange_in' | 'exchange_out') =>
    db.transactions.filter((t) => t.businessId === business.id && t.kind === kind).reduce((a, t) => a + Math.abs(t.delta), 0);

  return (
    <div className="page">
      <PageHead
        title="Red de intercambio"
        subtitle="Acordá con otros comercios para que sus clientes usen sellos de un lado en el otro. Así ganás clientes nuevos de rubros distintos."
      />

      <div className="grid grid-3">
        <div className="card kpi">
          <div className="label">Acuerdos activos</div>
          <div className="value">{mine.filter((a) => a.status === 'active').length}</div>
        </div>
        <div className="card kpi">
          <div className="label">Sellos que llegaron de otros comercios</div>
          <div className="value">{flow('exchange_in')}</div>
        </div>
        <div className="card kpi">
          <div className="label">Sellos que tus clientes llevaron a otros</div>
          <div className="value">{flow('exchange_out')}</div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-head" style={{ padding: '18px 20px 0' }}>
          <h3>Tus acuerdos</h3>
        </div>
        {mine.length ? (
          <div className="list" style={{ padding: '0 20px' }}>
            {mine.map((a) => (
              <AgreementRow key={a.id} a={a} me={business.id} onStatus={(s, msg) => run((d) => setAgreementStatus(d, a.id, s, business.id), msg)} />
            ))}
          </div>
        ) : (
          <Empty title="Todavía no tenés acuerdos" icon="network">
            Proponé uno a un comercio de la red.
          </Empty>
        )}
      </div>

      <div className="stack">
        <h2>Comercios de la red</h2>
        <div className="grid grid-3">
          {partners.map((p) => (
            <div key={p.id} className="card stack">
              <div className="row">
                <div className="avatar" style={{ borderRadius: 12 }}>
                  <Icon name="store" size={17} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="subtle">
                    {CATEGORY_LABEL[p.category]}
                    {p.address ? ` · ${p.address}` : ''}
                  </div>
                </div>
              </div>
              {linked.has(p.id) ? (
                <span className="badge ok" style={{ alignSelf: 'flex-start' }}>
                  Ya tienen un acuerdo
                </span>
              ) : (
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setProposing(p.id)}>
                  <Icon name="swap" size={14} /> Proponer intercambio
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {proposing && <ProposeModal partnerId={proposing} onClose={() => setProposing(null)} />}
    </div>
  );
}

function AgreementRow({
  a,
  me,
  onStatus,
}: {
  a: ExchangeAgreement;
  me: string;
  onStatus: (s: AgreementStatus, msg: string) => void;
}) {
  const { db } = useStore();
  const from = byId(db.businesses, a.fromBusinessId)!;
  const to = byId(db.businesses, a.toBusinessId)!;
  const incoming = a.status === 'pending' && a.toBusinessId === me;
  const outgoing = a.status === 'pending' && a.fromBusinessId === me;
  return (
    <div className="list-item" style={{ padding: '16px 0', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 280px' }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <strong>{from.name}</strong>
          <Icon name={a.bidirectional ? 'swap' : 'arrowRight'} size={16} />
          <strong>{to.name}</strong>
          <span className={`badge ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span>
        </div>
        <div className="subtle" style={{ marginTop: 4 }}>
          {a.rateFrom} sello{a.rateFrom > 1 ? 's' : ''} de {from.name} = {a.rateTo} de {to.name}
          {a.bidirectional ? ' (y viceversa)' : ''}
          {a.monthlyLimit ? ` · tope ${a.monthlyLimit}/mes por cliente` : ''} · desde {dateLong(a.createdAt)}
        </div>
      </div>
      <div className="row">
        {incoming && (
          <>
            <button className="btn sm ghost danger" onClick={() => onStatus('rejected', 'Propuesta rechazada')}>
              Rechazar
            </button>
            <button className="btn sm primary" onClick={() => onStatus('active', '¡Acuerdo activo!')}>
              Aceptar
            </button>
          </>
        )}
        {outgoing && <span className="subtle">Esperando respuesta de {to.name}</span>}
        {a.status === 'active' && (
          <button className="btn sm" onClick={() => onStatus('paused', 'Acuerdo pausado')}>
            <Icon name="pause" size={14} /> Pausar
          </button>
        )}
        {a.status === 'paused' && (
          <button className="btn sm" onClick={() => onStatus('active', 'Acuerdo reactivado')}>
            <Icon name="play" size={14} /> Reactivar
          </button>
        )}
      </div>
    </div>
  );
}

function ProposeModal({ partnerId, onClose }: { partnerId: string; onClose: () => void }) {
  const { db, run } = useStore();
  const business = useBusiness();
  const partner = byId(db.businesses, partnerId)!;
  const [f, setF] = useState<AgreementInput>({
    fromBusinessId: business.id,
    toBusinessId: partnerId,
    rateFrom: 1,
    rateTo: 1,
    bidirectional: true,
    monthlyLimit: 5,
  });
  return (
    <Modal
      title={`Intercambio con ${partner.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => run((d) => proposeAgreement(d, f).db, `Propuesta enviada a ${partner.name}`) && onClose()}>
            Enviar propuesta
          </button>
        </>
      }
    >
      <p className="muted">Definí la equivalencia. {partner.name} tiene que aceptar para que empiece a funcionar.</p>
      <div className="grid grid-2">
        <Field label={`Sellos de ${business.name}`}>
          <NumberInput value={f.rateFrom} onChange={(v) => setF({ ...f, rateFrom: v ?? 0 })} min={1} />
        </Field>
        <Field label={`= Sellos de ${partner.name}`}>
          <NumberInput value={f.rateTo} onChange={(v) => setF({ ...f, rateTo: v ?? 0 })} min={1} />
        </Field>
      </div>
      <Field label="Tope mensual por cliente" hint="Máximo de sellos que un cliente puede recibir por mes por este acuerdo. Vacío = sin tope.">
        <NumberInput value={f.monthlyLimit} onChange={(v) => setF({ ...f, monthlyLimit: v })} min={1} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={f.bidirectional} onChange={(e) => setF({ ...f, bidirectional: e.target.checked })} />
        Bidireccional (también de {partner.name} a {business.name})
      </label>
      <div className="preview-box subtle">
        Un cliente con {f.rateFrom * 2} sellos de {business.name} podría convertirlos en {f.rateTo * 2} sellos de {partner.name}.
      </div>
    </Modal>
  );
}
