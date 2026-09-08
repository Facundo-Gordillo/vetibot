export type Mode = "light" | "dark";
export type Motif = "none" | "dog" | "cat";
export type FontSize = "sm" | "md" | "lg";

export interface ColorPalette {
  id: string;
  label: string;
  emoji: string;
}

export const MODES: { id: Mode; label: string; emoji: string }[] = [
  { id: "light", label: "Claro", emoji: "☀️" },
  { id: "dark", label: "Oscuro", emoji: "🌙" },
];

export const MOTIFS: { id: Motif; label: string; emoji: string }[] = [
  { id: "none", label: "Sin motivo", emoji: "✨" },
  { id: "dog", label: "Perrito", emoji: "🐶" },
  { id: "cat", label: "Gatito", emoji: "🐱" },
];

/** Paletas de color del chat: cualquiera funciona en claro u oscuro. */
export const CHAT_COLORS: ColorPalette[] = [
  { id: "teal", label: "Teal", emoji: "🩵" },
  { id: "mint", label: "Menta", emoji: "🌿" },
  { id: "coral", label: "Coral", emoji: "🧡" },
  { id: "ocean", label: "Océano", emoji: "🌊" },
  { id: "lavanda", label: "Lavanda", emoji: "💜" },
  { id: "durazno", label: "Durazno", emoji: "🍑" },
];

export const FONT_SIZES: { id: FontSize; label: string }[] = [
  { id: "sm", label: "Chica" },
  { id: "md", label: "Normal" },
  { id: "lg", label: "Grande" },
];

export interface Appearance {
  mode: Mode;
  motif: Motif;
  color: string;
}

export interface Accessibility {
  fontSize: FontSize;
  highContrast: boolean;
  reduceMotion: boolean;
}

const APPEARANCE_KEY = "veti_appearance";
const ACCESS_KEY = "veti_access";

const DEFAULT_APPEARANCE: Appearance = { mode: "light", motif: "none", color: "teal" };
const DEFAULT_ACCESS: Accessibility = { fontSize: "md", highContrast: false, reduceMotion: false };

/** Migra el antiguo tema único (veti_theme) al nuevo esquema de dos dimensiones. */
function migrateLegacy(app: Appearance): Appearance {
  try {
    const legacy = localStorage.getItem("veti_theme");
    if (legacy) {
      localStorage.removeItem("veti_theme");
      if (legacy === "oscuro") return { ...app, mode: "dark" };
      if (legacy === "perrito") return { ...app, motif: "dog" };
      if (legacy === "gatito") return { ...app, motif: "cat" };
    }
  } catch {
    /* localStorage puede no estar disponible */
  }
  return app;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function getAppearance(): Appearance {
  const app = read(APPEARANCE_KEY, DEFAULT_APPEARANCE);
  if (!MODES.some((m) => m.id === app.mode)) app.mode = "light";
  if (!MOTIFS.some((m) => m.id === app.motif)) app.motif = "none";
  if (!CHAT_COLORS.some((c) => c.id === app.color)) app.color = "teal";
  return migrateLegacy(app);
}

export function getAccessibility(): Accessibility {
  const acc = read(ACCESS_KEY, DEFAULT_ACCESS);
  if (!FONT_SIZES.some((f) => f.id === acc.fontSize)) acc.fontSize = "md";
  return acc;
}

export function saveAppearance(app: Appearance): Appearance {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(app));
  } catch {
    /* sin storage */
  }
  applyAppearance(app);
  return app;
}

export function saveAccessibility(acc: Accessibility): Accessibility {
  try {
    localStorage.setItem(ACCESS_KEY, JSON.stringify(acc));
  } catch {
    /* sin storage */
  }
  applyAccessibility(acc);
  return acc;
}

export function applyAppearance(app: Appearance = getAppearance()): Appearance {
  const root = document.documentElement;
  root.dataset.mode = app.mode;
  root.dataset.motif = app.motif;
  root.dataset.color = app.color;
  return app;
}

export function applyAccessibility(acc: Accessibility = getAccessibility()): Accessibility {
  const root = document.documentElement;
  root.dataset.fontsize = acc.fontSize;
  root.dataset.contrast = acc.highContrast ? "high" : "normal";
  root.dataset.motion = acc.reduceMotion ? "off" : "on";
  return acc;
}

export function applyAll(): { app: Appearance; acc: Accessibility } {
  const app = applyAppearance();
  const acc = applyAccessibility();
  return { app, acc };
}

/** Compatibilidad: la app ahora aplica apariencia + accesibilidad juntas. */
export function applyTheme(_id?: string): string {
  applyAll();
  return getAppearance().mode;
}