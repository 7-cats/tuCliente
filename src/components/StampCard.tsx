import { CATEGORY_LABEL, plural } from '../lib/format';
import type { Business, Reward } from '../domain/types';
import { Seal } from './Icon';

/**
 * Tarjeta visual de sellos. Muestra los sellos del "ciclo" actual
 * (saldo módulo tamaño de tarjeta) y el total acumulado.
 */
export function StampCard({
  business,
  stamps,
  next,
  compact,
}: {
  business: Business;
  stamps: number;
  next?: Reward;
  compact?: boolean;
}) {
  const size = Math.max(1, business.cardSize);
  const filled = stamps >= size && stamps % size === 0 ? size : stamps % size;
  return (
    <div className={`stamp-card ${compact ? 'compact' : ''}`}>
      <div className="row between" style={{ position: 'relative', zIndex: 1, alignItems: 'flex-start' }}>
        <div>
          <div className="sc-name">{business.name}</div>
          <div className="sc-cat">{CATEGORY_LABEL[business.category]}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="sc-count num">{stamps}</div>
          <div className="sc-cat">sellos</div>
        </div>
      </div>
      <div className="stamp-grid" aria-label={`${filled} de ${size} sellos`}>
        {Array.from({ length: size }, (_, i) => (
          <div key={i} className={`stamp ${i < filled ? 'on' : ''}`}>
            {i < filled && <Seal size={64} rotate={(i * 37) % 30 - 15} />}
          </div>
        ))}
      </div>
      <div className="sc-foot">
        {next
          ? `Te ${next.cost - stamps === 1 ? 'falta' : 'faltan'} ${plural(next.cost - stamps, 'sello')} para "${next.name}"`
          : stamps > 0
            ? '¡Ya podés canjear premios!'
            : 'Sumá tu primer sello con tu próxima compra'}
      </div>
    </div>
  );
}
