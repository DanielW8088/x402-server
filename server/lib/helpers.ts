import { keccak256, toHex } from "viem";
import { network } from "../config/env.js";

/**
 * Generate a unique transaction hash for minting
 * Uses keccak256 to create a proper 32-byte hash
 */
export function generateMintTxHash(payer: string, timestamp: number, tokenAddress: string): `0x${string}` {
  const data = `${payer}-${timestamp}-${tokenAddress}`;
  const hash = keccak256(toHex(data));
  return hash as `0x${string}`;
}

/**
 * Generate payment requirements (used for both 402 response and verification)
 */
export function generatePaymentRequirements(
  tokenAddress: string,
  quantity: number,
  totalPrice: number,
  totalPriceWei: bigint,
  baseUrl: string
) {
  const usdcAddress = network === 'base-sepolia' 
    ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
  
  // Ensure HTTPS for production
  const resourceUrl = baseUrl.replace(/^http:/, 'https:');
  
  return {
    scheme: "exact" as const,
    description: `Mint ${quantity}x AI agent tokens - Gasless minting on 0x402 protocol`,
    network: network as "base-sepolia" | "base",
    resource: `${resourceUrl}/api/mint/${tokenAddress}`,
    mimeType: "application/json",
    payTo: tokenAddress as `0x${string}`,
    maxAmountRequired: totalPriceWei.toString(),
    maxTimeoutSeconds: 300,
    asset: usdcAddress,
    outputSchema: {
      input: {
        type: "http" as const,
        method: "POST" as const,
        bodyType: "json" as const,
        bodyFields: {
          quantity: {
            type: "number",
            description: "Number of tokens to mint",
            required: false
          }
        }
      },
      output: {
        success: {
          type: "boolean",
          description: "Whether the mint was successful"
        },
        tokenAddress: {
          type: "string",
          description: "Address of the minted token contract"
        },
        amount: {
          type: "string",
          description: "Amount of tokens minted (in wei)"
        },
        mint_tx_hash: {
          type: "string",
          description: "Transaction hash of the mint operation"
        },
        payment_tx_hash: {
          type: "string",
          description: "Transaction hash of the payment"
        },
        payer: {
          type: "string",
          description: "Address of the payer"
        }
      }
    }
  };
}

/**
 * Generate a hash code from a string for advisory lock
 */
export function getAdvisoryLockId(str: string): bigint {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return BigInt(Math.abs(hash));
}

