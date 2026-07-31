// Hand-authored, known-correct Next.js 16 App Router usage — proves the fixture
// can express a PASSING answer. See test/fixtures.test.ts.
//
// Exercises the drift-prone surface: async cookies()/headers()/draftMode() and
// the 2-arg revalidateTag(tag, profile).
import { cookies, headers, draftMode } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

export async function readRequestState() {
  // Next 15+/16: these are async and must be awaited.
  const cookieStore = await cookies();
  const headerList = await headers();
  const draft = await draftMode();

  return {
    session: cookieStore.get("session")?.value ?? null,
    ua: headerList.get("user-agent"),
    isDraft: draft.isEnabled,
  };
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) notFound();
  return NextResponse.json({ id });
}

export async function save(formData: FormData) {
  const name = formData.get("name");
  if (typeof name !== "string") redirect("/error");

  revalidatePath("/things");
  // Next 16: revalidateTag takes a cache profile as its second argument.
  revalidateTag("things", "max");
}
