import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase-admin";

// Raw body is required for Stripe signature verification — App Router provides it via req.text()
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY env var is not set");
  return new Stripe(key);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] signature error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // ── Handle events ────────────────────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;

    if (!userId) {
      console.warn("[stripe-webhook] checkout.session.completed missing client_reference_id");
      return NextResponse.json({ received: true });
    }

    try {
      const db = getAdminDb();
      await db.collection("users").doc(userId).update({
        subscriptionPlan: "pro",
        stripeSessionId: session.id,
        upgradedAt: new Date().toISOString(),
      });
      console.log(`[stripe-webhook] upgraded user ${userId} to Pro`);
    } catch (err) {
      console.error("[stripe-webhook] firestore update error:", err);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
