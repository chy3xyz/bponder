import ConnectWallet from "../components/ConnectWallet";
import DepositsTable from "../components/DepositsTable";

export default function Home() {
  return (
    <main>
      <div class="panel">
        <h1>10 latest WETH mints</h1>
        <ConnectWallet />
        <DepositsTable />
      </div>
    </main>
  );
}
