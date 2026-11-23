import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
} from "@wagmi/solid";
import { For, Match, Switch } from "solid-js";

export default function ConnectWallet() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();

  return (
    <div class="wallet">
      <Switch>
        <Match when={connection().status === "connected"}>
          <p class="wallet-status">
            Connected{" "}
            <a
              href={`https://basescan.org/address/${connection().address}`}
              rel="noreferrer"
              target="_blank"
            >
              {connection().address?.slice(0, 6)}...
              {connection().address?.slice(38)}
            </a>
            {connection().chainId != null
              ? ` · chain ${connection().chainId}`
              : ""}
          </p>
          <button
            class="wallet-button"
            type="button"
            onClick={() => disconnect.mutate()}
          >
            Disconnect
          </button>
        </Match>
        <Match when={connection().status === "reconnecting"}>
          <p class="wallet-status">Reconnecting…</p>
        </Match>
        <Match when={connection().status === "connecting"}>
          <p class="wallet-status">Connecting…</p>
        </Match>
        <Match when={true}>
          <div class="wallet-actions">
            <For each={connectors()}>
              {(connector) => (
                <button
                  class="wallet-button"
                  type="button"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate({ connector })}
                >
                  Connect {connector.name}
                </button>
              )}
            </For>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
