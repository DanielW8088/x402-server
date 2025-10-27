const hre = require("hardhat");

async function main() {
  const tokenAddress = process.env.TOKEN_CONTRACT_ADDRESS || process.argv[2];

  if (!tokenAddress) {
    console.error("Usage: node checkStatus.js <tokenAddress>");
    console.error("Or set TOKEN_CONTRACT_ADDRESS env var");
    process.exit(1);
  }

  console.log("🔍 Checking Token Contract Status");
  console.log("==================================\n");

  try {
    const token = await hre.ethers.getContractAt("MintToken", tokenAddress);

    // Basic info
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const totalSupply = await token.totalSupply();
    const maxSupply = await token.maxSupply();
    const remainingSupply = await token.remainingSupply();

    console.log("📊 Token Information:");
    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Decimals: ${decimals}`);
    console.log(`   Total Supply: ${Number(hre.ethers.formatUnits(totalSupply, decimals)).toLocaleString()}`);
    console.log(`   Max Supply: ${Number(hre.ethers.formatUnits(maxSupply, decimals)).toLocaleString()} (1 billion)`);
    console.log(`   Remaining Supply: ${Number(hre.ethers.formatUnits(remainingSupply, decimals)).toLocaleString()}`);

    const supplyPercentage = (Number(totalSupply) / Number(maxSupply) * 100).toFixed(2);
    console.log(`   Supply Used: ${supplyPercentage}%`);
    console.log();

    // Mint configuration
    const mintAmount = await token.mintAmount();
    const maxMintCount = await token.maxMintCount();
    const mintCount = await token.mintCount();

    console.log("⚙️  Mint Configuration:");
    console.log(`   Mint Amount: ${Number(hre.ethers.formatUnits(mintAmount, decimals)).toLocaleString()} tokens per payment`);
    console.log(`   Max Mint Count: ${maxMintCount.toString() === "0" ? "Unlimited" : Number(maxMintCount).toLocaleString()}`);
    console.log(`   Current Mint Count: ${Number(mintCount).toLocaleString()}`);

    // Calculate max possible mints based on remaining supply
    const maxPossibleMints = Math.floor(Number(remainingSupply) / Number(mintAmount));
    console.log(`   Max Possible Mints: ${maxPossibleMints.toLocaleString()} (based on remaining supply)`);

    if (maxMintCount > 0n) {
      const remaining = maxMintCount - mintCount;
      console.log(`   Remaining Mints (by count): ${Number(remaining).toLocaleString()}`);
    }
    console.log();

    // Role information
    const MINTER_ROLE = await token.MINTER_ROLE();
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();

    console.log("🔑 Roles:");
    console.log(`   MINTER_ROLE: ${MINTER_ROLE}`);
    console.log(`   DEFAULT_ADMIN_ROLE: ${DEFAULT_ADMIN_ROLE}`);
    console.log();

    // Check owner
    const owner = await token.owner();
    console.log(`👤 Owner: ${owner}`);
    console.log();

    // If server address is provided, check its roles
    const serverAddress = process.env.SERVER_ADDRESS;
    if (serverAddress) {
      console.log(`🖥️  Server Address: ${serverAddress}`);
      const hasMinterRole = await token.hasRole(MINTER_ROLE, serverAddress);
      const hasAdminRole = await token.hasRole(DEFAULT_ADMIN_ROLE, serverAddress);
      console.log(`   Has MINTER_ROLE: ${hasMinterRole ? "✅ YES" : "❌ NO"}`);
      console.log(`   Has ADMIN_ROLE: ${hasAdminRole ? "✅ YES" : "❌ NO"}`);

      if (!hasMinterRole) {
        console.log("\n⚠️  WARNING: Server address doesn't have MINTER_ROLE!");
        console.log(`   Run: npm run grant:sepolia`);
      }
    }

    console.log("\n✅ Contract is operational");
  } catch (error) {
    console.error("❌ Error checking contract:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

