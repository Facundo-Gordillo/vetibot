import OpenAI from "openai";
import { config } from "../config.js";
import type { AiReply, Category } from "../types.js";

export interface AiContext {
  now?: string;
  location?: string;
  pets?: string;
}

const SYSTEM_PROMPT = `ROL
Eres "Veti", el asistente de la app VetBot, un asistente de TRIAGE veterinario de emergencia. Sos una ayuda rápida y un primer filtro de información, NO un veterinario ni un reemplazo de la consulta. Tu trabajo: recaudar información, clasificar la urgencia en un nivel de prioridad interno (código 🟢 / 🟡 / 🔴) y guiar al dueño al siguiente paso correcto.

LOS NIVELES DE PRIORIDAD (tu máquina de estados)

🟢 VERDE — "Recolectar y orientar". CUÁNDO: poca información, síntomas leves, consultas generales (alimentación, comportamiento, cuidados, prevención) o signos de baja gravedad. QUÉ HACÉS:
- Hacés preguntas para armar el cuadro: especie, edad, sexo/castrado, peso aproximado, hace cuánto empezó, qué cambió (apetito, agua, energía, deposiciones, vómitos), medicación, acceso a algo tóxico. Máximo 1-2 preguntas por mensaje, y explicás brevemente por qué preguntás ("para descartar X").
- Si mandan foto/video: describís qué ves, señalás qué te llama la atención y pedís contexto. NUNCA diagnosticás solo por imagen.
- Podés dar orientación general y cuidados básicos, siempre con el deslinde: "esto es orientación preliminar y no reemplaza la consulta veterinaria".
- Si aparece un signo de alarma → subís de nivel.

🟡 AMARILLO — "Evaluar severidad". CUÁNDO: síntomas que podrían ser serios pero no de muerte inmediata, signos persistentes, o dudás entre verde y rojo. QUÉ HACÉS:
- Dejás de dar "diagnóstico preliminar" y te enfocás en: ¿esto puede ser grave?
- Preguntás severidad y evolución: ¿empeoró en las últimas horas?, ¿se para y camina?, ¿come y bebe?, ¿respira raro?, ¿vómitos/diarrea: hace cuánto y con qué frecuencia?, ¿color de encías?, ¿está decaído?
- Aclaras que sos una ayuda rápida, no un veterinario.
- Recomendás vigilancia activa + consulta veterinaria en las próximas horas si no mejora o empeora. Listás las señales de alarma para saber CUÁNDO volver o ir directamente a la clínica.
- Si confirmás una bandera roja → 🔴.

🔴 ROJO — "Emergencia: actuar ya". CUÁNDO: banderas rojas confirmadas o deterioro rápido. QUÉ HACÉS:
- Dejás de preguntar. Sin cuestionarios. El mensaje central: "Esto es una emergencia. Llevá al animal a un veterinario YA."
- Buscás veterinarias: pedís/obtenés la ubicación y el horario actual. Si no la tenés, pedila, pero si es rojo el dueño debe salir igual a la clínica más cercana.
- Das MÁXIMO 2-3 indicaciones de manejo seguras y cortas (ej: abrigarlo, no darle de comer/beber si hay vómitos o sospecha de torsión, transportarlo con cuidado). Nada que retrase la salida.
- Tono firme pero calmo. Nada de pánico, nada de minimizar.
- Si no podés confirmar rojo pero hay duda razonable de peligro → tratás como rojo.

BANDERAS ROJAS (disparan 🔴 automáticamente): dificultad para respirar / jadeo constante / encías azuladas o lengua morada; colapso, desmayo, no puede pararse; convulsiones; sangrado profuso o que no para; intoxicación conocida o sospechada (chocolate, uvas, paracetamol, raticida, plantas); trauma (atropellamiento, caída de altura, pelea grave); abdomen duro y distendido con intentos de vomitar sin éxito (torsión de estómago); parto complicado (>2-4 h sin expulsar o cría atascada); vómitos o diarrea con sangre, o vómitos repetidos que impiden retener agua; cachorros/cony los/conejos y animales pequeños se descompensan mucho más rápido → ante la duda subí el nivel; cualquier deterioro súbito o "no reacciona como siempre".

REGLAS DE TRANSICIÓN: ante la duda entre dos niveles → el más ALTO. Rojo NO baja sin mejoría clara y sostenida, y aun así siempre recomendás seguimiento. El nivel de prioridad se actualiza con cada mensaje.

BÚSQUEDA DE VETERINARIAS: el sistema por detrás busca y muestra las clínicas cercanas como tarjetas con nombre real, dirección, teléfono, distancia y horario real de apertura. Las prioriza según disponibilidad: primero las que están ABIERTAS en este momento (y las aliadas destacadas), y las cerradas quedan al final con su horario. VOS NO inventes clínicas ni horarios: NUNCA escribas en "message" nombres, direcciones, teléfonos ni horarios de veterinarias (es peligroso: podrían ser falsos). En tu mensaje, si hace falta, decí algo general como "Te estoy mostrando las veterinarias más cercanas y las que están abiertas abajo 👇" y dejalas que aparezcan como tarjetas. No listes establecimientos vos.

GUARDARRAÍLES (no negociables)
- Nunca afirmás un diagnóstico con certeza ("puede ser...", "es compatible con..." como máximo).
- Nunca recetás medicamentos ni das dosis; si te preguntan, explicás por qué no.
- Nunca sugerís inducir vómito como regla general.
- Si el dueño insiste en algo peligroso → redirigís firme pero amable.
- No atendés emergencias humanas → indicás llamar a emergencias médicas.
- Si te falta información clave para clasificar → asumís verde y preguntás, no asumís rojo ni negativo.
- Si el caso es crónico o repetitivo → recomendás consulta presencial.

TONO Y ESTILO: Español claro, cálido, directo. Sin tecnicismos sin explicar. Validás la preocupación ("hiciste bien en consultar"). Verde: conversacional y didáctico. Amarillo/Rojo: frases cortas, acción primero. SIEMPRE que des orientación: deslinde de que no reemplaza la consulta veterinaria. Cerrá CADA turno con un siguiente paso claro.

FORMATO DE SALIDA: respondé ÚNICAMENTE con un objeto JSON válido, donde "message" es tu respuesta AL USUARIO, y "category" es tu clasificación INTERNA (no la mostrés al usuario ni la menciones en "message"; usá un tono natural que describa si es leve, moderado o de emergencia sin etiquetas de colores). { "category": "green"|"yellow"|"red", "message": "...", "pet_name": "..."|null, "animal_type": "..."|null, "follow_up_delay_hours": numero }.
Usá markdown simple en "message" (negritas **...**, listas) para mensajes claros.`;

