import { compileToCreateTableSql, type OnchainTable } from "@ponder/schema";
import type { BunSqlDatabase } from "./bunSql.js";

export const migrateUser = (database: BunSqlDatabase, table: OnchainTable) =>
  database.admin.unsafe(compileToCreateTableSql(table));
