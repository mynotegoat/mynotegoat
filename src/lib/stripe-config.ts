import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

export const PLAN_PRICE_MAP: Record<string, { tier: string; label: string }> = {
  price_1TGoGfQUcjwOa1XTAuVVYNQ9: { tier: "tracking", label: "Tracking" },
  price_1TGoHRQUcjwOa1XT4tdRDBHM: { tier: "track_schedule", label: "Track & Schedule" },
  price_1TGoJ2QUcjwOa1XT9zrcwLua: { tier: "complete", label: "Complete" },
};

export const TIER_PRICE_MAP: Record<string, string> = {
  tracking: "price_1TGoGfQUcjwOa1XTAuVVYNQ9",
  track_schedule: "price_1TGoHRQUcjwOa1XT4tdRDBHM",
  complete: "price_1TGoJ2QUcjwOa1XT9zrcwLua",
};

export function tierFromPriceId(priceId: string): string {
  return PLAN_PRICE_MAP[priceId]?.tier ?? "complete";
}

export function labelFromPriceId(priceId: string): string {
  return PLAN_PRICE_MAP[priceId]?.label ?? "Unknown";
}
