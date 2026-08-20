# SDKProof verified target list — 19 Aug 2026

**Every row below was checked by the compiler, not by a diff.** A symbol counts only if `import { S } from "pkg"` **compiles against the previous major and fails against the current one** — so it was genuinely public and is genuinely gone.

**Pipeline:** 3,366 harvested → 744 with a major inside 14 months → 166 with undeprecated removals → **41 post-cutoff candidates compiled → 29 confirmed, 9 false positives, 3 unverifiable.**

⚠️ **Confirmed counts are floors, not totals.** The radar stores only the first 12 symbols per package, so any row showing 12 means *all twelve tested were confirmed* and the real number may be far higher (highcharts reported 839).

⭐ **The compiler stage earned its place immediately:** `react-router` reported **109** removals and has **1**. `@browserbasehq/stagehand` reported **263** and has **none**. `kubo-rpc-client` reported **145** and has **none**.



## ⚠️ Rung 2b — exclude auto-generated clients (added 19 Aug)

**A confirmed removal from a generated SDK is real and worthless.** Kubernetes, Azure ARM, Aptos, Turnkey and Fireblocks regenerate their clients from API specs, so symbols churn every release. The compiler confirms they were public and are gone; **nobody writes `CertificatesV1alpha1ApiReplaceNamespacedPodCertificateRequestRequest` by hand, and no model reaches for it.**

**`@kubernetes/client-node` v2 and `highcharts` v13 were both pre-tested and are DUDS** — canonical usage compiles clean against the new major in both cases.

⭐⭐ **RANKING BY COUNT IS BACKWARDS.** Every real finding here is 1–4 hand-named symbols (`useReactTable`, `AppLoadContext`, `StreamTextOnFinishCallback`). Every 100+ row has been generated churn or a false positive. **Read this list bottom-up.** The filter is not size, it is: *would a human type this name from memory?* Highcharts generates by path-concatenation (`NavigationBindingsCircleAnnotationAnnotationsLabels...`), Kubernetes by REST verb (`...RequestRequest`) — different tells, same worthlessness.

**The test is free: read the symbol names.** Generated surfaces look generated — `V1alpha1`, `...RequestRequest`, version-prefixed nouns. **Discount these rows: `@azure/arm-appservice` (1029), `@aptos-labs/ts-sdk` (399), `@kubernetes/client-node` (50), `@turnkey/sdk-types`, `@fireblocks/ts-sdk`, `@types/facebook-nodejs-business-sdk`.**

⭐ **What survives is hand-written APIs with hand-written names:** `@expressots/core` (`AppFactory` — a primary entry point), `@casl/react` (`createContextualCan`), `highcharts`, `@lifi/sdk`, `@github/copilot-sdk`, `@sanity/client`, `typeorm`.

---

## Tier 1 — commercial vendors, fresh, real API

**The SDK is a product surface here, so agent-compatibility has a commercial owner.** Every send so far went to an engineer, who your plan says is explicitly not a budget holder.

| package | vendor | majors | shipped | age | confirmed | symbols |
|---|---|---|---|---|---|---|
| `@kubernetes/client-node` | CNCF / Kubernetes | 1→2 | 2026-08-12 | 0.2mo | **12**+ | `AbortError`, `FetchError`, `CertificatesV1alpha1ApiCreateNamespacedPodCertificateRequestRequest` |
| `@a2a-js/sdk` | A2A protocol (Google-originated) | 0→1 | 2026-07-22 | 0.9mo | **12**+ | `A2AError`, `A2ARequest`, `AgentCapabilities1` |
| `highcharts` | Highcharts — paid licence | 12→13 | 2026-06-11 | 2.3mo | **12**+ | `DataSortingOptionsObject`, `LegendEventsOptions`, `NavigationBindingsCircleAnnotationAnnotationsAnimationOptions` |
| `@lifi/sdk` | LI.FI — cross-chain bridge | 3→4 | 2026-06-03 | 2.5mo | **12**+ | `config`, `PatcherMagicNumber`, `checkPermitSupport` |
| `@aptos-labs/ts-sdk` | Aptos Labs | 6→7 | 2026-05-13 | 3.2mo | **12**+ | `AbstractKeylessAccount`, `AccountUtils`, `EPK_HORIZON_SECS` |
| `@azure/arm-appservice` | Microsoft Azure | 18→19 | 2026-06-09 | 2.3mo | **10** | `getContinuationToken`, `AppServiceEnvironmentCollection`, `StampCapacityCollection` |
| `@expressots/core` | ExpressoTS | 3→4 | 2026-07-17 | 1.1mo | **5** | `AppFactory`, `InMemoryDataProvider`, `InMemoryDataTable` |
| `@github/copilot-sdk` | GitHub | 0→1 | 2026-06-02 | 2.6mo | **4** | `SYSTEM_PROMPT_SECTIONS`, `ConnectionState`, `InputOptions` |
| `@turnkey/sdk-types` | Turnkey — wallet infra | 0→1 | 2026-05-05 | 3.5mo | **4** | `v1CreateApiOnlyUsersRequest`, `TCreateApiOnlyUsersResponse`, `TCreateApiOnlyUsersBody` |
| `@cere-ddc-sdk/file-storage` | Cere Network | 2→3 | 2026-07-30 | 0.7mo | **3** | `TESTNET`, `DEVNET`, `MAINNET` |
| `@dynamic-labs-wallet/forward-mpc-client` | Dynamic — wallet infra | 0→1 | 2026-06-25 | 1.8mo | **3** | `ClientEvents`, `ForwardMPCClient`, `ForwardMPCClientOptions` |
| `@bloomreach/spa-sdk` | Bloomreach | 27→28 | 2026-06-19 | 2mo | **3** | `Content`, `Menu10`, `isContent` |
| `@sanity/client` | Sanity — headless CMS | 7→8 | 2026-08-12 | 0.2mo | **2** | `HttpRequestEvent`, `ResponseEvent` |
| `@fireblocks/ts-sdk` | Fireblocks — digital assets | 26→27 | 2026-08-18 | 0mo | **1** | `TravelRuleValidateLegalPersonNameIdentifierLegalPersonNameIdentifierTypeEnum` |