export function buildSystemPrompt(ctx: AiContext): string {
  let extra = "";

  if (ctx.now) {
    extra += `\nCONTEXTO: fecha y hora ahora: ${ctx.now}. Usá esto para juzgar horarios y urgencia.\n`;
  }
  if (ctx.location) {
    extra += `CONTEXTO: ubicación compartida por el dueño: ${ctx.location} (lat, lng).\n`;
  }
  if (ctx.pets) {
    extra += `RECORDATORIO DE CONTEXTO (usalo para personalizar y recordarle al dueño su caso): ${ctx.pets}\n`;
  }

  return `${SYSTEM_PROMPT}${extra}`;
}

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

const JSON_SCHEMA = {
  name: "veti_reply",
  strict: true,
  schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: ["green", "yellow", "red"] },
      message: { type: "string" },
      pet_name: { type: ["string", "null"] },
      animal_type: { type: ["string", "null"] },
      follow_up_delay_hours: { type: "number" },
    },
    required: ["category", "message", "pet_name", "animal_type", "follow_up_delay_hours"],
    additionalProperties: false,
  },
} as const;

const RED_FLAGS: Array<{ label: string; regex: RegExp }> = [
  { label: "no respira", regex: /\bno (respira|puede respirar)\b|ahoga[ndrne]?s?|se ahoga|jadeando|jadea/ },
  { label: "mucosas", regex: /enc[íi]as (azul|gris|morad|p[áa]lid)|lengua (morada|p[áa]lida)/ },
  { label: "colapso", regex: /desmay[oó]|colaps[oa]|no se (para|puede parar)|no puede caminar|se cay[oó]/ },
  { label: "convulsión", regex: /convulsion[ae]|convulsiones|ataqu(?:e|é) epil[ée]ptico/ },
  { label: "sangrado", regex: /hemorragia|sangra(do|ndo)|no para de sangrar|sangre en la materia|sangre en el v[oó]mito/ },
{ label: "intoxicación", regex: /intoxicad[oa]?|envenenad[oa]?|veneno|raticida|paracetamol|ibuprofeno|anticoagulante|lirio|palo de brasil|chocolate|uvas/ },
  { label: "trauma", regex: /atropell[oa]?|cay[oó] del (balc[oó]n|piso alto)|pelea de perros|lo mordieron|lo pis[oó]/ },
  { label: "torsión", regex: /abdomen (duro|distendido|hinchado)|torsi[oó]n|intenta vomitar sin [ée]xito/ },
  { label: "parto", regex: /parto (complicado|que no avanz)|cachorrito atascado|no expulsa|lleva (2|3|4) horas de parto/ },
  { label: "vomito sangre", regex: /v[oó]mitos? con sangre|vomita sangre|diarrea con sangre|sangre en la diarrea/ },
  { label: "deterioro", regex: /se est[áa] muriendo|se muere|empeor[áa] (r[áa]pido|de golpe)|no reacciona|no responde|est[áa] muy mal/ },
];

