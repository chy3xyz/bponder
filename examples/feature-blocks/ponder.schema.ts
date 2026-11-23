import { onchainTable } from "bponder";

export const chainlinkPrice = onchainTable("chainlink_price", (t) => ({
  timestamp: t.bigint().primaryKey(),
  price: t.doublePrecision().notNull(),
}));
