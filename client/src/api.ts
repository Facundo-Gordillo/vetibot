export interface VetPlace {
  osmKey: string;
  name: string;
  address: string | null;
  rating: number | null;
  ratingCount: number;
  myRating: number | null;
  distanceMeters: number | null;
  phone: string | null;
  website: string | null;
  openNow: boolean | null;
  openingHours: string | null;
  nextChangeText: string | null;
  sponsored: boolean;
  badge: string | null;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  category: "green" | "yellow" | "red" | null;
  content: string;
  created_at: string;
  vets: VetPlace[];
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Partner {
  id: number;
  userId: number;
  vetName: string;
  address: string | null;
  lat: number;
  lng: number;
  radiusKm: number;
  tier: number;
  status: "none" | "pending" | "active" | "cancelled";
  planAmount: number | null;
}

export interface TierPricing {
  tier: number;
  amountCents: number;
}

export interface PartnerPricing {
  currency: string;
  tiers: TierPricing[];
  stripePublishableKey: string | null;
  sandbox: boolean;
}

const TOKEN_KEY = "veti_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Error de conexión con el servidor");
  }
  return data as T;
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getHistory: () => request<{ messages: ChatMessage[] }>("/api/chat/history"),

  getVoiceStatus: () => request<{ enabled: boolean }>("/api/chat/voice-status"),

  /** Sube un audio grabado en el browser y devuelve el texto transcripto. */
  transcribeAudio: async (blob: Blob): Promise<{ text: string }> => {
    const token = getToken();
    const headers: Record<string, string> = { "Content-Type": blob.type || "audio/webm" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/chat/transcribe", {
      method: "POST",
      headers,
      body: blob,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error ?? "No se pudo transcribir el audio");
    }
    return data as { text: string };
  },

  sendMessage: (body: {
    message: string;
    location?: { lat: number; lng: number };
  }) =>
    request<{ messages: ChatMessage[]; category: string }>("/api/chat/send", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  clearChat: () =>
    request<{ ok: boolean }>("/api/chat/clear", { method: "POST" }),

  resetChat: () =>
    request<{ ok: boolean }>("/api/chat/reset", { method: "POST" }),

  rateVet: (body: { osmKey: string; rating: number }) =>
    request<{ ok: boolean }>("/api/vets/rate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateLocation: (body: { lat: number; lng: number }) =>
    request<{ ok: boolean }>("/api/user/location", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getPartnerPricing: () => request<PartnerPricing>("/api/partner/pricing"),

  getPartner: () => request<{ partner: Partner | null }>("/api/partner/me"),

  applyPartner: (body: {
    vetName: string;
    address?: string | null;
    lat: number;
    lng: number;
    radiusKm: number;
    tier: number;
  }) =>
    request<{ partner: Partner }>("/api/partner/apply", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createPartnerCheckout: (body: { tier: number }) =>
    request<{ sandbox: boolean; url: string | null; id?: string }>("/api/partner/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getNotificationPrefs: () =>
    request<{
      prefs: { push: boolean };
      configured: {
        push: boolean;
        vapidPublicKey: string | null;
        appUrl: string;
      };
    }>("/api/notifications/prefs"),

  setNotificationPrefs: (body: { push?: boolean }) =>
    request<{ prefs: { push: boolean } }>("/api/notifications/prefs", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  subscribePush: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: boolean }>("/api/notifications/subscribe", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  testNotification: () =>
    request<{ ok: boolean }>("/api/notifications/test", {
      method: "POST",
      body: JSON.stringify({}),
    }),
};