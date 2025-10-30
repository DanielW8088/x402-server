'use client';

import { useEffect, useState } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { getUniswapV3Addresses } from '@/contracts/addresses';
import { 
  NONFUNGIBLE_POSITION_MANAGER_ABI, 
  ERC20_ABI,
  UNISWAP_V3_POOL_ABI 
} from '@/contracts/abis';

export interface PositionInfo {
  tokenId: string;
  owner: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Decimals?: number;
  token1Decimals?: number;
  poolAddress?: string;
}

export function usePosition(tokenId: string | undefined, chainId: number) {
  const [positionInfo, setPositionInfo] = useState<PositionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addresses = getUniswapV3Addresses(chainId);

  // Read position data
  const { data: positionData, isLoading: isPositionLoading, error: positionError } = useReadContract({
    address: addresses.NonfungiblePositionManager as `0x${string}`,
    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
    functionName: 'positions',
    args: tokenId ? [BigInt(tokenId)] : [0n],
    chainId,
    query: {
      enabled: !!tokenId && tokenId.length > 0,
    },
  });

  // Read owner
  const { data: ownerData } = useReadContract({
    address: addresses.NonfungiblePositionManager as `0x${string}`,
    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
    functionName: 'ownerOf',
    args: tokenId ? [BigInt(tokenId)] : [0n],
    chainId,
    query: {
      enabled: !!tokenId && tokenId.length > 0,
    },
  });

  useEffect(() => {
    if (!positionData || !ownerData) {
      setPositionInfo(null);
      return;
    }

    setError(null);

    try {
      const [
        nonce,
        operator,
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        liquidity,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
        tokensOwed0,
        tokensOwed1,
      ] = positionData as any[];

      // For now, use placeholder symbols/decimals
      // In production, you'd want to fetch these from the blockchain
      setPositionInfo({
        tokenId: tokenId!,
        owner: ownerData as string,
        token0: token0 as string,
        token1: token1 as string,
        fee: Number(fee),
        tickLower: Number(tickLower),
        tickUpper: Number(tickUpper),
        liquidity: BigInt(liquidity.toString()),
        tokensOwed0: BigInt(tokensOwed0.toString()),
        tokensOwed1: BigInt(tokensOwed1.toString()),
        token0Symbol: 'TOKEN0',
        token1Symbol: 'TOKEN1',
        token0Decimals: 18,
        token1Decimals: 18,
      });
    } catch (err: any) {
      console.error('Error parsing position data:', err);
      setError(err.message || 'Failed to parse position data');
    }
  }, [positionData, ownerData, tokenId]);

  return {
    position: positionInfo,
    isLoading: isPositionLoading || isLoading,
    error: positionError ? (positionError as Error).message : error,
  };
}

