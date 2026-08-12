import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const apolloSpec: LibrarySpec = {
  id: "apollo",
  packageName: "@apollo/client",
  displayName: "Apollo Client",
  fixtureDir: path.resolve(here, "../../fixtures/apollo"),
  // Names the hooks and the client, but never says which entrypoint they come
  // from — v4 moved every React hook out of the package root and into
  // "@apollo/client/react", and where the model reaches for them is exactly
  // what we are measuring.
  docsHint:
    "Apollo Client for GraphQL — the `@apollo/client` package. " +
    "Create a client with ApolloClient + InMemoryCache + HttpLink, write operations with gql, " +
    "and read/write data in React with the useQuery, useMutation, useLazyQuery and useSuspenseQuery hooks.",
};
