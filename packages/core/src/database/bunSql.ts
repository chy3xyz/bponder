type BunSqlClient = {
  (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Record<string, unknown>[]>;
  unsafe(query: string): Promise<unknown>;
  close(): Promise<void>;
};

type BunSqlConstructor = new (options: {
  url: string;
  connectionTimeout: number;
}) => BunSqlClient;

type BunRuntime = {
  SQL: BunSqlConstructor;
};

export type CreateBunSqlDatabaseParameters = {
  url: string;
};

export const getBunSqlState = (error: unknown) =>
  error !== null &&
  typeof error === "object" &&
  "errno" in error &&
  typeof error.errno === "string"
    ? error.errno
    : undefined;

export const createBunSqlDatabase = ({
  url,
}: CreateBunSqlDatabaseParameters) => {
  const { SQL } = (globalThis as typeof globalThis & { Bun: BunRuntime }).Bun;
  const admin = new SQL({
    url,
    connectionTimeout: 5,
  });
  const user = new SQL({
    url,
    connectionTimeout: 5,
  });
  let isClosed = false;

  const migrate = async () => {
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
    migrate,
    close,
    end: close,
  };
};

export type BunSqlDatabase = ReturnType<typeof createBunSqlDatabase>;
