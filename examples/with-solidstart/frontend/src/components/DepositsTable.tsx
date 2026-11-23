import { createResource, For, Show } from "solid-js";
import { formatEther } from "viem";
import { client } from "../lib/ponder";

type DepositRow = {
  id: string;
  timestamp: number | string;
  amount: string | number | bigint;
  account: string;
};

const DEPOSITS_SQL = `SELECT id, timestamp, amount, account FROM deposit_event ORDER BY timestamp DESC LIMIT 10`;

export default function DepositsTable() {
  const [deposits] = createResource(async () => {
    const result = await client.sql(DEPOSITS_SQL);
    return result.rows as DepositRow[];
  });

  return (
    <div>
      <Show when={deposits.loading}>
        <p class="status">Loading...</p>
      </Show>
      <Show when={deposits.error}>
        <p class="status error">Error fetching mints</p>
      </Show>
      <Show when={deposits()}>
        {(rows) => (
          <ul class="table">
            <li class="header">
              <p>Account</p>
              <p>Amount</p>
              <p class="timestamp">Timestamp</p>
            </li>
            <For each={rows()}>
              {(row) => (
                <li>
                  <a
                    href={`https://basescan.org/address/${row.account}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {row.account.slice(0, 6)}...{row.account.slice(38)}
                  </a>
                  <p class="amount">
                    {Number(formatEther(BigInt(row.amount))).toFixed(5)}
                  </p>
                  <p class="timestamp">
                    {new Date(Number(row.timestamp) * 1000).toLocaleString()}
                  </p>
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
    </div>
  );
}
