import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const txHash = process.argv[2] as `0x${string}`;

if (!txHash) {
  console.error("Usage: tsx checkTx.ts <txHash>");
  process.exit(1);
}

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

async function checkTransaction() {
  console.log(`🔍 Checking transaction: ${txHash}\n`);

  try {
    // Get transaction
    const tx = await publicClient.getTransaction({ hash: txHash });
    console.log("📋 Transaction found:");
    console.log(`   From: ${tx.from}`);
    console.log(`   To: ${tx.to}`);
    console.log(`   Block: ${tx.blockNumber || "pending"}`);
    console.log(`   Gas: ${tx.gas.toString()}`);

    // Try to get receipt
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      console.log(`\n✅ Transaction confirmed!`);
      console.log(`   Status: ${receipt.status}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
    } catch {
      console.log(`\n⏳ Transaction is pending...`);
      console.log(`   View on Basescan: https://sepolia.basescan.org/tx/${txHash}`);
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
  }
}

checkTransaction();
