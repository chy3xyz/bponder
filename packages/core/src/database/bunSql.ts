export type BunSqlTransaction = {
  (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Record<string, unknown>[]>;
  unsafe(query: string, values?: unknown[]): Promise<unknown>;
};

type BunSqlClient = BunSqlTransaction & {
  begin<T>(callback: (sql: BunSqlTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type BunSqlConstructor = new (options: {
  url: string;
  connectionTimeout: number;
  connection?: Record<string, string | number | boolean>;
}) => BunSqlClient;

type BunRuntime = {
  SQL: BunSqlConstructor;
};

export const DEFAULT_BUN_SQL_SCHEMA = "public";
const SCHEMA_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_SCHEMA_IDENTIFIER_LENGTH = 63;

export type CreateBunSqlDatabaseParameters = {
  url: string;
  schema?: string;
};

export const getBunSqlState = (error: unknown) =>
  error !== null &&
  typeof error === "object" &&
  "errno" in error &&
  typeof error.errno === "string"
    ? error.errno
    : undefined;

export const isBunSqlSchemaIdentifier = (schema: string) =>
  schema.length > 0 &&
  schema.length <= MAX_SCHEMA_IDENTIFIER_LENGTH &&
  SCHEMA_IDENTIFIER.test(schema);

export const normalizeBunSqlSchema = (schema?: string) => {
  if (typeof schema !== "string") return DEFAULT_BUN_SQL_SCHEMA;
  const trimmed = schema.trim();
  return trimmed.length === 0 ? DEFAULT_BUN_SQL_SCHEMA : trimmed;
};

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

export const createBunSqlDatabase = ({
  url,
  schema,
}: CreateBunSqlDatabaseParameters) => {
  const resolvedSchema = normalizeBunSqlSchema(schema);
  if (isBunSqlSchemaIdentifier(resolvedSchema) === false) {
    throw new Error(`Invalid database schema identifier: ${resolvedSchema}`);
  }

  const { SQL } = (globalThis as typeof globalThis & { Bun: BunRuntime }).Bun;
  const connection =
    resolvedSchema === DEFAULT_BUN_SQL_SCHEMA
      ? undefined
      : { search_path: resolvedSchema };
  const admin = new SQL({
    url,
    connectionTimeout: 5,
    ...(connection === undefined ? {} : { connection }),
  });
  const user = new SQL({
    url,
    connectionTimeout: 5,
    ...(connection === undefined ? {} : { connection }),
  });
  let isClosed = false;

  const migrate = async () => {
    if (resolvedSchema !== DEFAULT_BUN_SQL_SCHEMA) {
      await admin.unsafe(
        `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(resolvedSchema)}`,
      );
    }

    await admin`
      CREATE TABLE IF NOT EXISTS ponder_bun_meta (
        key text PRIMARY KEY,
        value text NOT NULL
      )
    `;
  };

  const close = async () => {
    if (isClosed) return;
    isClosed = true;

    await Promise.all([admin.close(), user.close()]);
  };

  return {
    admin,
    user,
    schema: resolvedSchema,
    migrate,
    close,
    end: close,
  };
};

export type BunSqlDatabase = ReturnType<typeof createBunSqlDatabase>;
