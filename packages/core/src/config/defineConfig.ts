export type PonderConfig = {
  chains: Record<string, unknown>;
  database?: unknown;
  indexing?: string;
  ordering?: "omnichain" | "multichain" | "experimental_isolated";
  server?: unknown;
};

export const defineConfig = <const config extends PonderConfig>(
  config: config,
): config => config;
