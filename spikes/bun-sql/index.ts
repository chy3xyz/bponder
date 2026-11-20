import { SQL } from "bun";

type Check = {
  name: "txn" | "error" | "bulk";
  passed: boolean;
  detail: string;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = new SQL({
  url: databaseUrl,
  max: 1,
  connectionTimeout: 5,
});
const checks: Check[] = [];

try {
  await sql.begin(async (tx) => {
    await tx`
      CREATE TEMPORARY TABLE bun_sql_spike (
        id integer PRIMARY KEY,
        value text NOT NULL
      )
    `;
    await tx`
      INSERT INTO bun_sql_spike (id, value)
      VALUES (${1}, ${"transaction"})
    `;
  });

  const transactionRows =
    await sql`SELECT value FROM bun_sql_spike WHERE id = ${1}`;
  checks.push({
    name: "txn",
    passed:
      transactionRows.length === 1 &&
      transactionRows[0]?.value === "transaction",
    detail: "BEGIN -> insert -> COMMIT persisted one row",
  });
} catch (error) {
  checks.push({
    name: "txn",
    passed: false,
    detail: error instanceof Error ? error.message : String(error),
  });
}

try {
  await sql`SELECT * FROM bun_sql_spike_table_that_does_not_exist`;
  checks.push({
    name: "error",
    passed: false,
    detail: "failing query unexpectedly succeeded",
  });
} catch (error) {
  const shape =
    error instanceof SQL.PostgresError
      ? {
          class: error.constructor.name,
          name: error.name,
          message: error.message,
          code: error.code,
          errno: error.errno,
          detail: error.detail,
          hint: error.hint,
          severity: error.severity,
        }
      : {
          class:
            error != null && typeof error === "object"
              ? error.constructor.name
              : typeof error,
          value: String(error),
        };

  checks.push({
    name: "error",
    passed: error instanceof SQL.PostgresError && error.errno === "42P01",
    detail: JSON.stringify(shape),
  });
}

try {
  const ids = sql.array([2, 3, 4]);
  const values = sql.array(["bulk-a", "bulk-b", "bulk-c"]);

  await sql`
    INSERT INTO bun_sql_spike (id, value)
    SELECT *
    FROM UNNEST(${ids}::integer[], ${values}::text[])
  `;

  const bulkRows =
    await sql`SELECT count(*)::integer AS count FROM bun_sql_spike`;
  checks.push({
    name: "bulk",
    passed: bulkRows[0]?.count === 4,
    detail:
      "UNNEST multi-insert fallback inserted three rows; Bun.SQL has no COPY streaming API",
  });
} catch (error) {
  checks.push({
    name: "bulk",
    passed: false,
    detail: error instanceof Error ? error.message : String(error),
  });
} finally {
  await sql.close();
}

for (const check of checks) {
  console.log(
    `[${check.passed ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`,
  );
}

if (checks.length !== 3 || checks.some((check) => !check.passed)) {
  process.exitCode = 1;
}
