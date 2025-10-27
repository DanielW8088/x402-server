const hre = require("hardhat");

async function main() {
  // 从命令行参数获取，或使用环境变量
  const tokenAddress = process.env.TOKEN_CONTRACT_ADDRESS || process.argv[2];
  const serverAddress = process.env.SERVER_ADDRESS || process.argv[3];

  if (!tokenAddress || !serverAddress) {
    console.error("Usage: node grantRole.js <tokenAddress> <serverAddress>");
    console.error("Or set TOKEN_CONTRACT_ADDRESS and SERVER_ADDRESS env vars");
    process.exit(1);
  }

  console.log(`Granting MINTER_ROLE to ${serverAddress}`);
  console.log(`Token contract: ${tokenAddress}`);

  // Try to get contract (works with MintToken, X402Token, or PAYX)
  let token;
  try {
    token = await hre.ethers.getContractAt("PAYX", tokenAddress);
  } catch {
    try {
      token = await hre.ethers.getContractAt("X402Token", tokenAddress);
    } catch {
      token = await hre.ethers.getContractAt("MintToken", tokenAddress);
    }
  }

  // Get MINTER_ROLE bytes32
  const MINTER_ROLE = await token.MINTER_ROLE();
  console.log(`MINTER_ROLE: ${MINTER_ROLE}`);

  // Check if already has role
  const hasRole = await token.hasRole(MINTER_ROLE, serverAddress);
  if (hasRole) {
    console.log("✅ Address already has MINTER_ROLE");
    return;
  }

  // Grant role
  const tx = await token.grantRole(MINTER_ROLE, serverAddress);
  console.log(`Transaction sent: ${tx.hash}`);

  await tx.wait();
  console.log("✅ MINTER_ROLE granted successfully");

  // Verify
  const hasRoleAfter = await token.hasRole(MINTER_ROLE, serverAddress);
  console.log(`Verification: ${hasRoleAfter ? "SUCCESS" : "FAILED"}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

