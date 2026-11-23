import { createConfig } from "ponder";
import { parseAbiItem } from "viem";

const rpc = process.env.PONDER_RPC_URL_56;
if (rpc === undefined || rpc.length === 0) {
  throw new Error("PONDER_RPC_URL_56 is required");
}

const startBlock = Number(process.env.BSC_START_BLOCK);
if (Number.isFinite(startBlock) === false) {
  throw new Error("BSC_START_BLOCK is required (numeric tip-relative block)");
}

export default createConfig({
  database: {
    connectionString: process.env.DATABASE_URL!,
  },
  chains: {
    bsc: {
      id: 56,
      rpc,
    },
  },
  contracts: {
    WBNB: {
      chain: "bsc",
      abi: [
        parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 value)",
        ),
      ],
      address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      startBlock,
    },
  },
});
