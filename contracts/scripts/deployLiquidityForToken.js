// npx hardhat run scripts/configureSimple.js --network baseSepolia
// Simple: adds 1 USDC + 20 000 Token B liquidity to a new Uniswap V3 pool via LaunchTool

const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using signer:", await signer.getAddress());

  // === addresses ===
  const LAUNCH_TOOL = "0xA5fEEaDCf22f64a528378dA2677791acB782284c"; // your deployed LaunchTool
  const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // replace with actual USDC test token
  const TOKENB = "0xC9561C362E5706eB5c3c537d13f1E9949304638b"; // replace with your ERC20 token
  const FEE = 10000; // 1% pool

  // === create minimal ABIs ===
  const erc20Abi = [
    "function decimals() view returns (uint8)",
    "function approve(address spender, uint256 value) returns (bool)",
  ];
  const launchToolAbi = [
    "function configurePoolByAmount(address,address,uint256,uint256,uint160,int24,int24,uint24) returns (uint256)",
  ];

  const usdc = new ethers.Contract(USDC, erc20Abi, signer);
  const tokenB = new ethers.Contract(TOKENB, erc20Abi, signer);
  const launchTool = new ethers.Contract(LAUNCH_TOOL, launchToolAbi, signer);

  const dec0 = await usdc.decimals();
  const dec1 = await tokenB.decimals();

  // === liquidity amounts ===
  const amountUSDC = ethers.parseUnits("1", dec0); // 1 USDC
  const amountTokenB = ethers.parseUnits("20000", dec1); // 20 000 Token B

  // === sort tokens (token0 < token1) ===
  let token0, token1, amount0, amount1, dec0final, dec1final;
  if (USDC.toLowerCase() < TOKENB.toLowerCase()) {
    token0 = USDC;
    token1 = TOKENB;
    amount0 = amountUSDC;
    amount1 = amountTokenB;
    dec0final = dec0;
    dec1final = dec1;
  } else {
    token0 = TOKENB;
    token1 = USDC;
    amount0 = amountTokenB;
    amount1 = amountUSDC;
    dec0final = dec1;
    dec1final = dec0;
  }

  // === compute sqrtPriceX96 from ratio amount1/amount0 ===
  function sqrtBigInt(y) {
    if (y < 2n) return y;
    let x0 = y / 2n,
      x1 = (x0 + y / x0) / 2n;
    while (x1 < x0) [x0, x1] = [x1, (x1 + y / x1) / 2n];
    return x0;
  }
  function encodeSqrtRatioX96(amount1, amount0) {
    const ratio = (amount1 << 192n) / amount0;
    return sqrtBigInt(ratio);
  }
  const sqrtPriceX96 = encodeSqrtRatioX96(amount1, amount0);

  // === simple wide tick range ===
  const tickLower = -887220;
  const tickUpper = 887220;

  // === approve ===
  console.log("Approving tokens for LaunchTool...");
  await (await usdc.approve(LAUNCH_TOOL, amountUSDC)).wait();
  await (await tokenB.approve(LAUNCH_TOOL, amountTokenB)).wait();

  // === call configurePoolByAmount ===
  console.log("Creating pool and adding liquidity...");

  // print all debug info
  // Using signer: 0xf7a66e2749152cc77f9F56a679EE7A1A9F5806aF
  // Approving tokens for LaunchTool...
  // Creating pool and adding liquidity...
  // Token0: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
  // Token1: 0xC9561C362E5706eB5c3c537d13f1E9949304638b
  // Amount0: 1000000
  // Amount1: 20000000000000000000000
  // SqrtPriceX96: 11204554194957227983746387645491634352
  // TickLower: -887220
  // TickUpper: 887220
  // Fee: 10000
  // ❌ Error during liquidity provision: ProviderError: execution reverted

  console.log("Token0:", token0);
  console.log("Token1:", token1);
  console.log("Amount0:", amount0.toString());
  console.log("Amount1:", amount1.toString());
  console.log("SqrtPriceX96:", sqrtPriceX96.toString());
  console.log("TickLower:", tickLower);
  console.log("TickUpper:", tickUpper);
  console.log("Fee:", FEE);

  try {
    const tx = await launchTool.configurePoolByAmount(
      token0,
      token1,
      amount0,
      amount1,
      sqrtPriceX96,
      tickLower,
      tickUpper,
      FEE
    );
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, mined in block:", receipt.blockNumber);
  } catch (error) {
    console.error("❌ Error during liquidity provision:", error);
  }
}

main().catch(console.error);
