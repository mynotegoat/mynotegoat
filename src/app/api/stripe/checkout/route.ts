import { NextRequest, NextResponse } from "next/server";
import { stripe, TIER_PRICE_MAP } from "@/lib/stripe-config";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tier, userId, email } = body as {
      tier?: string;
      userId?: string;
      email?: string;
    };

    if (!tier || !userId || !email) {
      return NextResponse.json(
        { error: "Missing tier, userId, or email" },
        { status: 400 },
      );
    }

    const priceId = TIER_PRICE_MAP[tier];
    if (!priceId) {
      return NextResponse.json(
        { error: "Invalid plan tier" },
        { status: 400 },
      );
    }

    // Find or create Stripe customer for this user
    const existing = await stripe.customers.list({
      email,
      limit: 1,
    });

    let customerId: string;
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
    }

    // Store customer ID on the profile
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await supabase
        .from("account_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", userId);
    }

    const origin = request.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/auth/login?checkout=success`,
      cancel_url: `${origin}/auth/login?checkout=cancel`,
      metadata: { supabase_user_id: userId, plan_tier: tier },
      subscription_data: {
        metadata: { supabase_user_id: userId, plan_tier: tier },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Stripe Checkout]", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
