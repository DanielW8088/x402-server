import { config } from "dotenv";
import { createPublicClient, http, parseAbi, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

config();

const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const tokenContractAddress = process.env.TOKEN_CONTRACT_ADDRESS as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";

if (!serverPrivateKey || !tokenContractAddress) {
  console.error("❌ Missing SERVER_PRIVATE_KEY or TOKEN_CONTRACT_ADDRESS");
  process.exit(1);
}

const chain = network === "base-sepolia" ? baseSepolia : base;
const account = privateKeyToAccount(serverPrivateKey);

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

const tokenAbi = parseAbi([
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function MINTER_ROLE() view returns (bytes32)",
]);

async function checkRole() {
  console.log("🔍 Checking MINTER_ROLE...");
  console.log(`Network: ${network}`);
  console.log(`Server Address: ${account.address}`);
  console.log(`Token Contract: ${tokenContractAddress}\n`);

  try {
    // Get MINTER_ROLE hash
    const minterRole = await publicClient.readContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "MINTER_ROLE",
    });

    console.log(`MINTER_ROLE: ${minterRole}`);

    // Check if server has MINTER_ROLE
    const hasMinterRole = await publicClient.readContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "hasRole",
      args: [minterRole, account.address],
    });

    if (hasMinterRole) {
      console.log(`✅ Server address HAS MINTER_ROLE`);
      console.log(`   The server can mint tokens!`);
    } else {
      console.log(`❌ Server address DOES NOT have MINTER_ROLE`);
      console.log(`\n💡 To grant MINTER_ROLE:`);
      console.log(`   1. cd ../contracts`);
      console.log(`   2. Add to .env:`);
      console.log(`      SERVER_ADDRESS=${account.address}`);
      console.log(`      TOKEN_CONTRACT_ADDRESS=${tokenContractAddress}`);
      console.log(`   3. Run: npm run grant:minter`);
    }

    // Check DEFAULT_ADMIN_ROLE
    try {
      const defaultAdminRole = await publicClient.readContract({
        address: tokenContractAddress,
        abi: tokenAbi,
        functionName: "DEFAULT_ADMIN_ROLE",
      });

      const hasAdminRole = await publicClient.readContract({
        address: tokenContractAddress,
        abi: tokenAbi,
        functionName: "hasRole",
        args: [defaultAdminRole, account.address],
      });

      console.log(`\n📊 Additional info:`);
      console.log(`   Has DEFAULT_ADMIN_ROLE: ${hasAdminRole ? "✅ Yes" : "❌ No"}`);
    } catch {}

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.log("\n💡 Possible issues:");
    console.log("   - Token contract address is incorrect");
    console.log("   - Contract doesn't have AccessControl");
    console.log("   - Network mismatch");
  }
}

checkRole();