## Tier 2 — OSS libraries, credibility not revenue

| package | majors | shipped | age | confirmed | symbols |
|---|---|---|---|---|---|
| `mobx-react-lite` | 4→5 | 2026-07-30 | 0.6mo | 6 | `useLocalStore`, `useAsObservableSource`, `isObserverBatched` |
| `typeorm` | 0→1 | 2026-05-19 | 3mo | 5 | `RepositoryUpdateOptions`, `LegacyOracleNamingStrategy`, `CustomRepositoryNotFoundError` |
| `@angular/core` | 21→22 | 2026-06-03 | 2.5mo | 4 | `InputFlags`, `QueryFlags`, `ProjectionSlots` |
| `tslog` | 4→5 | 2026-07-14 | 1.2mo | 3 | `createLoggerEnvironment`, `loggerEnvironment`, `DefaultLogLevels` |
| `@casl/react` | 6→7 | 2026-05-21 | 3mo | 2 | `BoundCanProps`, `createContextualCan` |
| `@tanstack/react-table` | 8→9 | 2026-08-04 | 0.5mo | 1 | `useReactTable` |
| `react-router` | 7→8 | 2026-06-17 | 2.1mo | 1 | `AppLoadContext` |
| `html-validate` | 10→11 | 2026-05-11 | 3.3mo | 1 | `Validator` |

## Excluded, with reasons

- `@botpress/client` — the two symbols are re-exported deps (axios, axiosRetry), not their API
- `@bungres/orm` — obscure
- `@maizzle/framework` — niche email framework
- `@tblabs/storage` — obscure
- `@types/facebook-nodejs-business-sdk` — DefinitelyTyped stub, not a library
- `@types/facebook-nodejs-business-sdk ` — x
- `kopytko-linter` — obscure
- `react-day-picker` — the one symbol is literally named V9DeprecatedProps

## Killed by the compiler (reported removals that do not exist)

- `@browserbasehq/stagehand` — diff reported **263**, confirmed **0**
- `kubo-rpc-client` — diff reported **145**, confirmed **0**
- `eventsource` — diff reported **11**, confirmed **0**
- `@angular/compiler-cli` — diff reported **11**, confirmed **0**
- `react-native-plaid-link-sdk` — diff reported **11**, confirmed **0**
- `@conventional-changelog/git-client` — diff reported **9**, confirmed **0**
- `typescript-transform-paths` — diff reported **3**, confirmed **0**
- `@quasar/app-vite` — diff reported **3**, confirmed **0**
- `@pinia-orm/nuxt` — diff reported **1**, confirmed **0**

## Unverifiable

- `mobx-react` — install or resolution failed; check by hand
- `@wabot-dev/framework` — install or resolution failed; check by hand
- `@atlaskit/media-client-react` — install or resolution failed; check by hand

---

⚠️ **Rung 3 is still mandatory.** A confirmed removal means the API is gone, not that the model reaches for it. `mobx-react` passed every static gate and came back **3/12** on the generation pre-test. **Verify → pre-test → only then build a fixture.**
