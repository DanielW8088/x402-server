'use client';

import { useReadContract } from 'wagmi';
import { ERC20_ABI } from '@/contracts/abis';

export function useTokenInfo(tokenAddress: string | undefined, chainId: number) {
  const { data: symbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'symbol',
    chainId,
    query: {
      enabled: !!tokenAddress,
    },
  });

  const { data: decimals } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId,
    query: {
      enabled: !!tokenAddress,
    },
  });

  const { data: name } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'name',
    chainId,
    query: {
      enabled: !!tokenAddress,
    },
  });

  return {
    symbol: symbol as string | undefined,
    decimals: decimals as number | undefined,
    name: name as string | undefined,
  };
}

