import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const stripeSpec: LibrarySpec = {
  id: "stripe",
  packageName: "stripe",
  displayName: "Stripe",
  fixtureDir: path.resolve(here, "../../fixtures/stripe"),
  // Names the resources and the shape of a call, but not the things v21/v22
  // changed: the pinned apiVersion literal, that decimal_string fields are now
  // Stripe.Decimal, and that RequestOptions is a separate second argument that
  // params can no longer be mixed into. Those are what we're measuring.
  docsHint:
    "The official Stripe Node SDK — the `stripe` package. Import Stripe from \"stripe\" and " +
    "construct a client with a secret key. Resources hang off the client: stripe.customers, " +
    "stripe.paymentIntents, stripe.checkout.sessions, stripe.subscriptions, stripe.invoices, " +
    "stripe.refunds, stripe.webhooks. Each has create / retrieve / update / list, list results " +
    "are async-iterable, and stripe.webhooks.constructEvent verifies a signed payload. " +
    "Errors are classes under Stripe.errors.",
};
