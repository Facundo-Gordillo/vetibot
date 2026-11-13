# VetiBot – Asistente de triage veterinario

[English](README.md) | **Español**

VetiBot es un asistente de triage veterinario full-stack basado en una **lógica de semáforo**: 🟢 verde (leve), 🟡 amarillo (moderado) y 🔴 rojo (emergencia). Escucha qué le pasa a tu mascota, clasifica la urgencia y te guía al siguiente paso: desde un consejo en casa hasta la veterinaria abierta más cercana.

## Funcionalidades

- **Chat de triage con IA** que recolecta síntomas, evalúa la severidad y detecta banderas rojas. Funciona con cualquier API compatible con OpenAI (OpenRouter por defecto), con respaldo automático entre modelos gratuitos, timeouts por intento y un fallback local determinístico cuando no hay API key configurada.
- **Mensajes de voz**: grabás audio en el chat y se transcribe con Whisper (vía Groq por defecto). Si no hay key de transcripción, el botón de micrófono queda oculto.
- **Veterinarias reales** de OpenStreetMap (Overpass API) con estado de apertura en vivo, teléfono, web y rating colaborativo.
- **Seguimiento automático**: el bot vuelve a escribirte para saber cómo sigue el animal.
- **Programa B2B**: las veterinarias pueden suscribirse (Tier 1–3) para aparecer destacadas y priorizadas en su zona. Pagos con Stripe (modo sandbox simulado si no hay key); la configuración de Mercado Pago está en preparación.
- **PWA**: instalable, offline básico y notificaciones push (Web Push / VAPID).
- **Backend pensado en seguridad**: autenticación JWT con contraseñas hasheadas con bcrypt, Helmet, rate limiting, validación con Zod, CORS configurable y un chequeo al arrancar en producción que no deja iniciar el server con un `JWT_SECRET` inseguro o CORS abierto.
- Temas claro/oscuro y opciones de accesibilidad.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, React Router, React Markdown |
| Backend | Node.js (≥ 22.5), Express, TypeScript |
| Datos | SQLite (`node:sqlite`, modo WAL) |
| IA | SDK de OpenAI (compatible con OpenRouter), Whisper vía Groq para voz |
| Veterinarias | Overpass API (OpenStreetMap) |
| Pagos B2B | Stripe |
| Push | Web Push / VAPID |
| Despliegue | Proceso único (API + frontend estático), Docker, Render/Railway/Fly |

## Estructura

```
vetibot/
├── client/              # Frontend React (Vite)
│   ├── src/
│   │   ├── pages/       # Home, Chat, Partner (B2B)
│   │   ├── components/  # Message, VetCard, TriageIndicator, Auth, Settings...
│   │   ├── hooks/       # useChatAlerts (notificaciones, no leídos)
│   │   ├── api.ts       # cliente HTTP tipado
│   │   ├── auth.tsx     # contexto de autenticación
│   │   ├── location.ts  # geolocalización con caché
│   │   ├── push.ts      # suscripción a notificaciones push
│   │   ├── themes.ts    # temas claro/oscuro, accesibilidad
│   │   └── styles.css   # sistema de diseño (variables CSS)
│   └── public/          # PWA (manifest, íconos, sw.js)
├── server/              # Backend (Express + SQLite)
│   ├── src/
│   │   ├── routes/      # auth, chat, vets, user, partner, stripe, notifications
│   │   ├── services/    # ai, places, followup, notifications, transcribe...
│   │   ├── db/          # esquema + migraciones livianas
│   │   ├── middlewares/ # auth JWT
│   │   ├── config.ts    # todo se configura por variables de entorno
│   │   ├── index.ts     # bootstrap + apagado limpio
│   │   └── types.ts
│   ├── data/            # sponsors.json (B2B) y vetibot.db (ambos ignorados por git)
│   └── .env.example
├── docker/Dockerfile
├── docs/DEPLOY.md       # guía de despliegue
└── package.json         # workspaces de npm (client + server)
```

