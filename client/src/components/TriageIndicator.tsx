import type { ChatMessage } from "../api";

type Level = "green" | "yellow" | "red";

export const CATEGORY_LABELS: Record<Level, string> = {
  green: "Consulta general",
  yellow: "Requiere atención",
  red: "Emergencia — actuar ya",
};

/** Ícono redundante al color: un usuario con daltonismo rojo-verde (~8% de
 * los hombres) no debe depender solo del borde de color para distinguir una
 * burbuja de emergencia de una informativa al repasar el historial. */
export const CATEGORY_ICONS: Record<Level, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};

/** Deriva el nivel actual a partir del último mensaje del bot que tenga categoría. */
export function currentLevel(messages: ChatMessage[]): Level | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && (m.category === "green" || m.category === "yellow" || m.category === "red")) {
      return m.category;
    }
  }
  return null;
}

/**
 * Indicador de triage persistente en el header del chat. Muestra el nivel
 * vigente (verde/amarillo/rojo) — el semáforo como identidad visual de la app.
 */
export default function TriageIndicator({ level }: { level: Level | null }) {
  if (!level) return null;
  return (
    <div className={`triage triage-${level}`} role="status" aria-live="polite">
      <span className="triage-dot" />
      <span className="triage-label">{CATEGORY_LABELS[level]}</span>
    </div>
  );
}