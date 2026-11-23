import { onchainTable } from "bponder";

export const example = onchainTable("example", (t) => ({
  id: t.text().primaryKey(),
  name: t.text(),
}));
