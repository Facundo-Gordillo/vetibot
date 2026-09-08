# Despliegue de VetBot

La app es un **proceso unico**: el server de Express sirve tanto la API (`/api/*`) como el frontend compilado (`client/dist`). Un solo `npm start` alcanza.

## Build

```bash
npm install
npm run build    # compila server + client -> client/dist
npm run start    # Express en :PORT, sirve API + frontend
```

## Proveedores

### Render (o Railway / Fly)

1. Build command: `npm run build`
2. Start command: `npm run start`
3. Environment (obligatorio):
   - `NODE_ENV=production` — con esto el server **valida al arrancar** que `JWT_SECRET` y `CORS_ORIGIN` estén configurados de forma segura, y **aborta el arranque** (exit 1) si no lo están. Es intencional: es preferible que el deploy falle explícitamente a que quede corriendo con un secreto de sesión adivinable o CORS abierto a cualquier origen.
   - `TRUST_PROXY=true` (sin esto `req.protocol` y los links de Stripe se rompen detras del proxy)
   - `JWT_SECRET=<secreto>` (`openssl rand -hex 32`, mínimo 32 caracteres)
   - `CORS_ORIGIN=https://mi-dominio.app,https://www.mi-dominio.app`
4. Persistencia de la BD: SQLite va a `server/data/vetibot.db`. En Render crea un **disk** montado en `/app/server/data` (o su equivalente) para que los datos no se pierdan en cada deploy.
5. Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`. `STRIPE_WEBHOOK_SECRET` se obtiene de `stripe listen` en local, o del dashboard.

> Multi-instancia: si escalas a 2+ instancias, la BD SQLite deja de servir (datos no compartidos). Pasa a una BD remota (Postgres/MySQL) adaptando `server/src/db/index.ts`.

## Docker

```bash
docker build -f docker/Dockerfile -t vetibot .
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e CORS_ORIGIN=https://mi-dominio.app \
  -e OPENAI_API_KEY=... \
  -v vetibot-data:/app/server/data \
  vetibot
```

> Nota: el server compila Typescript; el `Dockerfile` hace build en `node:22` con `npm ci` (build reproducible a partir de `package-lock.json`) y la imagen final corre con `--omit=dev`, como usuario no-root (`node`) y expone un `HEALTHCHECK` sobre `/api/health`.
>
> Con `NODE_ENV=production` el proceso **no arranca** si falta `JWT_SECRET`/`CORS_ORIGIN` o quedan con valores inseguros — revisá los logs del contenedor si el arranque falla.

## CORS

En produccion la API y el frontend se sirven del **mismo origen**, asi que CORS no es estrictamente necesario encendido. De todos modos, si el frontend corre en un dominio separado, setea `CORS_ORIGIN` con esos dominios (separados por coma).

## Notificaciones push (VAPID)

1. Genera el par: `npx web-push generate-vapid-keys`
2. Carga `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.
3. `APP_URL` debe ser la URL publica (para abrir la app desde la notificacion).
4. El endpoint del push debe ser HTTPS (los navegadores exigen `secure context`). En local requiere `http://localhost` (que cuenta como seguro) o HTTPS.

## Verificacion post-deploy

```bash
curl https://tu-dominio/api/health        # -> {"ok":true,"version":"1.0.0"}
curl https://tu-dominio/manifest.webmanifest   # 200 (PWA)
curl https://tu-dominio/icon-192.png           # 200 (icono PWA)
```