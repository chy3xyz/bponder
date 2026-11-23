import { onchainTable } from "bponder";

export const llama = onchainTable("llama", (t) => ({
  id: t.text().primaryKey(),
}));
