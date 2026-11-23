import { defineConfig } from "bponder";

export default defineConfig({
  chains: {},
  database: { connectionString: process.env.DATABASE_URL },
  indexing: "historical",
});
