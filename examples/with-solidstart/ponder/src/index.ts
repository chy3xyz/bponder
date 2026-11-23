import { ponder } from "bponder:registry";
import schema from "bponder:schema";

ponder.on("weth9:Deposit", async ({ event, context }) => {
  await context.db.insert(schema.depositEvent).values({
    id: event.id,
    account: event.args.dst,
    amount: event.args.wad,
    timestamp: Number(event.block.timestamp),
  });
});
