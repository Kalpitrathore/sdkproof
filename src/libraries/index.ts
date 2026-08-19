/**
 * The one registry of scorable libraries.
 *
 * Both the CLI and the fixture test read from here. They used to keep separate
 * hardcoded lists, so registering a library in cli.ts did NOT enrol it in the
 * test that proves its `known-good.ts` compiles — and that test is the only
 * thing standing between "the model got it wrong" and "my fixture is broken".
 * Found 2026-08-19: react-table was scored 0/100 while its fixture had never
 * been validated through verify(). A single source makes that impossible.
 */
import { apolloSpec } from "./apollo.ts";
import { zustandSpec } from "./zustand.ts";
import { prismaSpec } from "./prisma.ts";
import { aisdkSpec } from "./aisdk.ts";
import { zodSpec } from "./zod.ts";
import { tanstackQuerySpec } from "./tanstack-query.ts";
import { nextjsSpec } from "./nextjs.ts";
import { reactRouterSpec } from "./react-router.ts";
import { reactTableSpec } from "./react-table.ts";
import { stripeSpec } from "./stripe.ts";
import type { LibrarySpec } from "../types.ts";

export const ALL_SPECS: Record<string, LibrarySpec> = {
  apollo: apolloSpec,
  zustand: zustandSpec,
  prisma: prismaSpec,
  aisdk: aisdkSpec,
  zod: zodSpec,
  "tanstack-query": tanstackQuerySpec,
  nextjs: nextjsSpec,
  "react-router": reactRouterSpec,
  "react-table": reactTableSpec,
  stripe: stripeSpec,
};
