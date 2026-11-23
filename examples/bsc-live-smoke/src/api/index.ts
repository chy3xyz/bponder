import { db } from "bponder:api";
import { transfer } from "bponder:schema";
import { Hono } from "hono";

const app = new Hono();

app.get("/hello", (c) => c.text("bsc-ok"));

app.get("/transfers", async (c) => {
  const rows = await db.select().from(transfer).limit(5);
  return c.json(
    rows.map((row) => ({
      ...row,
      value: row.value.toString(),
    })),
  );
});

export default app;