/** Detección determinística: señala si el texto contiene una bandera roja (piso del nivel de prioridad). */
export function hasRedFlag(text: string): boolean {
  const lower = text.toLowerCase();
  return RED_FLAGS.some((f) => f.regex.test(lower));
}

function fallbackCategory(text: string): Category {
  const lower = text.toLowerCase();
  if (RED_FLAGS.some((f) => f.regex.test(lower))) return "red";
  if (
    /vomita|v[oó]mito|diarrea|fiebre|tos|tosiendo|dolor|herida|no come|deca[íi]do|letargo|garrapata|pulgas|alergia|bulto|cojea|rechina/.test(
      lower
    )
  )
    return "yellow";
  return "green";
}

function fallbackReply(text: string, category: Category): AiReply {
  const lower = text.toLowerCase();
  const petMatch = lower.match(/\b(mi|a mi)\s+(perr[oa]|gat[oa]|conejo|cobaya|hamster|hámster|lora|loro|ave|tortuga)\b/i);
  const animalType = petMatch?.[2] ?? null;
  const delays: Record<Category, number> = { green: 48, yellow: 24, red: 4 };

  if (category === "red") {
    return {
      category,
      message:
        "🚨 Esto es una **emergencia**. Sacá al animal y **andá YA a la clínica veterinaria más cercana**. No le des de comer ni de beber y mantenelo calmo y abrigado.\n\nTe estoy buscando veterinarias cerca de tu ubicación.",
      petName: null,
      animalType,
      followUpDelayHours: delays[category],
    };
  }
  if (category === "yellow") {
    return {
      category,
      message:
        "🤔 Por lo que contás, esto puede ser moderado y conviene que un veterinario lo revise pronto, aunque no es una emergencia inmediata.\n\nTe estoy buscando veterinarias cerca para que puedas pedir turno.",
      petName: null,
      animalType,
      followUpDelayHours: delays[category],
    };
  }
  return {
    category,
    message:
      "🐾 ¡Hola! Soy Veti. Para ayudarte mejor, contame: ¿qué mascota tenés y qué le está pasando? (especie, edad y hace cuánto empezó el problema)",
    petName: null,
    animalType,
    followUpDelayHours: delays[category],
  };
}

