import { onchainTable } from "bponder";

export const counter = onchainTable("counter", (t) => ({
  value: t.integer().primaryKey(),
  block: t.integer().notNull(),
}));
