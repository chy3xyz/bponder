/** Dedent template-literal output so create-bponder needs no prettier dependency. */
export function formatGenerated(code: string): string {
  const lines = code.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const min = indents.length === 0 ? 0 : Math.min(...indents);
  return `${lines.map((line) => line.slice(min)).join("\n").trim()}\n`;
}
