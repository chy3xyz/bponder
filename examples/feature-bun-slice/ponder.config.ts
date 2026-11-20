import { defineConfig } from "ponder";

export default defineConfig({
  chains: {},
  database: { connectionString: process.env.DATABASE_URL },
  indexing: "historical",
});
