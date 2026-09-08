# VetBot · Imagen de produccion (processo unico: API + frontend)
FROM node:22-slim AS build
WORKDIR /app

# Dependencias primero (cache de build). npm ci exige el lockfile presente y
# respeta exactamente las versiones instaladas (build reproducible).
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

# Codigo fuente
COPY server server
COPY client client

# Compilacion
RUN npm run build

# --- Imagen final ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Solo runtime deps (server) + el dist compilado
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace server && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY server/data server/data

# El usuario "node" (no root) necesita poder escribir la BD SQLite.
RUN chown -R node:node /app/server/data

# La BD (y sponsors.json si se usa) se persisten aca
VOLUME ["/app/server/data"]

EXPOSE 4000

# Verifica que el proceso responda (usa fetch nativo de Node, sin curl en la imagen).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Usuario no root: reduce el impacto de una RCE dentro del contenedor.
USER node

CMD ["node", "server/dist/index.js"]