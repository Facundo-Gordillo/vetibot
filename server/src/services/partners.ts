import { db, now } from "../db/index.js";

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
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planAmount: number | null;
  osmKey: string | null;
}

export interface PartnerRow {
  id: number;
  user_id: number;
  vet_name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius_km: number;
  tier: number;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_amount: number | null;
  osm_key: string | null;
}

function mapRow(r: PartnerRow): Partner {
  return {
    id: r.id,
    userId: r.user_id,
    vetName: r.vet_name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    radiusKm: r.radius_km,
    tier: r.tier,
    status: r.status as Partner["status"],
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
    planAmount: r.plan_amount,
    osmKey: r.osm_key,
  };
}

export function getPartnerForUser(userId: number): Partner | null {
  const row = db
    .prepare("SELECT * FROM partners WHERE user_id = ?")
    .get(userId) as PartnerRow | undefined;
  return row ? mapRow(row) : null;
}

export function getPartnerBySubscriptionId(subscriptionId: string): Partner | null {
  const row = db
    .prepare("SELECT * FROM partners WHERE stripe_subscription_id = ?")
    .get(subscriptionId) as PartnerRow | undefined;
  return row ? mapRow(row) : null;
}

export function getActivePartners(): Partner[] {
  const rows = db
    .prepare("SELECT * FROM partners WHERE status = 'active'")
    .all() as unknown as PartnerRow[];
  return rows.map(mapRow);
}

export function upsertPartner(
  userId: number,
  data: {
    vetName: string;
    address?: string | null;
    lat: number;
    lng: number;
    radiusKm: number;
    tier: number;
    status?: Partner["status"];
    planAmount?: number | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    osmKey?: string | null;
  }
): Partner {
  const existing = getPartnerForUser(userId);
  const status = data.status ?? existing?.status ?? "none";
  const amount = data.planAmount !== undefined ? data.planAmount : (existing?.planAmount ?? null);
  const customer =
    data.stripeCustomerId !== undefined ? data.stripeCustomerId : (existing?.stripeCustomerId ?? null);
  const sub =
    data.stripeSubscriptionId !== undefined
      ? data.stripeSubscriptionId
      : (existing?.stripeSubscriptionId ?? null);
  const osmKey = data.osmKey !== undefined ? data.osmKey : (existing?.osmKey ?? null);
  const address = data.address !== undefined ? data.address : (existing?.address ?? null);

  if (existing) {
    db.prepare(
      `UPDATE partners SET vet_name=?, address=?, lat=?, lng=?, radius_km=?, tier=?, status=?,
       plan_amount=?, stripe_customer_id=?, stripe_subscription_id=?, osm_key=?, updated_at=?
       WHERE user_id=?`
    ).run(
      data.vetName,
      address,
      data.lat,
      data.lng,
      data.radiusKm,
      data.tier,
      status,
      amount,
      customer,
      sub,
      osmKey,
      now(),
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO partners
        (user_id, vet_name, address, lat, lng, radius_km, tier, status, plan_amount,
         stripe_customer_id, stripe_subscription_id, osm_key, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      userId,
      data.vetName,
      address,
      data.lat,
      data.lng,
      data.radiusKm,
      data.tier,
      status,
      amount,
      customer,
      sub,
      osmKey,
      now(),
      now()
    );
  }
  return getPartnerForUser(userId)!;
}

/** Activa (o cancela) la suscripción del partner. */
export function setPartnerStatus(userId: number, status: Partner["status"]) {
  db.prepare("UPDATE partners SET status=?, updated_at=? WHERE user_id=?").run(
    status,
    now(),
    userId
  );
}