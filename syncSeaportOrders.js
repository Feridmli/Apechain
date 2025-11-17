/**
 * syncSeaportOrders.js — ApeChain On-Chain Seaport Sync
 * Backend-ə OrderFulfilled və OrderCancelled eventlərini göndərir
 */

import { ethers } from "ethers";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL;
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;
const SEAPORT_CONTRACT_ADDRESS = process.env.SEAPORT_CONTRACT_ADDRESS;
const APECHAIN_RPC = process.env.APECHAIN_RPC || "https://rpc.apechain.com";

if (!BACKEND_URL || !NFT_CONTRACT_ADDRESS || !SEAPORT_CONTRACT_ADDRESS) {
  console.error("❌ Missing environment variables (BACKEND_URL, NFT_CONTRACT_ADDRESS, SEAPORT_CONTRACT_ADDRESS)");
  process.exit(1);
}

// ethers v5 üçün provider
const provider = new ethers.providers.JsonRpcProvider(APECHAIN_RPC);

// Minimal Seaport event ABI
const seaportABI = [
  "event OrderFulfilled(bytes32 indexed orderHash,address indexed offerer,address indexed fulfiller,address recipient,address paymentToken,uint256 price,uint256[] tokenIds)",
  "event OrderCancelled(bytes32 indexed orderHash,address indexed offerer)"
];

const seaportContract = new ethers.Contract(SEAPORT_CONTRACT_ADDRESS, seaportABI, provider);

async function postOrderEvent(payload) {
  try {
    const res = await fetch(`${BACKEND_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.log("❌ Backend rejected:", res.status, await res.text());
      return false;
    }
    const data = await res.json().catch(() => null);
    return data && data.success === true;
  } catch (e) {
    console.log("❌ Backend error:", e.message);
    return false;
  }
}

async function main() {
  console.log("🚀 On-chain Seaport Sync başladı...");

  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 0;
  const toBlock = await provider.getBlockNumber();

  console.log(`🔎 Scanning blocks ${fromBlock} → ${toBlock}`);

  // OrderFulfilled
  const fulfilledFilter = seaportContract.filters.OrderFulfilled();
  const fulfilledEvents = await seaportContract.queryFilter(fulfilledFilter, fromBlock, toBlock);

  for (const ev of fulfilledEvents) {
    const { orderHash, offerer, fulfiller, recipient, paymentToken, price, tokenIds } = ev.args;

    const payload = {
      tokenId: tokenIds.map(t => t.toString()).join(","),
      price: ethers.utils.formatEther(price),
      sellerAddress: offerer.toLowerCase(),
      buyerAddress: fulfiller.toLowerCase(),
      seaportOrder: { orderHash },
      orderHash: orderHash,
      image: null,
      nftContract: NFT_CONTRACT_ADDRESS,
      marketplaceContract: SEAPORT_CONTRACT_ADDRESS,
      status: "fulfilled"
    };

    const sent = await postOrderEvent(payload);
    console.log(sent ? `✅ Fulfilled sent: ${orderHash}` : `❌ Fulfilled failed: ${orderHash}`);
  }

  // OrderCancelled
  const cancelledFilter = seaportContract.filters.OrderCancelled();
  const cancelledEvents = await seaportContract.queryFilter(cancelledFilter, fromBlock, toBlock);

  for (const ev of cancelledEvents) {
    const { orderHash, offerer } = ev.args;

    const payload = {
      tokenId: null,
      price: null,
      sellerAddress: offerer.toLowerCase(),
      seaportOrder: { orderHash },
      orderHash: orderHash,
      nftContract: NFT_CONTRACT_ADDRESS,
      marketplaceContract: SEAPORT_CONTRACT_ADDRESS,
      status: "cancelled"
    };

    const sent = await postOrderEvent(payload);
    console.log(sent ? `✅ Cancelled sent: ${orderHash}` : `❌ Cancelled failed: ${orderHash}`);
  }

  console.log("🎉 On-chain Seaport Sync tamamlandı!");
}

main().catch(err => {
  console.error("💀 Fatal error:", err);
  process.exit(1);
});
