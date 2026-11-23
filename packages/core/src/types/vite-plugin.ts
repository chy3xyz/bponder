/**
 * Minimal Vite plugin shape used by the optional Vite build path.
 * Avoids a hard type dependency on the `vite` package (optional peer).
 */
export type VitePlugin = {
  name: string;
  resolveId?: (
    id: string,
    importer?: string,
  ) => string | null | undefined | Promise<string | null | undefined>;
  load?: (
    id: string,
  ) => string | null | undefined | Promise<string | null | undefined>;
  [key: string]: unknown;
};