interface RawReply {
  category?: unknown;
  message?: unknown;
  pet_name?: unknown;
  animal_type?: unknown;
  follow_up_delay_hours?: unknown;
}

/** Modelos free descubiertos en el catalogo de OpenRouter (cache 30 min). */
let discoveredFree: string[] | null = null;
let discoveredAt = 0;
const DISCOVER_TTL = 30 * 60 * 1000;

/**
 * Consulta el catalogo de OpenRouter y devuelve los modelos gratuitos
 * (ids que terminan en ":free" o con precio de prompt en 0). El resultado se
 * cachea 30 minutos. Si falla, devuelve la ultima lista conocida.
 */
async function discoverFreeOpenRouterModels(): Promise<string[]> {
  if (discoveredFree && Date.now() - discoveredAt < DISCOVER_TTL) return discoveredFree;
  try {
    const base = (config.openaiBaseUrl || "").replace(/\/+$/, "");
    if (!base || !config.openaiApiKey) return discoveredFree ?? [];
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return discoveredFree ?? [];
    const data = (await res.json()) as {
      data?: Array<{ id?: string; pricing?: { prompt?: string } }>;
    };
    const free = (data.data ?? [])
      .filter((m) => {
        if (typeof m?.id !== "string" || !m.id) return false;
        if (m.id.endsWith(":free")) return true;
        const prompt = Number(m?.pricing?.prompt ?? NaN);
        return Number.isFinite(prompt) && prompt === 0;
      })
      .map((m) => m!.id as string)
      .sort();
    if (free.length > 0) {
      discoveredFree = free;
      discoveredAt = Date.now();
      console.log(`[ai] Modelos free de OpenRouter: ${free.length} en catalogo.`);
    }
    return free;
  } catch (err) {
    console.warn("[ai] No se pudieron autodescubrir modelos free:", (err as Error).message);
    return discoveredFree ?? [];
  }
}

/**
 * Cadena de modelos a probar, en orden: primario → fallbacks de env → gratis
 * autodescubiertos. El primario (Nvidia en la config por defecto) siempre va
 * primero; si falla, caemos a cualquier otro free. Set deduplica.
 */
async function modelCandidates(): Promise<string[]> {
  const chain = new Set<string>();
  if (config.openaiModel) chain.add(config.openaiModel);
  for (const m of config.openaiFallbackModels) if (m) chain.add(m);
  if (config.openrouterAutoFree && config.openaiBaseUrl) {
    const free = await discoverFreeOpenRouterModels();
    for (const f of free.slice(0, config.openrouterMaxFree)) chain.add(f);
  }
  return [...chain];
}

/**
 * Un solo intento de llamada al modelo (devuelve el texto o null si falla).
 * El techo de tiempo es el MENOR entre el intento y el presupuesto total de la
 * cadena: si se agota el presupuesto global, se aborta aunque el modelo siga.
 */
async function attemptChat(
  client: OpenAI,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  useSchema: boolean,
  chainSignal: AbortSignal
): Promise<string | null> {
  // Combina el timeout por intento con el techo total de la cadena.
  const signal = AbortSignal.any([
    chainSignal,
    AbortSignal.timeout(config.openaiAttemptTimeoutMs),
  ]);
  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages,
        temperature: 0.4,
        max_tokens: 800,
        ...(useSchema
          ? { response_format: { type: "json_schema" as const, json_schema: JSON_SCHEMA } }
          : {}),
      },
      { signal }
    );
    return completion.choices[0]?.message?.content ?? "";
  } catch {
    return null;
  }
}

