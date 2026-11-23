import { onchainTable } from "bponder";

export const transfer = onchainTable("transfer", (t) => ({
  id: t.text().primaryKey(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
}));
