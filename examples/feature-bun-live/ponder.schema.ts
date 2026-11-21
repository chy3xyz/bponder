import {
  integer,
  onchainTable,
  text,
} from "../../packages/schema/src/index.ts";

export const transfer = onchainTable("transfer", {
  id: text(),
  sender: text(),
  recipient: text(),
  amount: integer(),
  blockNumber: integer(),
});
