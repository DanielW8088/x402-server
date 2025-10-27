const hre = require("hardhat");

/**
 * Emergency withdraw all funds from PAYX contract
 * ⚠️  Can ONLY be used BEFORE liquidity is deployed
 * ⚠️  Can only be used ONCE
 * 
 * Usage:
 *   TOKEN_CONTRACT_ADDRESS=0x... npx hardhat run scripts/emergencyWithdraw.js --network baseSepolia
 */

async function main() {
    console.log("🚨 PAYX - Emergency Withdraw\n");

    // ==================== Configuration ====================

    const TOKEN_CONTRACT_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS || process.argv[2];
    const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

    if (!TOKEN_CONTRACT_ADDRESS) {
        console.error("❌ Error: TOKEN_CONTRACT_ADDRESS required");
        console.error("\nUsage:");
        console.error("  TOKEN_CONTRACT_ADDRESS=0x... npx hardhat run scripts/emergencyWithdraw.js --network baseSepolia");
        process.exit(1);
    }

    // ==================== Connect ====================

    const [signer] = await hre.ethers.getSigners();
    console.log("📋 Configuration:");
    console.log("──────────────────────────────────────");
    console.log(`Signer: ${signer.address}`);
    console.log(`PAYX Contract: ${TOKEN_CONTRACT_ADDRESS}`);
    console.log("──────────────────────────────────────\n");

    // Get contracts
    const PAYX = await hre.ethers.getContractAt("PAYX", TOKEN_CONTRACT_ADDRESS);
    const USDC = await hre.ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)"],
        USDC_ADDRESS
    );

    // ==================== Check Status ====================

    console.log("🔍 Checking contract status...");

    const liquidityDeployed = await PAYX.liquidityDeployed();
    const contractPAYXBalance = await PAYX.balanceOf(TOKEN_CONTRACT_ADDRESS);
    const contractUSDCBalance = await USDC.balanceOf(TOKEN_CONTRACT_ADDRESS);

    console.log(`Liquidity Deployed: ${liquidityDeployed ? "Yes ❌" : "No ✅"}`);
    console.log(`Contract PAYX Balance: ${hre.ethers.formatEther(contractPAYXBalance)} PAYX`);
    console.log(`Contract USDC Balance: ${hre.ethers.formatUnits(contractUSDCBalance, 6)} USDC\n`);

    if (liquidityDeployed) {
        console.error("❌ Error: Liquidity already deployed!");
        console.error("   emergencyWithdraw() can only be called BEFORE liquidity deployment");
        console.error("\n💡 Use withdrawToken() instead:");
        console.error("   npx hardhat run scripts/withdrawUSDC.js --network baseSepolia");
        process.exit(1);
    }

    if (contractPAYXBalance === 0n && contractUSDCBalance === 0n) {
        console.log("⚠️  Contract has no funds to withdraw");
        process.exit(0);
    }

    // ==================== Check Admin Role ====================

    console.log("🔐 Checking permissions...");

    const DEFAULT_ADMIN_ROLE = await PAYX.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await PAYX.hasRole(DEFAULT_ADMIN_ROLE, signer.address);

    if (!hasAdminRole) {
        console.error(`❌ Error: ${signer.address} does not have DEFAULT_ADMIN_ROLE`);
        console.error("   Only admin can perform emergency withdraw");
        process.exit(1);
    }

    console.log("✅ Admin role confirmed\n");

    // ==================== Confirm ====================

    console.log("⚠️  WARNING: This action can only be performed ONCE!");
    console.log("⚠️  All PAYX tokens and USDC will be withdrawn to your address");
    console.log("\nProceed? Press Ctrl+C to cancel, or wait 5 seconds to continue...\n");

    await new Promise(resolve => setTimeout(resolve, 5000));

    // ==================== Withdraw ====================

    console.log("🚨 Executing emergency withdraw...");

    try {
        const signerPAYXBalanceBefore = await PAYX.balanceOf(signer.address);
        const signerUSDCBalanceBefore = await USDC.balanceOf(signer.address);

        const tx = await PAYX.emergencyWithdraw();
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("⏳ Waiting for confirmation...");

        const receipt = await tx.wait();
        console.log(`✅ Confirmed in block ${receipt.blockNumber}\n`);

        // ==================== Verify ====================

        console.log("🔍 Verifying withdrawal...");

        const signerPAYXBalanceAfter = await PAYX.balanceOf(signer.address);
        const signerUSDCBalanceAfter = await USDC.balanceOf(signer.address);
        const contractPAYXBalanceAfter = await PAYX.balanceOf(TOKEN_CONTRACT_ADDRESS);
        const contractUSDCBalanceAfter = await USDC.balanceOf(TOKEN_CONTRACT_ADDRESS);

        console.log("──────────────────────────────────────");
        console.log("PAYX Tokens:");
        console.log(`  Contract Before: ${hre.ethers.formatEther(contractPAYXBalance)}`);
        console.log(`  Contract After:  ${hre.ethers.formatEther(contractPAYXBalanceAfter)}`);
        console.log(`  Signer Before:   ${hre.ethers.formatEther(signerPAYXBalanceBefore)}`);
        console.log(`  Signer After:    ${hre.ethers.formatEther(signerPAYXBalanceAfter)}`);
        console.log(`  → Withdrawn:     ${hre.ethers.formatEther(signerPAYXBalanceAfter - signerPAYXBalanceBefore)} PAYX`);
        console.log();
        console.log("USDC:");
        console.log(`  Contract Before: ${hre.ethers.formatUnits(contractUSDCBalance, 6)}`);
        console.log(`  Contract After:  ${hre.ethers.formatUnits(contractUSDCBalanceAfter, 6)}`);
        console.log(`  Signer Before:   ${hre.ethers.formatUnits(signerUSDCBalanceBefore, 6)}`);
        console.log(`  Signer After:    ${hre.ethers.formatUnits(signerUSDCBalanceAfter, 6)}`);
        console.log(`  → Withdrawn:     ${hre.ethers.formatUnits(signerUSDCBalanceAfter - signerUSDCBalanceBefore, 6)} USDC`);
        console.log("──────────────────────────────────────\n");

        console.log("✅ Emergency withdrawal successful!");
        console.log("⚠️  Note: This function can no longer be called for this contract");

    } catch (error) {
        console.error("❌ Emergency withdrawal failed:", error.message);

        if (error.message.includes("Emergency withdraw already used")) {
            console.error("\n⚠️  This emergency withdraw has already been used");
        } else if (error.message.includes("Liquidity already deployed")) {
            console.error("\n⚠️  Liquidity has been deployed, emergency withdraw no longer available");
            console.error("   Use withdrawToken() instead");
        }

        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

