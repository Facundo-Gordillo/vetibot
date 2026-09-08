import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// server/src (dev) o server/dist (prod) -> raiz del repo
const repoRoot = resolve(here, "../..");

export const isProduction = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT || 4000),
  /** Detras de un proxy reverso (Render/Railway/Nginx): true. */
  trustProxy: process.env.TRUST_PROXY === "true",
  /** Dominios permitidos en CORS, separados por coma. Vacio = todos (solo dev). */
  corsOrigin: process.env.CORS_ORIGIN || "",
  dbPath: resolve(process.env.DB_PATH || resolve(here, "../data/vetibot.db")),
  jwtSecret: process.env.JWT_SECRET || "cambia_este_secreto",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "qwen/qwen2.5-72b-instruct:free",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "", // p. ej. https://openrouter.ai/api/v1
  /** Modelos free adicionales (separados por coma) que se prueban si el primario falla. */
  openaiFallbackModels: (process.env.OPENROUTER_FREE_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * Autodescubre los modelos :free de OpenRouter en runtime y los agrega a la
   * cadena de fallback. Si un modelo free esta caido, saturado o da 404,
   * el bot prueba el siguiente del catalogo en vez de quedarse sin responder.
   */
  openrouterAutoFree: process.env.OPENROUTER_AUTO_FREE !== "false",
  /** Maximo de modelos autodescubiertos que se consideran por request. */
  openrouterMaxFree: Number(process.env.OPENROUTER_MAX_FREE || 12),
  /**
   * Presupuesto TOTAL (ms) para toda la cadena de modelos (primario + fallbacks).
   * Pasado este tiempo, se corta y se responde con lo que haya o el fallback local.
   * Controla que el usuario no espere demasiado: ve "pensando" y luego respuesta.
   */
  openaiChainTimeoutMs: Number(process.env.OPENAI_CHAIN_TIMEOUT_MS || 20_000),
  /** Timeout por intento (ms): si un modelo tarda mas que esto, se descarta y sigue. */
  openaiAttemptTimeoutMs: Number(process.env.OPENAI_ATTEMPT_TIMEOUT_MS || 8_000),
  /** Ventana de gracia del primario (ms): tope antes de abrir los fallbacks en paralelo (se corta antes si el primario ya respondió). */
  openaiPrimaryGraceMs: Number(process.env.OPENAI_PRIMARY_GRACE_MS || 4_000),
  overpassUrl: process.env.OVERPASS_URL || "https://overpass.kumi.systems/api/interpreter",
  /** Archivo JSON con veterinarias con convenio (B2B). Ver data/sponsors.example.json */
  sponsorsFile: resolve(process.env.SPONSORS_FILE || resolve(here, "../data/sponsors.json")),
  /** Build del frontend que el server sirve en produccion. */
  clientDist: resolve(repoRoot, process.env.CLIENT_DIST || "client/dist"),

  // Stripe (B2B). En desarrollo usar claves de TEST (sk_test_ / pk_test_).
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripeCurrency: process.env.STRIPE_CURRENCY || "usd",
  /** Precio mensual por tier, en centavos de la moneda configurada. */
  tierAmounts: {
    1: Number(process.env.TIER_PRICE_1 || 2900),
    2: Number(process.env.TIER_PRICE_2 || 7900),
    3: Number(process.env.TIER_PRICE_3 || 14900),
  } as Record<number, number>,

  // Notificaciones: push del navegador (Web Push / VAPID).
  appUrl: process.env.APP_URL || "http://localhost:5173",
  vapid: {
    subject: process.env.VAPID_SUBJECT || "mailto:no-reply@vetibot.app",
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
  },
};

/**
 * Validaciones de seguridad que deben cortar el arranque en PRODUCCIÓN
 * (NODE_ENV=production). En dev solo se advierte por consola, para no
 * trabar el flujo local de un desarrollador nuevo.
 *
 * - JWT_SECRET: no puede quedar en el valor de ejemplo ni ser demasiado corto
 *   (un secreto débil permite falsificar tokens de sesión).
 * - CORS_ORIGIN: vacío = se acepta cualquier origen (documentado como "solo
 *   dev" en .env.example); en producción eso habilita CSRF-like abuse desde
 *   cualquier sitio que use el token del usuario.
 */
export function assertProductionSafety(): void {
  const problems: string[] = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith("cambia_")) {
    problems.push(
      "JWT_SECRET no está definido (o quedó en el valor de ejemplo). Generá uno con `openssl rand -hex 32`."
    );
  } else if (process.env.JWT_SECRET.length < 32) {
    problems.push("JWT_SECRET es demasiado corto (usá al menos 32 caracteres, ej: `openssl rand -hex 32`).");
  }

  if (!config.corsOrigin) {
    problems.push(
      "CORS_ORIGIN está vacío: en producción eso permite peticiones autenticadas desde cualquier origen. Definí los dominios permitidos (ej: https://tu-dominio.app)."
    );
  }

  if (problems.length === 0) return;

  const message = `[vetibot] Configuración insegura para producción:\n${problems.map((p) => ` - ${p}`).join("\n")}`;

  if (isProduction) {
    console.error(message);
    console.error("[vetibot] Arranque abortado. Corregí las variables de entorno e intentá de nuevo.");
    process.exit(1);
  } else {
    console.warn(message);
  }
}