// Uniswap V3 contract addresses on Base chain
export const UNISWAP_V3_ADDRESSES = {
  // Base Mainnet
  8453: {
    NonfungiblePositionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    UniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    SwapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
  },
  // Base Sepolia Testnet
  84532: {
    NonfungiblePositionManager: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
    UniswapV3Factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    SwapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
  },
} as const;

export function getUniswapV3Addresses(chainId: number) {
  return UNISWAP_V3_ADDRESSES[chainId as keyof typeof UNISWAP_V3_ADDRESSES] || UNISWAP_V3_ADDRESSES[8453];
}

