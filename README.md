# tuCliente · by Seven Cats

Plataforma de **fidelización de clientes para cualquier comercio**. Los clientes juntan **sellos** según las reglas de cada comercio, los canjean por premios y, gracias a la **red de intercambio**, pueden usar los sellos de un comercio en otro de un rubro distinto.

> Estado: **demo v0.1**. Funciona completa en el navegador (los datos se guardan en `localStorage`), con la lógica de negocio separada y testeada para migrarla a un backend.

Color insignia: **coral** (tuTinta = verde lima, CRM personal = amarillo girasol). Tipografía: **Fredoka** en títulos y **Space Grotesk** en el resto.

## Cómo correrla

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests del dominio (reglas, canjes, intercambios, promos)
npm run build      # build estático en dist/ (se puede subir a Vercel/Netlify/GH Pages)
```

La demo arranca con 3 comercios de ejemplo (Café Bruma, Librería Ombú, Tienda Alba), 12 clientes y unos 90 días de historial. El botón **Reiniciar demo** vuelve a los datos de ejemplo.

## Qué incluye

**Modo Comercio** (se elige el comercio activo arriba a la izquierda)

| Pantalla | Qué hace |
|---|---|
| Inicio | KPIs de los últimos 30 días, ventas por semana, mejores clientes y últimas compras. |
| Registrar compra | Busca un cliente por nombre, teléfono o DNI, o lo da de alta. Muestra **en vivo** cuántos sellos suma y por qué regla. Si el cliente ya existe en otro comercio de la red, se adhiere con un click. |
| Clientes / ficha | Historial de compras, movimientos de sellos (libro mayor), canjes y promos recibidas. Permite anular compras, ajustar sellos con motivo y canjear premios. |
| Premios y canjes | Alta de premios: % o $ de descuento, producto gratis, stock, vencimiento y compra mínima. Validación de códigos de canje. |
| Promociones | Mensajes con variables (`{nombre}`, `{sellos}`, `{comercio}`) y segmentos: todos, cerca de un premio, inactivos, mejores clientes, con N+ sellos. Por WhatsApp abre cada chat con el mensaje ya escrito (`wa.me`). |
| Reglas de sellos | Monto mínimo, cada $X, por visita y bonus por día de la semana. Las reglas se acumulan, hay tope opcional por compra y un simulador. |
| Red de intercambio | Proponer, aceptar o rechazar, pausar y reactivar acuerdos con otros comercios. Cada acuerdo define la tasa (p. ej. 2 sellos del Café = 1 de la Librería), si es bidireccional y el tope mensual por cliente. |

**Modo Cliente** (billetera): tarjetas de sellos por comercio, premios con progreso, canje con código, conversión de sellos entre comercios, mensajes y actividad reciente.

## Modelo de dominio

```
Customer (identidad GLOBAL: tel / DNI / email)
   └── Membership ──► Business ──► StampRule[]   (cómo se ganan sellos)
                          ├──────► Reward[]      (en qué se gastan)
                          └──────► ExchangeAgreement (red con otros comercios)

Purchase ──► StampTransaction (earn)
Redemption ──► StampTransaction (redeem)
Intercambio ──► StampTransaction (exchange_out en A) + (exchange_in en B)
```

Decisiones clave:

- **El saldo no se guarda: se calcula** sumando el libro mayor (`StampTransaction`). Todo movimiento queda auditado y se puede revertir (anular compra, cancelar canje).
- **El cliente es global**: cada comercio se vincula con él mediante una `Membership`. Esto es lo que permite la red de intercambio.
- **Las reglas son datos, no código**: cada comercio configura las suyas sin deploy.
- Un acuerdo de intercambio lo **propone** un comercio y lo **acepta** el otro. Mientras no esté activo, no se puede usar.

## Estructura

```
src/
  domain/      ← lógica de negocio pura (sin React), con tests
    types.ts     modelo
    rules.ts     motor de reglas de sellos
    queries.ts   lecturas: saldos, segmentos, rutas de intercambio
    services.ts  casos de uso: compras, canjes, promos, acuerdos, intercambios
  data/
    store.tsx    estado + persistencia (localStorage) ← reemplazable por API
    seed.ts      datos de demo (generados con los mismos servicios)
  styles/
    tokens.css   colores y tipografía (único lugar para alinear con tuTinta y el CRM)
  components/  UI compartida
  pages/       merchant/* y customer/*
```

## Próximos pasos sugeridos

1. **Backend**: Supabase (Postgres + Auth + RLS). Los servicios de `domain/` pasan casi tal cual a funciones RPC o edge functions. El libro mayor queda como tabla de solo inserción.
2. **Auth**: los comercios entran con email y pueden tener varios usuarios (caja y dueño); los clientes, con OTP por teléfono.
3. **WhatsApp Business API** para enviar promos de forma automática, y QR del cliente para identificarlo en caja.
4. **Vencimiento de sellos**, cumpleaños automáticos y reglas por categoría de producto.
5. **Liquidación entre comercios**: hoy el intercambio es 1 a 1 en sellos; más adelante se puede valorizar el sello y compensar entre comercios.
6. Alinear `tokens.css` con los tokens exactos de tuTinta y el CRM.
