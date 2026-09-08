import OpeningHours from "opening_hours";
import { config } from "../config.js";
import type { VetPlace } from "../types.js";
import { getSponsors as getJsonSponsors } from "./sponsors.js";
import { getActivePartners } from "./partners.js";

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassEl[];
}

/** Distancia en metros (fórmula de Haversine) entre dos coordenadas. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function buildAddress(tags: Record<string, string>): string {
  const street = tags["addr:street"] ?? "";
  const housenumber = tags["addr:housenumber"] ?? "";
  const city = tags["addr:city"] ?? tags["addr:town"] ?? "";
  return [street && `${street} ${housenumber}`, city].filter(Boolean).join(", ");
}

const FALLBACK_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function queryOverpass(query: string): Promise<OverpassResponse> {
  const candidates = [...new Set([config.overpassUrl, ...FALLBACK_ENDPOINTS])];

  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "VetiBot-app/0.1 (contacto: ejemplo@veti.app)",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) {
        console.warn(`[places] Endpoint ${endpoint} respondió ${res.status}.`);
        continue;
      }
      return (await res.json()) as OverpassResponse;
    } catch (err) {
      console.warn(`[places] Endpoint ${endpoint} falló: ${(err as Error).message}`);
    }
  }
  throw new Error("Ningún endpoint de Overpass disponible");
}

interface HoursInfo {
  openNow: boolean | null;
  nextChangeText: string | null;
}

/**
 * Interpreta el tag `opening_hours` de OpenStreetMap (formato estándar de la
 * comunidad) y devuelve si está abierto en este momento y cuándo cambia.
 */
function parseOpeningHours(value: string, date = new Date()): HoursInfo {
  try {
    const oh = new OpeningHours(value);
    const state = oh.getState(date);
    const openNow = state === null ? null : Boolean(state);

    let nextChangeText: string | null = null;
    try {
      const next = oh.getNextChange(date);
      if (next instanceof Date && !Number.isNaN(next.getTime())) {
        const sameDay = next.toDateString() === date.toDateString();
        const time = next.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        nextChangeText = openNow
          ? `cierra hoy a las ${time}`
          : sameDay
            ? `abre hoy a las ${time}`
            : `abre mañana a las ${time}`;
      }
    } catch {
      /* sin próximo cambio publicable */
    }
    return { openNow, nextChangeText };
  } catch {
    // Horario mal formado o no interpretable: no afirmamos nada.
    return { openNow: null, nextChangeText: null };
  }
}

/** Quita espacios no significantes para comparar horarios tipo "Mo-Fr 09:00-18:00". */
function normalizeHours(value: string | null | undefined): string | null {
  const v = value?.trim().replace(/\s+/g, " ");
  return v || null;
}

// Datos internos de cada resultado (para el matching con partners).
interface Scored extends VetPlace {
  dist: number;
  lat: number;
  lng: number;
  tier?: number;
  pay?: number;
}

interface SponsorInfo {
  badge: string;
  tier: number;
  pay: number;
}

/**
 * Calcula qué sponsors (partners activos + convenios JSON) aplican a esta
 * búsqueda. La cobertura del partner es un radio en km desde su punto: entra
 * si la ubicación del usuario cae dentro. Luego se vincula a la veterinaria
 * por osm_key o (si no está en OSM todavía) por cercanía al local.
 */
function computeSponsors(places: Scored[], lat: number, lng: number): Map<string, SponsorInfo> {
  const result = new Map<string, SponsorInfo>();

  // Convenios cargados por archivo JSON (overlay manual).
  for (const [osmKey, s] of getJsonSponsors()) {
    result.set(osmKey, { badge: s.badge, tier: 1, pay: s.priority });
  }

  const partners = getActivePartners();
  for (const p of partners) {
    const toUser = haversineMeters(lat, lng, p.lat, p.lng);
    if (toUser > p.radiusKm * 1000) continue; // el usuario está fuera de la zona que paga

    const match = p.osmKey
      ? places.find((pl) => pl.osmKey === p.osmKey)
      : places.find((pl) => haversineMeters(p.lat, p.lng, pl.lat, pl.lng) <= 200);

    if (match) {
      result.set(match.osmKey, {
        badge: "⭐ Socio Veti",
        tier: p.tier,
        pay: p.planAmount ?? 0,
      });
    }
  }
  return result;
}

