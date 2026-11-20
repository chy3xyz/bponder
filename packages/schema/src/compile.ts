import type { ColumnType, OnchainTable } from "./index.js";

const postgresTypeByColumnType: Record<ColumnType, string> = {
  text: "text",
  integer: "integer",
  boolean: "boolean",
};

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

export const compileToCreateTableSql = (table: OnchainTable) => {
  const columns = Object.entries(table.columns)
    .map(
      ([name, column]) =>
        `${quoteIdentifier(name)} ${postgresTypeByColumnType[column.type]}`,
    )
    .join(", ");

  return `CREATE TABLE ${quoteIdentifier(table.name)} (${columns})`;
};
