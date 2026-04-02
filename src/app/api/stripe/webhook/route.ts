import { NextRequest, NextResponse } from "next/server";
import { stripe, tierFromPriceId } from "@/lib/stripe-config";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  if (webhookSecret && signature) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("[Stripe Webhook] Signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    // No webhook secret configured — parse directly (dev mode)
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error("[Stripe Webhook] Supabase admin client not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const tier = session.metadata?.plan_tier;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        if (userId) {
          await supabase
            .from("account_profiles")
            .update({
              approval_status: "approved",
              approved_at: new Date().toISOString(),
              plan_tier: tier || "complete",
              stripe_customer_id: customerId || null,
            })
            .eq("user_id", userId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.supabase_user_id;
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const status = subscription.status;

        if (userId && priceId) {
          const tier = tierFromPriceId(priceId);
          const updates: Record<string, unknown> = {
            plan_tier: tier,
            stripe_subscription_status: status,
          };

          if (status === "active" || status === "trialing") {
            updates.approval_status = "approved";
          } else if (status === "canceled" || status === "unpaid") {
            updates.approval_status = "suspended";
          }

          await supabase
            .from("account_profiles")
            .update(updates)
            .eq("user_id", userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          await supabase
            .from("account_profiles")
            .update({
              approval_status: "suspended",
              stripe_subscription_status: "canceled",
            })
            .eq("user_id", userId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        if (customerId) {
          // Find user by stripe_customer_id
          const { data: profile } = await supabase
            .from("account_profiles")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();

          if (profile) {
            await supabase
              .from("account_profiles")
              .update({ stripe_subscription_status: "past_due" })
              .eq("user_id", profile.user_id);
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
