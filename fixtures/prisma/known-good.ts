// Hand-authored, known-correct Prisma 7 usage. This file exists to prove the
// fixture can express a PASSING answer. If it stops compiling, the fixture is
// broken and every failure the scorecard reports is suspect — see
// test/fixtures.test.ts.
//
// It deliberately exercises the drift-prone surface: v7 client construction via
// a driver adapter (the option models most often omit), plus the query API.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

// v7: `adapter` is required; `datasourceUrl` was removed.
export const prisma = new PrismaClient({ adapter, log: ["warn", "error"] });

export async function run() {
  const created = await prisma.user.create({
    data: {
      email: "a@example.com",
      name: "A",
      profile: { create: { bio: "hi" } },
      posts: { create: [{ title: "first" }] },
    },
  });

  const users = await prisma.user.findMany({
    where: { email: { contains: "@example.com" } },
    include: { posts: true, profile: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const published = await prisma.post.count({ where: { published: true } });

  const [updated, upserted] = await prisma.$transaction([
    prisma.user.update({ where: { id: created.id }, data: { name: "B" } }),
    prisma.user.upsert({
      where: { email: "b@example.com" },
      create: { email: "b@example.com" },
      update: { name: "C" },
    }),
  ]);

  await prisma.$disconnect();
  return { users, published, updated, upserted };
}
