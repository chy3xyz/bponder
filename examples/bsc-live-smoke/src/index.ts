import { ponder } from "ponder:registry";
import { transfer } from "ponder:schema";

ponder.on("WBNB:Transfer", async ({ event, context }) => {
  await context.db.insert(transfer).values({
    id: event.id,
    from: event.args.from,
    to: event.args.to,
    value: event.args.value,
  });
});
