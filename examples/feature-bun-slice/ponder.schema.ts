import { integer, onchainTable, text } from "@ponder/schema";

export const transfer = onchainTable("transfer", {
  id: text(),
  sender: text(),
  recipient: text(),
  amount: integer(),
  blockNumber: integer(),
});
