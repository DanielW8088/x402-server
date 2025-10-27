import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

config();

const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";

if (!serverPrivateKey) {
  console.error("❌ Missing SERVER_PRIVATE_KEY");
  process.exit(1);
}

const chain = network === "base-sepolia" ? baseSepolia : base;
const account = privateKeyToAccount(serverPrivateKey);

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

async function checkPendingTransactions() {
  console.log("🔍 Checking pending transactions...");
  console.log(`Network: ${network}`);
  console.log(`Address: ${account.address}\n`);

  try {
    // Get current nonce on chain
    const currentNonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "latest",
    });

    // Get pending nonce
    const pendingNonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });

    // Get balance
    const balance = await publicClient.getBalance({
      address: account.address,
    });

    console.log("📊 Account Status:");
    console.log(`   Current Nonce: ${currentNonce}`);
    console.log(`   Pending Nonce: ${pendingNonce}`);
    console.log(`   ETH Balance: ${(Number(balance) / 1e18).toFixed(6)} ETH`);

    if (pendingNonce > currentNonce) {
      console.log(`\n⚠️  ${pendingNonce - currentNonce} transaction(s) pending!`);
      console.log("   Please wait for them to complete before submitting new transactions.");
      console.log("\n💡 Tips:");
      console.log("   - Wait 30-60 seconds and try again");
      console.log("   - Check transaction status on Basescan");
      console.log(`   - View on explorer: https://${network === "base-sepolia" ? "sepolia." : ""}basescan.org/address/${account.address}`);
    } else {
      console.log("\n✅ No pending transactions");
      console.log("   You can submit new transactions now.");
    }

    // Get gas price
    const gasPrice = await publicClient.getGasPrice();
    console.log(`\n⛽ Current Gas Price: ${(Number(gasPrice) / 1e9).toFixed(2)} gwei`);

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkPendingTransactions();

