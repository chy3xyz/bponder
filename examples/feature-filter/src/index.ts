import { ponder } from "bponder:registry";
import schema from "bponder:schema";

ponder.on("PrimitiveManager:Swap", async ({ event, context }) => {
  await context.db.insert(schema.swapEvent).values({
    id: event.id,
    payer: event.args.payer,
    recipient: event.args.recipient,
  });
});
