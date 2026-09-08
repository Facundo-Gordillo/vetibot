export type Category = "green" | "yellow" | "red";

export interface AuthPayload {
  userId: number;
  email: string;
  name: string;
}

export interface VetPlace {
  /** Identificador estable del establecimiento en OSM (ej: "node:12345"). */
  osmKey: string;
  name: string;
  address: string | null;
  /** Calificación promedio aportada por usuarios de la app (null si no hay aún). */
  rating: number | null;
  ratingCount: number;
  /** Rating del usuario autenticado (1-5) si ya calificó. */
  myRating: number | null;
  distanceMeters: number | null;
  phone: string | null;
  website: string | null;
  /** null = no se pudo determinar el horario. */
  openNow: boolean | null;
  /** Texto de horario de apertura (formato OSM) si la veterinaria lo publicó. */
  openingHours: string | null;
  /** Descripción legible de cuándo cambia el estado (ej: "abre mañana a las 09:00"). */
  nextChangeText: string | null;
  /** Veterinaria con convenio destacado (B2B). */
  sponsored: boolean;
  badge: string | null;
}

export interface AiReply {
  category: Category;
  message: string;
  /** Se usa para armar el follow-up automático */
  petName: string | null;
  animalType: string | null;
  followUpDelayHours: number;
}