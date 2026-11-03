import { useId, type SVGProps } from 'react';

/** Íconos de línea (estilo lucide), inline para no depender de librerías. */
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  receipt: 'M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2zM8 8h8M8 12h8M8 16h5',
  rules: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  network: 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM5 5a2 2 0 1 0 0 .01M19 5a2 2 0 1 0 0 .01M5 19a2 2 0 1 0 0 .01M19 19a2 2 0 1 0 0 .01M6.5 6.5l3.4 3.4M17.5 6.5l-3.4 3.4M6.5 17.5l3.4-3.4M17.5 17.5l-3.4-3.4',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4M21 11h-4a2 2 0 0 0 0 4h4z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  refresh: 'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  pause: 'M8 5v14M16 5v14',
  play: 'M6 4l14 8-14 8z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  chat: 'M21 12a8 8 0 0 1-11.9 7L3 21l2-5.6A8 8 0 1 1 21 12z',
  ticket: 'M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4zM13 5v2M13 11v2M13 17v2',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
};

export type IconName = keyof typeof PATHS | 'seal';

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  if (name === 'seal') return <Seal size={size} {...(rest as Omit<SVGProps<SVGSVGElement>, 'rotate'>)} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * Sello de goma de tuCliente: doble anillo con texto circular y una banda
 * central que dice "SEVEN CATS". Usa currentColor, así que funciona sobre
 * cualquier fondo.
 *
 * - `detail`: muestra texto circular, texto de la banda y textura de tinta.
 *   Por defecto se activa desde 28px; en tamaños chicos queda solo la forma.
 */
export function Seal({
  size = 18,
  detail,
  rotate = -12,
  ink = true,
  ...rest
}: { size?: number; detail?: boolean; rotate?: number; ink?: boolean } & Omit<SVGProps<SVGSVGElement>, 'rotate'>) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const full = detail ?? size >= 28;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" {...rest}>
      <defs>
        <path id={`${id}t`} d="M 14 50 A 36 36 0 0 1 86 50" />
        <path id={`${id}b`} d="M 6 50 A 44 44 0 0 0 94 50" />
        {/* Los anillos se cortan donde pasa la banda, como en un sello real. */}
        <mask id={`${id}m`}>
          <rect width="100" height="100" fill="#fff" />
          <rect x="2" y="37" width="96" height="26" fill="#000" />
        </mask>
        {full && ink && (
          <filter id={`${id}i`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  5 0 0 0 -0.9" result="a" />
            <feComposite in="SourceGraphic" in2="a" operator="in" />
          </filter>
        )}
      </defs>
      <g
        transform={`rotate(${rotate} 50 50)`}
        filter={full && ink ? `url(#${id}i)` : undefined}
        fill="none"
        stroke="currentColor"
      >
        <g mask={`url(#${id}m)`}>
          <circle cx="50" cy="50" r="46" strokeWidth={full ? 5 : 7} />
          <circle cx="50" cy="50" r={full ? 31 : 30} strokeWidth={full ? 2.6 : 5} />
        </g>
        <rect x="4" y="38.5" width="92" height="23" rx="1.5" strokeWidth={full ? 4 : 6} />
        {full && <rect x="8.5" y="42.5" width="83" height="15" strokeWidth="1.6" />}
        {full && (
          <g fill="currentColor" stroke="none" fontFamily="'Courier Prime', 'Courier New', monospace" fontWeight="700">
            <text fontSize="11" letterSpacing="1" textAnchor="middle">
              <textPath href={`#${id}t`} startOffset="50%">
                TU CLIENTE
              </textPath>
            </text>
            <text fontSize="8.5" letterSpacing="1.2" textAnchor="middle">
              <textPath href={`#${id}b`} startOffset="50%">
                ★ FIDELIDAD ★
              </textPath>
            </text>
            <text x="50" y="54.2" fontSize="13.5" textAnchor="middle" textLength="74" lengthAdjust="spacingAndGlyphs">
              SEVEN CATS
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
