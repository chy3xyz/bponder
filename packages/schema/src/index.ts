export const onchainTable = <
  const name extends string,
  const columns extends Record<string, unknown>,
>(
  name: name,
  columns: columns,
) => ({ name, columns });
