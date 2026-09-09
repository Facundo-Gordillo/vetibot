# VetBot - Asistente de triage veterinario

Asistente de triage veterinario con logica de semaforo: verde (leve), amarillo (moderado) y rojo (emergencia). Escucha que le pasa a tu mascota, clasifica la urgencia y te guia al siguiente paso: desde un consejo en casa hasta la veterinaria abierta mas cercana.

Funcionalidades principales:

- Chat con IA que recolecta sintomas, evalua severidad y detecta banderas rojas.
- Veterinarias reales (OpenStreetMap / Overpass) con estado de apertura en vivo, telefono, web y rating colaborativo.
- Seguimiento automatico: el bot vuelve a escribirte para saber como sigue el animal.
- B2B: veterinarias que pagan por destacarse dentro de su zona (Stripe).
- PWA: instalable, offline basico y notificaciones push.

## Stack

| Capa | Tecnologia |
| --- | --- |
| Frontend | React 18 + Vite + React Router + React Markdown |
| Backend | Node.js + Express + TypeScript |
| Datos | SQLite (`node:sqlite`, WAL) |
| IA | OpenAI API (compatible con OpenRouter) |
| Veterinarias | Overpass (OpenStreetMap) |
| Pagos B2B | Stripe |
| Push | Web Push / VAPID |

## Estructura

```
vetibot/
├── client/              # Frontend React (Vite)
│   ├── src/
│   │   ├── pages/       # Home, Chat, Partner (B2B)
│   │   ├── components/  # Message, VetCard, TriageIndicator, Auth, Settings...
│   │   ├── hooks/       # useChatAlerts (notificaciones, unread)
│   │   ├── api.ts       # cliente HTTP tipado
│   │   ├── auth.tsx     # contexto de autenticacion
│   │   ├── location.ts  # geolocalizacion con cache
│   │   ├── push.ts      # suscripcion a notificaciones push
│   │   ├── themes.ts    # temas claro/oscuro, motivos, accesibilidad
│   │   └── styles.css   # sistema de diseno (CSS variables)
│   └── public/          # PWA (manifest, iconos, sw.js)
├── server/              # Backend (Express + SQLite)
│   ├── src/
│   │   ├── routes/      # auth, chat, vets, user, partner, stripe, notifications
│   │   ├── services/    # ai, places, followup, notifications, etc.
│   │   ├── db/          # esquema + migraciones ligeras
│   │   ├── middlewares/ # auth JWT
│   │   ├── config.ts    # todo por variables de ambiente
│   │   ├── index.ts     # bootstrap + shutdown limpio
│   │   └── types.ts
│   └── data/            # sponsors.json (B2B), vetibot.db
└── package.json         # workspaces npm (client + server)
```

La base de datos es SQLite (`server/data/vetibot.db`) y se crea sola al arrancar.

## Requisitos

- Node.js >= 22 (por `node:sqlite`)
- npm >= 10

## Inicio rapido (dev)

```bash
# 1) instalar dependencias (workspaces)
npm install

# 2) configurar backend
cp server/.env.example server/.env
#    editar server/.env (JWT_SECRET, OPENAI_API_KEY...) - la key es opcional

# 3) levantar client (Vite :5173) + server (Express :4000)
npm run dev
```

Abrir <http://localhost:5173>. El client proxye `/api` hacia el :4000.

## Build de produccion

```bash
npm run build   # compila server + client -> client/dist
npm run start   # sirve el frontend compilado y la API desde :4000
```

En produccion el server tambien sirve el frontend compilado, asi que alcanza con un solo proceso.

## Variables clave

Todas configurables por ambiente (ver `server/.env.example`):

| Variable | Descripcion |
| --- | --- |
| `JWT_SECRET` | Secreto de sesion. Obligatorio cambiarlo en produccion. |
| `OPENAI_API_KEY` | Key de IA/OpenRouter. Sin ella se usa el fallback deterministico. |
| `OPENAI_MODEL` | Modelo principal (ej. `nvidia/nemotron-3-ultra-550b-a55b:free`). |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` para usar OpenRouter. |
| `OPENROUTER_AUTO_FREE` | Default `true`: autodescubre y usa cualquier modelo free de OpenRouter de respaldo si el principal falla. |
| `OPENROUTER_FREE_MODELS` | Lista manual de respaldo (separada por coma), opcional. |
| `OPENAI_CHAIN_TIMEOUT_MS` | Techo total de la cadena de modelos (ms). Responde igual aunque no termine. |
| `OPENAI_ATTEMPT_TIMEOUT_MS` | Timeout por intento (ms): si un modelo tarda mas, se descarta y sigue. |
| `OPENAI_PRIMARY_GRACE_MS` | Ventana del primario (ms): si Nvidia no responde, abre los fallbacks en paralelo. |
| `TRANSCRIBE_API_KEY` | Key para transcribir mensajes de voz (Whisper via Groq por defecto). Vacia = el boton de microfono queda oculto en el chat. |
| `STRIPE_SECRET_KEY` | Stripe. Vacia = modo sandbox (pago simulado). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push. `npx web-push generate-vapid-keys`. |
| `CORS_ORIGIN` | Dominios permitidos, separados por coma. Vacio = todos (solo dev). |
| `TRUST_PROXY` | `true` detras de Nginx/Render/Railway. |
| `APP_URL` | URL publica para el link de las notificaciones. |

## Despliegue

La app es un proceso unico (sirve la API y el frontend). Opciones:

- Render / Railway / Fly: build `npm run build`, start `npm run start`, `PORT` automatico, `TRUST_PROXY=true`.
- Docker: hay un `Dockerfile` en `docker/`.
- La BD (SQLite) va a `server/data`. Para multiples instancias se necesita una base remota.
- CORS: fijar `CORS_ORIGIN` con el dominio de produccion.

## B2B (veterinarias aliadas)

La pagina `/partner` permite a una veterinaria:

1. Cargar su ficha (nombre, direccion, cobertura en km).
2. Elegir un plan (Tier 1-3) y pagar por suscripcion con Stripe.
3. Aparecer destacada y priorizada dentro de su zona en las recomendaciones.

En dev (sin `STRIPE_SECRET_KEY`) el pago se simula y se activa al instante.

## Licencia

Proyecto personal. Todos los derechos reservados.