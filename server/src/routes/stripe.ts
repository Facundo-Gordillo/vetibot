import { Router } from "express";
import express from "express";
import type { Response } from "express";
import { config } from "../config.js";
import {
  getPartnerBySubscriptionId,
  getPartnerForUser,
  setPartnerStatus,
  upsertPartner,
} from "../services/partners.js";

const router = Router();
export const stripeRouter = router;

// Webhook de Stripe: confirma el pago y activa/cancela la suscripción del partner.
// Debe montarse ANTES de express.json(): aquí leemos el body crudo para verificar la firma.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res: Response) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const payload = req.body as Buffer;

  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    console.warn("[stripe] Webhook recibido pero STRIPE_SECRET_KEY/WEBHOOK_SECRET no configurados.");
    res.status(400).json({ error: "Stripe no configurado" });
    return;
  }

try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(config.stripeSecretKey);
      const event = stripe.webhooks.constructEvent(
        payload,
        sig ?? "",
        config.stripeWebhookSecret
      );

    // Resuelve el partner primero por stripe_subscription_id (dato propio,
    // siempre confiable) y solo si no hay match cae a la metadata del evento.
    // Necesario porque no todos los objetos de Stripe cargan la misma metadata:
    // una Invoice no hereda la metadata de la Subscription ni de la Session.
    switch (event.type as string) {
      case "checkout.session.completed": {
        const session = event.data.object as {
          metadata?: Record<string, string>;
          subscription?: string | null;
          customer?: string | null;
        };
        const userId = Number(session.metadata?.userId ?? 0);
        const subId = session.subscription ?? null;
        const existing = userId ? getPartnerForUser(userId) : null;
        if (userId && subId && existing) {
          upsertPartner(userId, {
            vetName: existing.vetName,
            address: existing.address,
            lat: existing.lat,
            lng: existing.lng,
            radiusKm: existing.radiusKm,
            tier: existing.tier,
            status: "active",
            stripeSubscriptionId: subId,
            stripeCustomerId: session.customer ?? existing.stripeCustomerId,
          });
          console.log(`[stripe] Partner ${userId} activado (${subId}).`);
        }
        break;
      }
      case "customer.subscription.deleted":
      case "customer.subscription.canceled": {
        const sub = event.data.object as { id: string; metadata?: Record<string, string> };
        const userId = getPartnerBySubscriptionId(sub.id)?.userId ?? Number(sub.metadata?.userId ?? 0);
        if (userId) setPartnerStatus(userId, "cancelled");
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as {
          id: string;
          metadata?: Record<string, string>;
          status?: string;
        };
        const userId = getPartnerBySubscriptionId(sub.id)?.userId ?? Number(sub.metadata?.userId ?? 0);
        if (userId) setPartnerStatus(userId, sub.status === "active" ? "active" : "pending");
        break;
      }
      case "invoice.payment_failed": {
        // Una Invoice no lleva la metadata de la Subscription: hay que resolver
        // el partner por el id de subscription que trae el propio invoice.
        const invoice = event.data.object as { subscription?: string | null };
        const partner = invoice.subscription ? getPartnerBySubscriptionId(invoice.subscription) : null;
        if (partner) setPartnerStatus(partner.userId, "pending");
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[stripe] Webhook inválido:", err);
    res.status(400).json({ error: "Firma inválida" });
  }
});