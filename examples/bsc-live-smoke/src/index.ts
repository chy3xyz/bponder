import { ponder } from "bponder:registry";
import { transfer } from "bponder:schema";

ponder.on("WBNB:Transfer", async ({ event, context }) => {
  await context.db.insert(transfer).values({
    id: event.id,
    from: event.args.from,
    to: event.args.to,
    value: event.args.value,
  });
});
