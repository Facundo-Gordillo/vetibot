export interface Coords {
  lat: number;
  lng: number;
}

interface CachedCoords extends Coords {
  ts: number;
}

const LOC_KEY = "veti_loc";
/** Una ubicación se considera fresca durante este tiempo (ms). */
const FRESH_MS = 15 * 60 * 1000;

export function getCachedLocation(): Coords | null {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCoords;
    if (typeof parsed.lat !== "number" || typeof parsed.lng !== "number") return null;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function getCachedTs(): number | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOC_KEY) ?? "{}") as Partial<CachedCoords>;
    return typeof parsed.ts === "number" ? parsed.ts : null;
  } catch {
    return null;
  }
}

function saveCache(coords: Coords) {
  const ts = Date.now();
  localStorage.setItem(LOC_KEY, JSON.stringify({ ...coords, ts }));
}

/** Pide la ubicación al navegador y la guarda en caché local. */
export function requestLocation(): Promise<Coords> {
  return new Promise<Coords>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Tu navegador no soporta geolocalización."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        saveCache(coords);
        resolve(coords);
      },
      (err) => {
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Bloqueaste el acceso a tu ubicación. Activá el permiso en tu navegador."
              : "No pudimos obtener tu ubicación. Revisá los permisos."
          )
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

/**
 * Devuelve la ubicación disponible sin molestar: usa el caché si está fresca y,
 * si no, pide una nueva. Nunca rompe la llamada si no hay permiso (devuelve null).
 */
export async function ensureLocation(): Promise<Coords | null> {
  const cached = getCachedLocation();
  const ts = getCachedTs();
  if (cached && ts != null && Date.now() - ts < FRESH_MS) return cached;
  try {
    return await requestLocation();
  } catch {
    return cached;
  }
}

/** Fuerza una lectura nueva del GPS (por ejemplo al tocar el botón). */
export async function refreshLocation(): Promise<Coords> {
  return requestLocation();
}

export function isLocationStale(): boolean {
  const ts = getCachedTs();
  if (ts == null) return true;
  return Date.now() - ts > FRESH_MS;
}
