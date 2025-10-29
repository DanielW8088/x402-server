/**
 * Debug LP Deployment - Check balances and approvals
 */

const hre = require("hardhat");
const { ethers } = hre;

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "";
const LAUNCH_TOOL_ADDRESS = process.env.LAUNCH_TOOL_ADDRESS || "";
const TARGET_PRICE_USDC = parseFloat(process.env.TARGET_PRICE_USDC || "0.5");

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
];

const TOKEN_ABI = [
    "function paymentToken() view returns (address)",
    "function lpDeployer() view returns (address)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
];

async function main() {
    console.log("🔍 Debug LP Deployment Flow\n");

    if (!TOKEN_ADDRESS) {
        throw new Error("❌ TOKEN_ADDRESS not set!");
    }
    if (!LAUNCH_TOOL_ADDRESS) {
        throw new Error("❌ LAUNCH_TOOL_ADDRESS not set!");
    }

    const [signer] = await ethers.getSigners();
    const signerAddress = await signer.getAddress();

    console.log(`Signer: ${signerAddress}`);
    console.log(`Token: ${TOKEN_ADDRESS}`);
    console.log(`LaunchTool: ${LAUNCH_TOOL_ADDRESS}\n`);

    // Get token contract
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    const tokenDecimals = await token.decimals();
    const tokenBalance = await token.balanceOf(signerAddress);
    const tokenAllowance = await token.allowance(signerAddress, LAUNCH_TOOL_ADDRESS);

    console.log("📊 Token Info:");
    console.log(`  Decimals: ${tokenDecimals}`);
    console.log(`  Balance: ${ethers.formatUnits(tokenBalance, tokenDecimals)} Token`);
    console.log(`  Allowance to LaunchTool: ${ethers.formatUnits(tokenAllowance, tokenDecimals)} Token\n`);

    // Get USDC
    const usdcAddress = await token.paymentToken();
    const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
    const usdcDecimals = await usdc.decimals();
    const usdcBalance = await usdc.balanceOf(signerAddress);
    const usdcAllowance = await usdc.allowance(signerAddress, LAUNCH_TOOL_ADDRESS);
    const usdcSymbol = await usdc.symbol();

    console.log("💵 USDC Info:");
    console.log(`  Address: ${usdcAddress}`);
    console.log(`  Symbol: ${usdcSymbol}`);
    console.log(`  Decimals: ${usdcDecimals}`);
    console.log(`  Balance: ${ethers.formatUnits(usdcBalance, usdcDecimals)} ${usdcSymbol}`);
    console.log(`  Allowance to LaunchTool: ${ethers.formatUnits(usdcAllowance, usdcDecimals)} ${usdcSymbol}\n`);

    // Calculate required amounts
    const tokenAmountFloat = parseFloat(ethers.formatUnits(tokenBalance, tokenDecimals));
    const requiredUsdcFloat = tokenAmountFloat * TARGET_PRICE_USDC;
    const usdcDecimalsNum = Number(usdcDecimals);
    const requiredUsdc = ethers.parseUnits(requiredUsdcFloat.toFixed(usdcDecimalsNum), usdcDecimals);

    console.log("🧮 Calculations:");
    console.log(`  Will use Token: ${tokenAmountFloat.toFixed(6)} Token`);
    console.log(`  Target Price: 1 Token = ${TARGET_PRICE_USDC} ${usdcSymbol}`);
    console.log(`  Required ${usdcSymbol}: ${requiredUsdcFloat.toFixed(6)} ${usdcSymbol}`);
    console.log(`  Required ${usdcSymbol} (wei): ${requiredUsdc.toString()}\n`);

    // Determine token0/token1
    let token0, token1, amount0, amount1;
    if (usdcAddress.toLowerCase() < TOKEN_ADDRESS.toLowerCase()) {
        token0 = usdcAddress;
        token1 = TOKEN_ADDRESS;
        amount0 = requiredUsdc;
        amount1 = tokenBalance;
    } else {
        token0 = TOKEN_ADDRESS;
        token1 = usdcAddress;
        amount0 = tokenBalance;
        amount1 = requiredUsdc;
    }

    console.log("📦 Token Order:");
    console.log(`  token0: ${token0}`);
    console.log(`  token1: ${token1}`);
    console.log(`  amount0: ${amount0.toString()}`);
    console.log(`  amount1: ${amount1.toString()}\n`);

    // Check if sufficient
    console.log("✅ Validation:");

    if (tokenBalance === 0n) {
        console.log(`  ❌ No Token balance!`);
    } else {
        console.log(`  ✅ Token balance sufficient: ${ethers.formatUnits(tokenBalance, tokenDecimals)}`);
    }

    if (usdcBalance < requiredUsdc) {
        console.log(`  ❌ Insufficient ${usdcSymbol}! Have: ${ethers.formatUnits(usdcBalance, usdcDecimals)}, Need: ${requiredUsdcFloat.toFixed(6)}`);
    } else {
        console.log(`  ✅ ${usdcSymbol} balance sufficient`);
    }

    if (tokenAllowance < tokenBalance) {
        console.log(`  ❌ Token not approved to LaunchTool! Allowance: ${ethers.formatUnits(tokenAllowance, tokenDecimals)}`);
    } else {
        console.log(`  ✅ Token approved to LaunchTool`);
    }

    if (usdcAllowance < requiredUsdc) {
        console.log(`  ❌ ${usdcSymbol} not approved to LaunchTool! Allowance: ${ethers.formatUnits(usdcAllowance, usdcDecimals)}`);
    } else {
        console.log(`  ✅ ${usdcSymbol} approved to LaunchTool`);
    }

    console.log("\n✨ If all checks pass, you can proceed with the deployment!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

