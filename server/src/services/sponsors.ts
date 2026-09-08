import { existsSync, readFileSync } from "node:fs";
import { config } from "../config.js";

export interface Sponsor {
  badge: string;
  priority: number;
}

let cache: Map<string, Sponsor> | null = null;

interface SponsorRow {
  osm_key: string;
  badge?: string;
  priority?: number;
}

/**
 * Carga los convenios B2B desde un archivo JSON (default: data/sponsors.json).
 *
 * Estructura del archivo:
 *   [ { "osm_key": "node:1234567", "badge": "⭐ Socios Veti", "priority": 1 }, ... ]
 *
 * El `osm_key` es el identificador estable de la veterinaria en OpenStreetMap
 * (se devuelve en cada tarjeta). Las veterinarias con convenio se muestran
 * destacadas y ordenadas primero en las recomendaciones.
 */
function load(): Map<string, Sponsor> {
  if (cache) return cache;
  cache = new Map();
  try {
    if (!existsSync(config.sponsorsFile)) {
      return cache;
    }
    const rows = JSON.parse(readFileSync(config.sponsorsFile, "utf8")) as SponsorRow[];
    for (const row of rows) {
      if (row?.osm_key) {
        cache.set(row.osm_key, {
          badge: row.badge || "⭐ Destacado",
          priority: row.priority || 0,
        });
      }
    }
    console.log(`[sponsors] Convenios cargados: ${cache.size}`);
  } catch (err) {
    console.warn("[sponsors] No se pudieron cargar los convenios:", err);
  }
  return cache;
}

export function getSponsors(): Map<string, Sponsor> {
  return load();
}