export async function getAiReply(
  userMessage: string,
  history: ChatHistoryItem[] = [],
  ctx: AiContext = {}
): Promise<AiReply> {
  if (!config.openaiApiKey) {
    console.warn("[ai] No hay key. Usando respuesta de respaldo.");
    return fallbackReply(userMessage, fallbackCategory(userMessage));
  }

  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl || undefined,
  });

  const redFlag = hasRedFlag(userMessage);
  let system = buildSystemPrompt(ctx);
  if (redFlag) {
    system += `\nIMPORTANTE: detecté una bandera roja en el mensaje del dueño. Clasificá "category" como "red" e informale que vaya a una emergencia YA.\n`;
  }

  const messages = [
    { role: "system" as const, content: system },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  // Presupuesto total: la cadena no puede pasarse de este tiempo. El usuario ve
  // "pensando" y, si todo falla, se cae al respaldo local dentro del presupuesto.
  const chainSignal = AbortSignal.timeout(config.openaiChainTimeoutMs);

  // Estrategia paralela para responder lo antes posible:
  //   1) Nvidia (primario) se intenta primero con una ventana corta de gracia.
  //   2) Si no responde a tiempo, los fallbacks free se lanzan EN PARALELO y gana
  //      el primero que devuelva contenido (ya no se espera modelo por modelo).
  const [primary, ...allFallbacks] = await modelCandidates();
  // Tope de concurrencia: lanzar TODOS los fallbacks (a veces >10 con el
  // catálogo autodescubierto) satura la key free de OpenRouter y termina
  // siendo más lento que probarlos de a pocos. Los primeros son los curados
  // por env (OPENROUTER_FREE_MODELS); el resto del catálogo queda de reserva
  // por si esta tanda entera falla.
  const FALLBACK_BATCH = 3;
  const fallbacks = allFallbacks.slice(0, FALLBACK_BATCH);
  const reserveFallbacks = allFallbacks.slice(FALLBACK_BATCH);

  // Intento del primer modelo: schema, y si lo rechaza, sin schema. Solo se
  // considera respuesta si el parse produce un mensaje REAL (no el placeholder
  // que se usa cuando el modelo no devuelve un JSON válido).
  async function attempt(model: string): Promise<string | null> {
    let c = await attemptChat(client, model, messages, true, chainSignal);
    if (!isUsefulReply(c)) c = await attemptChat(client, model, messages, false, chainSignal);
    return isUsefulReply(c) ? c : null;
  }

  const PRIMARY_GRACE_MS = config.openaiPrimaryGraceMs;
  let winner: { model: string; content: string } | null = null;

  // 1) Primario primero, con gracia: si responde pronto, es la respuesta.
  const primaryRunner = (async () => {
    if (!primary) return;
    const content = await attempt(primary);
    if (content) winner = { model: primary, content };
  })();

  // Ventana para el primario antes de abrir los fallbacks: si responde (bien o
  // mal) antes de que se cumpla la gracia, seguimos al toque (no esperamos el
  // resto del tiempo muerto).
  await Promise.race([
    primaryRunner,
    new Promise<void>((resolve) => {
      setTimeout(resolve, PRIMARY_GRACE_MS);
    }),
  ]);

  if (!winner && fallbacks.length > 0) {
    // 2) Fallbacks en paralelo: gana el que responda primero.
    const runners = fallbacks.map(async (model) => {
      if (winner) return; // ya hay respuesta
      const content = await attempt(model);
      if (content && !winner) winner = { model, content };
    });
    await Promise.race([
      Promise.all(runners),
      new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (winner) { clearInterval(check); resolve(); }
        }, 120);
        setTimeout(() => { clearInterval(check); resolve(); }, config.openaiChainTimeoutMs);
      }),
    ]);
  }

  // 3) Si la tanda curada también falló, probamos el resto del catálogo
  // autodescubierto (igual de a pocos, no todos juntos). El chainSignal ya
  // acota el tiempo real: esto no puede alargar la espera más allá del
  // presupuesto total de la cadena.
  if (!winner && reserveFallbacks.length > 0) {
    const runners = reserveFallbacks.slice(0, FALLBACK_BATCH).map(async (model) => {
      if (winner) return;
      const content = await attempt(model);
      if (content && !winner) winner = { model, content };
    });
    await Promise.race([
      Promise.all(runners),
      new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (winner) { clearInterval(check); resolve(); }
        }, 120);
        setTimeout(() => { clearInterval(check); resolve(); }, config.openaiChainTimeoutMs);
      }),
    ]);
  }

  // Espera a que el primario cierre su intento pendiente (si aún sigue).
  await primaryRunner;

  if (winner) {
    const winnerResult: { model: string; content: string } = winner;
    const reply = parseReply(winnerResult.content);
    // Piso determinístico: si hay bandera roja, nunca bajamos de red.
    if (redFlag) {
      reply.category = "red";
      reply.followUpDelayHours = Math.min(reply.followUpDelayHours, 4);
    }
    reply.message = stripFakeClinics(reply.message);
    console.log(`[ai] Respondió el modelo: ${winnerResult.model}`);
    return reply;
  }

  console.error("[ai] Ningún modelo free de la cadena respondió a tiempo; usando fallback local.");
  return fallbackReply(userMessage, fallbackCategory(userMessage));
}

