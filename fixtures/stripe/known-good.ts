// Hand-authored, known-correct stripe-node 22 usage — proves the fixture can
// express a PASSING answer. See test/fixtures.test.ts.
//
// Exercises the drift-prone surface of v21/v22:
//   - the pinned apiVersion is a string LITERAL type, so any remembered older
//     version ("2024-06-20", "2025-08-27.basil") is a compile error
//   - decimal_string fields became Stripe.Decimal in v21, not string
//   - RequestOptions and params are no longer mixed: params first, options
//     second, and a per-request key goes in options as `apiKey`
//   - the per-request `host` override was removed entirely; it is client config
import Stripe from "stripe";

// v22 pins its own API version; passing the wrong literal will not compile.
export const stripe = new Stripe("sk_test_x", { apiVersion: "2026-07-29.dahlia" });

export async function createCustomer(email: string) {
  // Idempotency lives in RequestOptions (second arg), never in params.
  return stripe.customers.create({ email }, { idempotencyKey: `cust-${email}` });
}

export async function checkoutSession(price: string) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price, quantity: 1 }],
    success_url: "https://example.com/ok",
    cancel_url: "https://example.com/no",
  });
}

// v21: decimal_string fields are Stripe.Decimal. Reading one as a string fails.
export async function fxRate(sessionId: string): Promise<string | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const rate = session.currency_conversion?.fx_rate;
  return rate ? rate.toString() : null;
}

export async function onBehalfOf(accountId: string) {
  return stripe.customers.list({ limit: 5 }, { stripeAccount: accountId });
}

// A per-request key is an option, not a positional argument.
export async function withOtherKey(customerId: string, key: string) {
  return stripe.customers.retrieve(customerId, undefined, { apiKey: key });
}

export async function allCustomers() {
  const ids: string[] = [];
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    ids.push(customer.id);
  }
  return ids;
}

export function verifyWebhook(body: string, signature: string, secret: string) {
  const event = stripe.webhooks.constructEvent(body, signature, secret);
  if (event.type === "checkout.session.completed") {
    return event.data.object.id;
  }
  return null;
}

export async function refund(paymentIntentId: string, amount: number) {
  return stripe.refunds.create({ payment_intent: paymentIntentId, amount });
}

export async function cardErrorCode() {
  try {
    await stripe.paymentIntents.create({ amount: 100, currency: "usd" });
    return null;
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      return err.decline_code ?? null;
    }
    throw err;
  }
}
