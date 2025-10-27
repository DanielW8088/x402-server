import { config } from "dotenv";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

config();

const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;

const usdcAbi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
]);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

async function checkDomain() {
  console.log("🔍 Checking USDC EIP-712 Domain Parameters...\n");
  console.log(`USDC Address: ${usdcAddress}`);
  console.log(`Chain: Base Sepolia (${baseSepolia.id})\n`);

  try {
    const [name, version, domainSeparator] = await Promise.all([
      publicClient.readContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "name",
      }),
      publicClient.readContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "version",
      }),
      publicClient.readContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "DOMAIN_SEPARATOR",
      }),
    ]);

    console.log("✅ Domain Parameters:");
    console.log(`   Name: "${name}"`);
    console.log(`   Version: "${version}"`);
    console.log(`   ChainId: ${baseSepolia.id}`);
    console.log(`   VerifyingContract: ${usdcAddress}`);
    console.log(`\n📝 Domain Separator: ${domainSeparator}`);
    
    console.log("\n📋 Use these in your frontend:");
    console.log(`
domain: {
  name: '${name}',
  version: '${version}',
  chainId: ${baseSepolia.id},
  verifyingContract: '${usdcAddress}',
}
    `);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkDomain();