export async function findNearbyVets(
  lat: number,
  lng: number,
  radiusMeters = 8000
): Promise<VetPlace[]> {
  // Bono cuadrangular ~ cuadrado de lado = 2*radio en metros.
  const dLat = radiusMeters / 111_320;
  const dLon = radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

  const south = lat - dLat;
  const north = lat + dLat;
  const west = lng - dLon;
  const east = lng + dLon;

  const query = `
[out:json][timeout:25];
(
  node["amenity"="veterinary"](${south},${west},${north},${east});
  way["amenity"="veterinary"](${south},${west},${north},${east});
  relation["amenity"="veterinary"](${south},${west},${north},${east});
);
out center;
`;

  try {
    const data = await queryOverpass(query);

    const places: Scored[] = [];

    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const name = tags.name ?? tags.brand ?? "";
      const elLat = el.center?.lat ?? el.lat;
      const elLon = el.center?.lon ?? el.lon;
      if (elLat == null || elLon == null) continue;

      const address = buildAddress(tags);
      // Descartamos resultados sin identidad: sin nombre y sin dirección.
      if (!name && !address) continue;

      const osmKey = `${el.type}:${el.id}`;
      const hoursRaw = normalizeHours(tags.opening_hours);
      const hours = parseOpeningHours(hoursRaw ?? "");

      const dist = haversineMeters(lat, lng, elLat, elLon);
      places.push({
        osmKey,
        name: name || "Veterinaria",
        address,
        rating: null, // se resuelve por lectura desde vet_ratings (por osmKey)
        ratingCount: 0,
        myRating: null,
        distanceMeters: dist,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
        website: tags.website ?? tags["contact:website"] ?? tags.url ?? null,
        openNow: hours.openNow,
        openingHours: hoursRaw,
        nextChangeText: hours.nextChangeText,
        sponsored: false,
        badge: null,
        dist,
        lat: elLat,
        lng: elLon,
      });
    }

    // Sponsors aplicables: partners con radio que cubre al usuario + JSON overlay.
    const sponsors = computeSponsors(places, lat, lng);
    for (const p of places) {
      const s = sponsors.get(p.osmKey);
      if (s) {
        p.sponsored = true;
        p.badge = s.badge;
        (p as Scored & { tier?: number; pay?: number }).tier = s.tier;
        (p as Scored & { pay?: number }).pay = s.pay;
      }
    }

    // Ranking:
    //  0) Sponsor con tier más alto y abierto/sin datos (tier 3 > 2 > 1).
    //  1) Orgánica abierta.  2) Horario desconocido.  3) Cerradas (incl. sponsor cerrado).
    const rank = (p: Scored) => {
      if (p.sponsored && p.openNow !== false) return 0;
      if (p.openNow === true) return 1;
      if (p.openNow === null) return 2;
      return 3;
    };

    places.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      // Dentro de los sponsors: tier mayor primero; mismo tier → quien más paga.
      if (a.sponsored && b.sponsored) {
        const ta = (a as Scored & { tier?: number }).tier ?? 1;
        const tb = (b as Scored & { tier?: number }).tier ?? 1;
        if (ta !== tb) return tb - ta;
        const pa = (a as Scored & { pay?: number }).pay ?? 0;
        const pb = (b as Scored & { pay?: number }).pay ?? 0;
        if (pa !== pb) return pb - pa;
      } else if (a.sponsored !== b.sponsored) {
        return a.sponsored ? -1 : 1;
      }
      return a.dist - b.dist;
    });

    return places
      .slice(0, 5)
      .map(({ dist: _dist, lat: _lat, lng: _lng, tier: _t, pay: _p, ...rest }) => rest);
  } catch (err) {
    console.error("[places] Error consultando Overpass:", err);
    return [];
  }
}