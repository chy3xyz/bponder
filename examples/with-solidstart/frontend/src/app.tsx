import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { WagmiProvider } from "@wagmi/solid";
import { Suspense } from "solid-js";
import { config } from "./lib/wagmi";
import "./app.css";

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Router
          root={(props) => (
            <MetaProvider>
              <Title>Ponder + SolidStart + Wagmi</Title>
              <Suspense>{props.children}</Suspense>
            </MetaProvider>
          )}
        >
          <FileRoutes />
        </Router>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
