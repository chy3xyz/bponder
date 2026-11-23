import { defineConfig } from "vite";
import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [solidStart(), nitro()],
  resolve: {
    // Keep a single viem copy so @wagmi/core does not resolve an old nested
    // install that lacks `viem/tempo` (breaks Vite's `solid` resolve conditions).
    dedupe: ["viem"],
  },
  optimizeDeps: {
    include: ["viem", "@wagmi/core", "@wagmi/solid"],
  },
});
