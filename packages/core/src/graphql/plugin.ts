import {
  buildSchema,
  type ExecutionResult,
  type GraphQLSchema,
  graphql,
} from "graphql";
import type { BunFetchHandler } from "../server/bunServe.js";

// TODO: Plug the real Ponder GraphQL schema from `buildGraphQLSchema`
// once the Bun runtime owns a schema/db context. This default schema is
// only enough for opt-in mount tests (`health` / `__typename`).
const defaultSchema = buildSchema(`
  type Query {
    health: String!
  }
`);

const defaultRootValue = {
  health: () => "ok",
};

export type GraphQLExecuteInput = {
  query: string;
  variables?: Record<string, unknown> | null;
};

export type CreateBunGraphQLFetchOptions = {
  schema?: GraphQLSchema;
  execute?: (
    input: GraphQLExecuteInput,
  ) => Promise<ExecutionResult> | ExecutionResult;
  path?: string;
};

const jsonError = (message: string, status: number) =>
  Response.json({ errors: [{ message }] }, { status });

export const createBunGraphQLFetch = (
  options: CreateBunGraphQLFetchOptions = {},
): BunFetchHandler => {
  const path = options.path ?? "/graphql";
  const schema = options.schema ?? defaultSchema;
  const execute =
    options.execute ??
    (({ query, variables }: GraphQLExecuteInput) =>
      graphql({
        schema,
        source: query,
        variableValues: variables ?? undefined,
        rootValue: defaultRootValue,
      }));

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== path) {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    if (body === null || typeof body !== "object") {
      return jsonError("Invalid JSON body", 400);
    }

    const query =
      "query" in body && typeof body.query === "string"
        ? body.query
        : undefined;
    if (query === undefined || query.trim() === "") {
      return jsonError("Missing query", 400);
    }

    const variables =
      "variables" in body &&
      body.variables !== null &&
      typeof body.variables === "object" &&
      !Array.isArray(body.variables)
        ? (body.variables as Record<string, unknown>)
        : undefined;

    return Response.json(await execute({ query, variables }));
  };
};

export const graphqlPlugin = createBunGraphQLFetch;
