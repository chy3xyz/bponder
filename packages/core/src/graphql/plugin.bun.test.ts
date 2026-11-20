import { expect, test } from "bun:test";
import { startBunServer } from "../server/bunServe.js";
import { createBunV1ApiFetch } from "../server/bunV1Api.js";
import { createBunGraphQLFetch, graphqlPlugin } from "./plugin.js";

const postGraphql = (port: number, query: string) =>
  fetch(`http://127.0.0.1:${port}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });

test("POST /graphql answers health and __typename when the plugin is mounted", async () => {
  const server = startBunServer({
    port: 0,
    fetch: createBunGraphQLFetch(),
  });

  try {
    const response = await postGraphql(server.port, "{ health __typename }");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { health: "ok", __typename: "Query" },
    });
  } finally {
    await server.stop();
  }
});

test("graphqlPlugin uses the injected execute function", async () => {
  const server = startBunServer({
    port: 0,
    fetch: graphqlPlugin({
      execute: ({ query }) => ({
        data: { health: query.includes("health") ? "custom" : "no" },
      }),
    }),
  });

  try {
    const response = await postGraphql(server.port, "{ health }");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { health: "custom" } });
  } finally {
    await server.stop();
  }
});

test("default startBunServer does not serve GraphQL", async () => {
  const server = startBunServer({ port: 0 });

  try {
    const response = await postGraphql(server.port, "{ health }");
    expect(response.status).toBe(404);
  } finally {
    await server.stop();
  }
});

test("createBunV1ApiFetch does not serve GraphQL unless a GraphQL fetch is mounted", async () => {
  const server = startBunServer({
    port: 0,
    fetch: createBunV1ApiFetch(),
  });

  try {
    const response = await postGraphql(server.port, "{ health }");
    expect(response.status).toBe(404);
  } finally {
    await server.stop();
  }
});
