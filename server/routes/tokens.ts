import { Router } from "express";
import { Pool } from "pg";
import Redis from "ioredis";
import { getToken, getAllTokens } from "../services/tokenDeployer.js";
import { publicClient, tokenAbi } from "../config/blockchain.js";
import { network } from "../config/env.js";

export function createTokensRouter(pool: Pool, redis: Redis | null): Router {
  const router = Router();

  /**
   * GET /api/tokens - Get all deployed tokens
   */
  router.get("/tokens", async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error: "Database not configured",
      });
    }

    try {
      const { 
        deployer, 
        limit = 50, 
        offset = 0,
        search,
        sortBy,
        withTotal
      } = req.query;
      
      // Cache key
      const cacheKey = `tokens:${network}:${deployer || 'all'}:${limit}:${offset}:${search || 'none'}:${sortBy || 'default'}:${withTotal || 'false'}`;
      const cacheTTL = parseInt(process.env.TOKENS_CACHE_TTL || '30');
      
      // Try cache first
      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            return res.json(JSON.parse(cached));
          }
        } catch (cacheErr: any) {
          // Redis read error
        }
      }

      const result = await getAllTokens(pool, {
        network,
        deployer: deployer as string,
        isActive: true,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        search: search as string,
        sortBy: (sortBy as 'mintCount' | 'created' | 'volume') || 'mintCount',
        withTotal: withTotal === 'true',
      });

      const tokens = Array.isArray(result) ? result : result.tokens;

      if (tokens.length === 0) {
        return res.json({ tokens: [], total: 0 });
      }

      // Use multicall to batch read chain data
      const contracts = tokens.flatMap(token => [
        {
          address: token.address as `0x${string}`,
          abi: tokenAbi,
          functionName: "mintCount" as const,
        },
        {
          address: token.address as `0x${string}`,
          abi: tokenAbi,
          functionName: "liquidityDeployed" as const,
        }
      ]);

      let chainResults: any[] = [];
      try {
        chainResults = await publicClient.multicall({ contracts, allowFailure: true });
      } catch (err: any) {
        // Multicall failed, using DB fallback
      }

      // Format tokens with chain data
      const formattedTokens = tokens.map((token, i) => {
        let mintCount = token.mint_count;
        let liquidityDeployed = token.liquidity_deployed;

        if (chainResults.length > i * 2) {
          const mintCountResult = chainResults[i * 2];
          const lpResult = chainResults[i * 2 + 1];
          
          if (mintCountResult.status === 'success' && mintCountResult.result !== undefined) {
            mintCount = Number(mintCountResult.result);
          }
          if (lpResult.status === 'success' && lpResult.result !== undefined) {
            liquidityDeployed = lpResult.result as boolean;
          }
        }

        const mintCount24h = parseInt(token.mint_count_24h || '0');
        const priceMatch = token.price ? token.price.match(/[\d.]+/) : null;
        const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 0;
        const volume24hUSDC = mintCount24h * pricePerMint;

        return {
          address: token.address,
          name: token.name,
          symbol: token.symbol,
          deployer: token.deployer_address,
          mintAmount: token.mint_amount,
          maxMintCount: token.max_mint_count,
          mintCount,
          mintCount24h,
          volume24hUSDC,
          price: token.price,
          paymentToken: token.payment_token_symbol,
          network: token.network,
          liquidityDeployed,
          createdAt: token.created_at,
          mintUrl: `/mint/${token.address}`,
          logoUrl: token.logo_url || null,
        };
      });

      const response = {
        tokens: formattedTokens,
        total: !Array.isArray(result) ? result.total : formattedTokens.length,
      };
      
      // Store in cache
      if (redis) {
        try {
          await redis.setex(cacheKey, cacheTTL, JSON.stringify(response));
        } catch (cacheErr: any) {
          // Redis write error
        }
      }

      return res.json(response);
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to fetch tokens",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/tokens/:address - Get specific token info
   */
  router.get("/tokens/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const tokenContractAddress = address as `0x${string}`;
      
      // Cache key
      const cacheKey = `token:${network}:${address.toLowerCase()}`;
      const cacheTTL = parseInt(process.env.TOKEN_CACHE_TTL || '10');
      
      // Try cache first
      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            return res.json(JSON.parse(cached));
          }
        } catch (cacheErr: any) {
          // Redis read error
        }
      }

      // Fetch on-chain data
      const [mintAmount, maxSupply, totalSupply, remainingSupply, mintCount, maxMintCount, liquidityDeployed] = 
        await Promise.all([
          publicClient.readContract({
            address: tokenContractAddress,
            abi: tokenAbi,
            functionName: "mintAmount",
          }),
          publicClient.readContract({
            address: tokenContractAddress,
            abi: tokenAbi,
            functionName: "maxSupply",
          }),
          publicClient.readContract({
            address: tokenContractAddress,
            abi: tokenAbi,
            functionName: "totalSupply",
          }),
          publicClient.readContract({
            address: tokenContractAddress,
            abi: tokenAbi,
            functionName: "remainingSupply",
          }),
          publicClient.readContract({
            address: tokenContractAddress,
            abi: tokenAbi,
            functionName: "mintCount",
          }),
          publicClient.readContract({
            address: tokenContractAddress,
            abi: tokenAbi,
            functionName: "maxMintCount",
          }),
          publicClient.readContract({
            address: tokenContractAddress,
            abi: tokenAbi,
            functionName: "liquidityDeployed",
          }),
        ]);

      const mintProgress = Number(mintCount) / Number(maxMintCount) * 100;

      // Get database info
      let dbToken = null;
      if (pool) {
        dbToken = await getToken(pool, address);
      }

      // Get decimals
      let decimals = 6;
      try {
        const decimalsResult = await publicClient.readContract({
          address: address as `0x${string}`,
          abi: tokenAbi,
          functionName: 'decimals',
        }) as number;
        decimals = decimalsResult;
      } catch (err) {
        console.warn(`Failed to read decimals for ${address}, using default 6:`, err);
      }

      const response = {
        address: address,
        name: dbToken?.name || "Unknown Token",
        symbol: dbToken?.symbol || "???",
        tokensPerMint: mintAmount.toString(),
        maxSupply: maxSupply.toString(),
        totalSupply: totalSupply.toString(),
        remainingSupply: remainingSupply.toString(),
        mintCount: mintCount.toString(),
        maxMintCount: maxMintCount.toString(),
        mintProgress: `${mintProgress.toFixed(2)}%`,
        liquidityDeployed,
        network,
        price: dbToken?.price || "1 USDC",
        paymentToken: dbToken?.payment_token_symbol || "USDC",
        deployer: dbToken?.deployer_address,
        paymentAddress: address,
        logoUrl: dbToken?.logo_url || null,
        decimals,
      };
      
      // Store in cache
      if (redis) {
        try {
          await redis.setex(cacheKey, cacheTTL, JSON.stringify(response));
        } catch (cacheErr: any) {
          // Redis write error
        }
      }

      return res.json(response);
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to fetch token info",
        message: error.message,
      });
    }
  });

  return router;
}

