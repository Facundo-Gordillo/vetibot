import OpenAI, { toFile } from "openai";
import { config } from "../config.js";

export function transcriptionEnabled(): boolean {
  return Boolean(config.transcribeApiKey);
}

/** Adivina una extensión válida a partir del content-type del audio grabado en el browser. */
function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

/**
 * Transcribe un audio corto (mensaje de voz del chat) a texto en español.
 * Lanza si no hay proveedor configurado o si la transcripción falla.
 */
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  if (!config.transcribeApiKey) {
    throw new Error("La transcripción de voz no está configurada en el servidor.");
  }

  const client = new OpenAI({
    apiKey: config.transcribeApiKey,
    baseURL: config.transcribeBaseUrl,
  });

  const file = await toFile(buffer, `audio.${extensionFor(mimeType)}`, { type: mimeType });

  const result = await client.audio.transcriptions.create({
    file,
    model: config.transcribeModel,
    // El chat es 100% en español (AR); fijar el idioma mejora bastante la
    // precisión de Whisper respecto de dejar que lo detecte solo.
    language: "es",
  });

  return result.text.trim();
}
