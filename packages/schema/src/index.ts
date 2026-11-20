export type ColumnType = "text" | "integer" | "boolean";

export type Column<TType extends ColumnType = ColumnType> = {
  type: TType;
};

export type OnchainTable<
  TName extends string = string,
  TColumns extends Record<string, Column> = Record<string, Column>,
> = {
  name: TName;
  columns: TColumns;
};

export const text = (): Column<"text"> => ({ type: "text" });
export const integer = (): Column<"integer"> => ({ type: "integer" });
export const boolean = (): Column<"boolean"> => ({ type: "boolean" });

export const onchainTable = <
  const name extends string,
  const columns extends Record<string, Column>,
>(
  name: name,
  columns: columns,
): OnchainTable<name, columns> => ({ name, columns });

export { compileToCreateTableSql } from "./compile.js";