/**
 * Recorta los bloques de clínicas inventadas que el modelo puede escribir
 * (encabezado tipo "Clínicas de guardia…:" seguido de una lista de puntos).
 * Las veterinarias reales se muestran aparte como tarjetas, así que estos
 * datos falsos son peligrosos (teléfonos/direcciones inventados) y se quitan.
 */
function stripFakeClinics(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  let removed = false;

  const headerRe =
    /(?:cl[íi]nicas?|veterinarias?|hospital|guardias?)\b.*?(?:cercan|ubicaci[óo]n|24h?|emergencia|guardia|de la zona)/i;

  while (i < lines.length) {
    const line = lines[i];
    if (!removed && headerRe.test(line)) {
      let j = i + 1;
      while (j < lines.length && /^\s*[-*•]\s/.test(lines[j])) j++;
      // Debe haber al menos 1 ítem de lista para considerarlo un bloque de clínicas.
      if (j > i + 1) {
        removed = true;
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }

  if (removed) {
    out.push("\n_*Los datos de las veterinarias están abajo en las tarjetas.*_");
  }
  return out.join("\n");
}

/** Última línea real de JSON (tolera envolturas de Markdown o texto extra). */
function extractJson(content: string): RawReply | null {
  let text = content.trim();
  text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as RawReply;
  } catch {
    return null;
  }
}

/**
 * True si el contenido tiene un mensaje útil (JSON con un "message" no vacío),
 * es decir, NO es un fallo ni el placeholder de parse vacío.
 */
function isUsefulReply(content: string | null | undefined): boolean {
  if (!content) return false;
  const parsed = extractJson(content);
  if (!parsed) return false;
  if (typeof parsed.message !== "string") return false;
  const msg = parsed.message.trim();
  if (!msg) return false;
  // El placeholder que se usa cuando no hay mensaje no cuenta como respuesta útil.
  return !msg.includes("No entendí bien");
}

function parseReply(content: string): AiReply {
  const parsed = extractJson(content);
  const message = typeof parsed?.message === "string" ? parsed.message.trim() : "";

  return {
    category: ["green", "yellow", "red"].includes(String(parsed?.category ?? ""))
      ? (parsed!.category as Category)
      : "green",
    message:
      message || "No entendí bien. ¿Podés contarme con más detalle qué le pasa a tu mascota?",
    petName: typeof parsed?.pet_name === "string" ? parsed.pet_name : null,
    animalType: typeof parsed?.animal_type === "string" ? parsed.animal_type : null,
    followUpDelayHours: Math.min(168, Math.max(1, Math.round(Number(parsed?.follow_up_delay_hours || 24)))),
  };
}