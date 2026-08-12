// Hand-authored, known-correct Apollo Client 4 usage — proves the fixture can
// express a PASSING answer. See test/fixtures.test.ts.
//
// Exercises the drift-prone surface: in v4 the React hooks were removed from
// the package root and live under "@apollo/client/react". Everything a model
// writes from v3 memory (`import { useQuery } from "@apollo/client"`) is a
// hard TS2305 against the real installed package.
import { ApolloClient, InMemoryCache, HttpLink, gql } from "@apollo/client";
import { useQuery, useMutation } from "@apollo/client/react";

export const client = new ApolloClient({
  link: new HttpLink({ uri: "https://example.com/graphql" }),
  cache: new InMemoryCache(),
});

const GET_USERS = gql`
  query GetUsers {
    users {
      id
      name
    }
  }
`;

const ADD_USER = gql`
  mutation AddUser($name: String!) {
    addUser(name: $name) {
      id
    }
  }
`;

export function useUsers() {
  return useQuery(GET_USERS);
}

export function useAddUser() {
  return useMutation(ADD_USER);
}
