import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const angularSpec: LibrarySpec = {
  id: "angular",
  packageName: "@angular/core",
  displayName: "Angular",
  fixtureDir: path.resolve(here, "../../fixtures/angular"),
  // Describes the GOAL — create a component at runtime and put it in a view —
  // without naming the API that does it. v22 deleted ComponentFactoryResolver
  // and ComponentFactory (PR #68055, merged 2026-04-07); the supported route is
  // passing the component class straight to ViewContainerRef.createComponent or
  // the standalone createComponent(). Which of the two the model reaches for is
  // exactly what we are measuring, so neither name appears here.
  docsHint:
    "Angular — the `@angular/core` package. " +
    "Build components with the @Component decorator, inject dependencies with inject() or constructor DI, " +
    "and create components dynamically at runtime so they can be inserted into a host view.",
};
