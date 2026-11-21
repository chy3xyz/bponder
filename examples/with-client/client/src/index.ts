import { createClient } from "@ponder/client";

const client = createClient({ url: "http://localhost:42069" });

const { rows } = await client.sql(
  `SELECT balance FROM account ORDER BY balance DESC LIMIT 1`,
);

console.log(rows[0]);

console.log("Subscribing to live updates...");

const { unsubscribe } = client.live(
  async () => {
    const result = await client.sql(
      `SELECT balance FROM account ORDER BY balance DESC LIMIT 1`,
    );
    console.log(result.rows[0]);
  },
  (error) => {
    console.error(error);
  },
);

setTimeout(() => {
  unsubscribe();
}, 10_000);
