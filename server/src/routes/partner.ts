import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { requireAuth } from "../middlewares/auth.js";
import {
  getPartnerForUser,
  setPartnerStatus,
  upsertPartner,
  type Partner,
} from "../services/partners.js";

const router = Router();

const applySchema = z.object({
  vetName: z.string().trim().min(2).max(80),
  address: z.string().trim().max(160).optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(50),
  tier: z.number().int().min(1).max(3),
});

router.get("/pricing", (_req, res) => {
  res.json({
    currency: config.stripeCurrency,
    tiers: [
      { tier: 1, amountCents: config.tierAmounts[1] },
      { tier: 2, amountCents: config.tierAmounts[2] },
      { tier: 3, amountCents: config.tierAmounts[3] },
    ],
    stripePublishableKey: config.stripePublishableKey || null,
    sandbox: !config.stripeSecretKey,
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ partner: getPartnerForUser(req.user!.userId) });
});

// Alta/actualización de la ficha de la veterinaria (aún no paga → status 'none').
router.post("/apply", requireAuth, (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Datos inválidos" });
    return;
  }
  const userId = req.user!.userId;
  const { vetName, address, lat, lng, radiusKm, tier } = parsed.data;

  const partner = upsertPartner(userId, {
    vetName,
    address,
    lat,
    lng,
    radiusKm,
    tier,
    status: getPartnerForUser(userId)?.status ?? "none",
  });

  // En modo desarrollo (sin Stripe) el pago se simula: activás directo.
  if (!config.stripeSecretKey) setPartnerStatus(userId, "active");
  partner.status = getPartnerForUser(userId)?.status ?? "none";

  res.json({ partner });
});

// Genera el checkout de suscripción para el tier elegido.
router.post("/checkout", requireAuth, async (req, res) => {
  const parsed = z.object({ tier: z.number().int().min(1).max(3) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Tier inválido" });
    return;
  }
  const userId = req.user!.userId;
  const tier = parsed.data.tier;
  const partner = getPartnerForUser(userId);
  if (!partner) {
    res.status(400).json({ error: "Primero completá los datos de tu veterinaria" });
    return;
  }

  // Modo pruebas sin API key: simulamos el pago y activamos la suscripción.
  if (!config.stripeSecretKey) {
    upsertPartner(userId, { ...toData(partner), tier, planAmount: config.tierAmounts[tier] });
    setPartnerStatus(userId, "active");
    console.log(`[partner] Modo desarrollo: suscripción tier ${tier} activada (sin Stripe).`);
    res.json({ sandbox: true, url: null });
    return;
  }

  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(config.stripeSecretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      metadata: { userId: String(userId), tier: String(tier) },
      // Sin esto, la metadata solo vive en la Session: los eventos de webhook
      // que traen el objeto Subscription (customer.subscription.*) no podrían
      // resolver a qué usuario pertenecen.
      subscription_data: { metadata: { userId: String(userId), tier: String(tier) } },
      line_items: [
        {
          price_data: {
            currency: config.stripeCurrency,
            unit_amount: config.tierAmounts[tier],
            recurring: { interval: "month" },
            product_data: { name: `VetiBot · Plan Tier ${tier}` },
          },
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get("host")}/partner?success=1`,
      cancel_url: `${req.protocol}://${req.get("host")}/partner`,
    });

    // Guardamos el plan elegido apenas se crea la sesión.
    upsertPartner(userId, { ...toData(partner), tier, planAmount: config.tierAmounts[tier] });

    res.json({ sandbox: false, url: session.url, id: session.id });
  } catch (err) {
    // Express 4 no captura rechazos de promesas automáticamente: sin este
    // catch, un error de Stripe (key inválida, red caída) dejaba la
    // petición colgada sin respuesta hasta el timeout del cliente.
    console.error("[partner] Error creando sesión de Stripe:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "No se pudo iniciar el pago con Stripe. Intentá de nuevo." });
    }
  }
});

function toData(p: Partner): {
  vetName: string;
  address: string | null;
  lat: number;
  lng: number;
  radiusKm: number;
  tier: number;
} {
  return {
    vetName: p.vetName,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    radiusKm: p.radiusKm,
    tier: p.tier,
  };
}

export default router;