La base SQLite (`server/data/vetibot.db`) se crea sola al arrancar y nunca se versiona.

## Cómo empezar

### Requisitos

- Node.js ≥ 22.5 (por `node:sqlite`)
- npm ≥ 10

### Instalación

```bash
# 1) Instalar dependencias (workspaces)
npm install

# 2) Configurar el backend
cp server/.env.example server/.env
#    editar server/.env (JWT_SECRET, OPENAI_API_KEY, ...) – la key de IA es opcional

# 3) Levantar client (Vite :5173) + server (Express :4000)
npm run dev
```

Abrí <http://localhost:5173>. El client redirige `/api` al puerto 4000.

### Build de producción

```bash
npm run build   # compila server + client -> client/dist
npm run start   # sirve el frontend compilado y la API desde :4000
```

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Levanta server (tsx watch) y client (Vite) en paralelo |
| `npm run build` | Compila server (tsc) y client (tsc + Vite) |
| `npm run start` | Inicia el server compilado (API + frontend) |
| `npm run db:init` | Inicializa la base SQLite |

## Variables de entorno

Toda la configuración va en `server/.env` (ver [`server/.env.example`](server/.env.example)). Principales:

| Variable | Descripción |
| --- | --- |
| `PORT`, `NODE_ENV` | Puerto y entorno del server |
| `JWT_SECRET` | Secreto de sesión (≥ 32 caracteres, obligatorio en producción) |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma (vacío = todos, solo dev) |
| `TRUST_PROXY` | `true` detrás de Nginx/Render/Railway |
| `APP_URL` | URL pública para los links de las notificaciones |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | Proveedor de IA (compatible con OpenRouter). Sin key se usa un fallback determinístico |
| `OPENROUTER_AUTO_FREE`, `OPENROUTER_FREE_MODELS`, `OPENROUTER_MAX_FREE` | Respaldo automático con modelos gratuitos de OpenRouter |
| `OPENAI_CHAIN_TIMEOUT_MS`, `OPENAI_ATTEMPT_TIMEOUT_MS`, `OPENAI_PRIMARY_GRACE_MS` | Timeouts de la cadena de modelos |
| `TRANSCRIBE_API_KEY`, `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_MODEL` | Transcripción de mensajes de voz (Whisper vía Groq) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | Stripe (vacío = pagos simulados) |
| `TIER_PRICE_1..3` | Precios de los planes B2B (en centavos) |
| `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` | Mercado Pago (en preparación) |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push (`npx web-push generate-vapid-keys`) |
| `DB_PATH`, `SPONSORS_FILE`, `OVERPASS_URL`, `CLIENT_DIST` | Rutas/endpoints opcionales |

> Nunca subas valores reales: los archivos `.env` y las bases SQLite están en el `.gitignore`.

## Despliegue

VetiBot corre como un único proceso que sirve la API y el frontend compilado:

- **Render / Railway / Fly**: build `npm run build`, start `npm run start`, con `NODE_ENV=production`, `TRUST_PROXY=true`, `JWT_SECRET` y `CORS_ORIGIN`.
- **Docker**: `docker/Dockerfile` multi-stage (usuario no-root, healthcheck en `/api/health`).
- SQLite vive en `server/data`: montá un disco persistente. Para varias instancias hace falta una base remota.

Guía completa en [`docs/DEPLOY.md`](docs/DEPLOY.md).

## B2B (veterinarias aliadas)

La página `/partner` permite a una veterinaria:

1. Cargar su ficha (nombre, dirección, cobertura en km).
2. Elegir un plan (Tier 1–3) y pagar la suscripción con Stripe.
3. Aparecer destacada y priorizada en las recomendaciones de su zona.

En desarrollo (sin `STRIPE_SECRET_KEY`) el pago se simula y se activa al instante.

## Autor

**Facundo Gordillo** – [GitHub](https://github.com/Facundo-Gordillo)

## Licencia

Proyecto personal. Todos los derechos reservados.
