import { compileToCreateTableSql, type OnchainTable } from "bponder-schema";
import type { BunSqlDatabase } from "./bunSql.js";

export const migrateUser = (database: BunSqlDatabase, table: OnchainTable) =>
  database.admin.unsafe(compileToCreateTableSql(table));
