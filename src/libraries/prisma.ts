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
};
