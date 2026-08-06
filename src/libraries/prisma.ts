import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const prismaSpec: LibrarySpec = {
  id: "prisma",
  packageName: "@prisma/client",
  displayName: "Prisma",
  fixtureDir: path.resolve(here, "../../fixtures/prisma"),
  docsHint:
    "Prisma ORM v7 TypeScript client. Schema models: User (id, email @unique, name?, posts, profile?, createdAt), " +
    "Profile (id, bio?, user, userId @unique), Post (id, title, content?, published, author, authorId). " +
    "Query API: prisma.<model>.{create,createMany,findMany,findUnique,findFirst,update,updateMany,upsert,delete,count,aggregate,groupBy}. " +
    "Supports nested relation writes (create/connect/connectOrCreate), select/include, where/orderBy, cursor pagination, and prisma.$transaction.",
  // Prisma 7.9's `prisma init` installs an agent skill tree. The scored package
  // is 7.8.0, which predates it — so the bare arm is what a project without those
  // skills gets, and the arms below are what the library itself ships to fix that.
  // Committed under fixtures/prisma/agent-context; see PROVENANCE.md there.
  agentContext: {
    source: "`prisma init` from prisma 7.9.1 (.agents/skills), scored against @prisma/client 7.8.0",
    dir: path.resolve(here, "../../fixtures/prisma/agent-context"),
    arms: [
      {
        name: "just-the-line",
        label: "only the adapter sentence from prisma7-client.md, ~170 characters",
        files: ["minimal.md"],
      },
      {
        name: "client-api",
        label: "the pack an agent routes to by name for client construction",
        files: ["prisma-client-api/SKILL.md", "prisma-client-api/references/constructor.md"],
      },
      {
        name: "full-setup",
        label: "plus the v7 setup and upgrade docs that state the adapter requirement flatly",
        files: [
          "prisma-client-api/SKILL.md",
          "prisma-client-api/references/constructor.md",
          "prisma-postgres-setup/references/prisma7-client.md",
          "prisma-upgrade-v7/references/driver-adapters.md",
          "prisma-upgrade-v7/references/removed-features.md",
        ],
      },
    ],
  },
};
