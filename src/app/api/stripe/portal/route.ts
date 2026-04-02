import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId } = body as { customerId?: string };

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing customerId" },
        { status: 400 },
      );
    }

    const origin = request.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Stripe Portal]", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
