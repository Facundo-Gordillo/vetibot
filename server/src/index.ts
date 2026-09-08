import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextFunction, Request, Response } from "express";
import { initSchema, db, now, withTransaction } from "./db/index.js";
import { config, assertProductionSafety } from "./config.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import userRoutes from "./routes/user.js";
import vetsRoutes from "./routes/vets.js";
import partnerRoutes from "./routes/partner.js";
import notificationRoutes from "./routes/notifications.js";
import { stripeRouter } from "./routes/stripe.js";
import { notifyFollowUp } from "./services/notifications.js";
import {
  completeFollowUp,
  followUpUnanswered,
  getDueFollowUps,
  getUnanswered,
  MAX_UNANSWERED,
} from "./services/followup.js";

// Corta el arranque si la config es insegura para producción (JWT_SECRET
// por defecto/débil, CORS abierto). En dev solo advierte.
assertProductionSafety();

initSchema();

const app = express();
if (config.trustProxy) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    // El frontend carga solo recursos propios (y Google Fonts, opcional).
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        // El cliente solo llama a su propio origen (/api/*); no hace falta
        // abrir connect-src a cualquier https:/wss: (eso solo debilita la CSP
        // frente a una eventual exfiltración vía contenido inyectado).
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
// CORS restringido: en producción solo el dominio de la app; en dev, todo.
const corsOrigins = config.corsOrigin
  ? config.corsOrigin.split(",").map((s) => s.trim()).filter(Boolean)
  : [];
app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: false,
  })
);
// El webhook de Stripe debe leer el body crudo ANTES de express.json().
app.use("/api/stripe", stripeRouter);
app.use(express.json({ limit: "100kb" }));

// Rate limiting general de la API (bruto anti-abuso).
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiadas peticiones. Intentá de nuevo en un minuto." },
  })
);
// Registro/login: límite estricto (anti fuerza bruta / cuentas masivas).
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Esperá unos minutos y probá de nuevo." },
  })
);
// Envío de mensajes: cada uno dispara una llamada a la IA (costo real) y a
// Overpass, así que necesita un límite más ajustado que el general de /api.
app.use(
  "/api/chat/send",
  rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Estás enviando mensajes muy rápido. Esperá un momento." },
  })
);

// Un cliente que corta la conexión durante una espera larga (IA/Overpass) emite
// un "error" en el socket. Escucharlo evita que el evento no manejado mate el proceso.
app.use((req, res, next) => {
  res.on("error", () => {});
  next();
});

app.get("/api/health", (_req, res) => {
  // No solo "el proceso está vivo": confirma que la DB responde, para que un
  // healthcheck (Docker/Render) detecte un SQLite corrupto o sin permisos.
  try {
    db.prepare("SELECT 1").get();
  } catch (err) {
    console.error("[vetibot] Health check: DB no responde:", err);
    res.status(503).json({ ok: false, version: "1.0.0" });
    return;
  }
  res.json({ ok: true, version: "1.0.0" });
});

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/user", userRoutes);
app.use("/api/vets", vetsRoutes);
app.use("/api/partner", partnerRoutes);
app.use("/api/notifications", notificationRoutes);

// 404 JSON para rutas de API inexistentes (debe ir DESPUÉS de todas las rutas).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// Producción: el server sirve el frontend compilado (client/dist).
const dist = resolve(config.clientDist);
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(resolve(dist, "index.html"));
  });
}

// Manejador de errores: devuelve JSON y nunca deja caer el proceso.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[vetibot] Error:", err);
  if (res.headersSent) return;
  const status = (err as { statusCode?: number } | null)?.statusCode ?? 500;
  res.status(status).json({
    error: status >= 500 ? "Error interno del servidor" : "Solicitud inválida",
  });
});

// Procesa seguimientos vencidos: inserta un mensaje del bot en el chat del usuario.
// Si el usuario no responde a 3 follow-ups seguidos, se corta la cadena.
function processFollowUps() {
  const due = getDueFollowUps();
  if (due.length === 0) return;

  const insert = db.prepare(
    "INSERT INTO messages (user_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)"
  );
  let sent = 0;
  let stopped = 0;
  withTransaction(() => {
    for (const item of due) {
      const count = getUnanswered(item.userId);
      if (count >= MAX_UNANSWERED) {
        // Ya hubo N recordatorios sin respuesta: no insistir más con este caso.
        completeFollowUp(item.id);
        stopped++;
        continue;
      }
      insert.run(item.userId, item.reminderMessage, now());
      completeFollowUp(item.id);
      followUpUnanswered(item);
      void notifyFollowUp(item.userId, item.reminderMessage);
      sent++;
    }
  });
  if (sent > 0 || stopped > 0) {
    console.log(`[followup] Procesados: ${sent} enviado(s), ${stopped} cortado(s) por no respuesta.`);
  }
}

const followUpInterval = setInterval(processFollowUps, 30_000);
processFollowUps();

// Si algo se escapa, que no tire abajo el servidor: se registra y se sigue.
process.on("unhandledRejection", (reason) => {
  console.error("[vetibot] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[vetibot] uncaughtException:", err);
});

const server = app.listen(config.port, () => {
  console.log(`[vetibot] Servidor corriendo en http://localhost:${config.port}`);
  if (!config.openaiApiKey) console.warn("[vetibot] Advertencia: OPENAI_API_KEY no configurada.");
});

// Shutdown limpio: para de aceptar conexiones antes de cerrar el proceso.
// (En plataformas con SIGTERM —Render, Railway, Fly— evita peticiones a medias.)
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[vetibot] ${signal} recibido, cerrando...`);
  clearInterval(followUpInterval);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ya cerrada */
    }
    process.exit(0);
  });
  // Frenetilla: si no termina en 10s, sale de todos modos.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));