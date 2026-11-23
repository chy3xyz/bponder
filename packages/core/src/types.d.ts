declare module "bponder:registry" {
  import type { Virtual } from "bponder";

  type config = typeof import("bponder:internal").config;
  type schema = typeof import("bponder:internal").schema;

  export const ponder: Virtual.Registry<config["default"], schema>;

  export type EventNames = Virtual.EventNames<config["default"]>;
  export type Event<name extends EventNames = EventNames> = Virtual.Event<
    config["default"],
    name
  >;
  export type Context<name extends EventNames = EventNames> = Virtual.Context<
    config["default"],
    schema,
    name
  >;
  export type IndexingFunctionArgs<name extends EventNames = EventNames> =
    Virtual.IndexingFunctionArgs<config["default"], schema, name>;
}

declare module "bponder:schema" {
  const schema: typeof import("bponder:internal").schema;

  export { schema as default };
}

declare module "bponder:api" {
  import type { ReadonlyDrizzle } from "bponder";
  import type { PublicClient } from "viem";

  type schema = typeof import("bponder:internal").schema;
  type config = typeof import("bponder:internal").config;

  export const db: ReadonlyDrizzle<schema>;
  export const publicClients: {
    [chainName in keyof config["default"]["chains"]]: PublicClient;
  };
}
