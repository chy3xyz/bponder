import { http, createConfig } from "@wagmi/solid";
import { base } from "@wagmi/solid/chains";
import { injected } from "@wagmi/solid/connectors";

export const config = createConfig({
  chains: [base],
  connectors: [injected()],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});

declare module "@wagmi/solid" {
  interface Register {
    config: typeof config;
  }
}
