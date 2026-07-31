// Hand-authored, known-correct React Router 8 usage — proves the fixture can
// express a PASSING answer. See test/fixtures.test.ts.
//
// Exercises the v8 drift surface:
//   - everything imports from "react-router" (react-router-dom was deleted in v8)
//   - json() / defer() are gone — return plain data, or data() for a status/headers
//   - middleware is always on: `context` is a RouterContextProvider, not a plain
//     object, and you read it with context.get(someContext)
//   - meta gets `loaderData`, not the removed `data` param
//   - loader args carry a normalized `url: URL`
import {
  data,
  redirect,
  createContext,
  useLoaderData,
  useActionData,
  useNavigation,
  useSubmit,
  useFetcher,
  useParams,
  useSearchParams,
  createBrowserRouter,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type MiddlewareFunction,
  type MetaArgs,
} from "react-router";

interface User {
  id: string;
  name: string;
}

// v8: createContext is stable (was unstable_createContext).
const userContext = createContext<User | null>(null);

// v8: middleware is always enabled; no future flag needed.
export const authMiddleware: MiddlewareFunction = async (
  { request, context },
  next,
) => {
  if (!request.headers.get("cookie")) throw redirect("/login");
  context.set(userContext, { id: "1", name: "Ada" });
  return next();
};

export async function loader({ params, url, context }: LoaderFunctionArgs) {
  // v8: `context` is a RouterContextProvider — read it with .get(), not as a
  // plain object property.
  const user = context.get(userContext);
  // v8: `url` is the normalized URL, provided directly on the args.
  const q = url.searchParams.get("q");

  if (!params.id) throw new Response("Not Found", { status: 404 });

  // v8: no json() — return the object directly.
  return { user, q, id: params.id };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const name = form.get("name");
  if (typeof name !== "string") {
    // data() is how you attach a status or headers to a plain value.
    return data({ error: "name required" }, { status: 400 });
  }
  return redirect(`/users/${name}`);
}

// v8: MetaArgs exposes `loaderData` — the old `data` param was removed.
export function meta({ loaderData }: MetaArgs<typeof loader>) {
  return [{ title: loaderData?.user?.name ?? "User" }];
}

export function useRouteState() {
  const loaded = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const fetcher = useFetcher<typeof loader>();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  return {
    loaded,
    actionData,
    busy: navigation.state !== "idle",
    submit,
    fetcherData: fetcher.data,
    params,
    q: searchParams.get("q"),
    setSearchParams,
  };
}

export const router = createBrowserRouter([
  { path: "/users/:id", loader, action, middleware: [authMiddleware] },
]);
