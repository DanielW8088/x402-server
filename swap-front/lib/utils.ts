import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format token amount with decimals
export function formatTokenAmount(amount: bigint, decimals: number, maxDecimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === 0n) {
    return integerPart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.slice(0, maxDecimals).replace(/0+$/, '');
  
  if (trimmed === '') {
    return integerPart.toString();
  }
  
  return `${integerPart}.${trimmed}`;
}

// Format address to shortened version
export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Format percentage
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

// Calculate deadline (current timestamp + buffer in seconds)
export function getDeadline(bufferSeconds: number = 1800): number {
  return Math.floor(Date.now() / 1000) + bufferSeconds;
}

// Validate Ethereum address
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Validate token ID (numeric string or number)
export function isValidTokenId(tokenId: string): boolean {
  return /^\d+$/.test(tokenId);
}

