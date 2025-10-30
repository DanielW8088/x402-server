'use client';

import { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { usePosition } from '@/hooks/usePosition';
import { formatTokenAmount, formatAddress, isValidTokenId } from '@/lib/utils';
import { FEE_TIER_LABELS } from '@/lib/constants';

export function PositionViewer() {
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [queriedTokenId, setQueriedTokenId] = useState<string | undefined>();
  const { address } = useAccount();
  const chainId = useChainId();

  const { position, isLoading, error } = usePosition(queriedTokenId, chainId);

  const handleQuery = () => {
    if (isValidTokenId(tokenIdInput)) {
      setQueriedTokenId(tokenIdInput);
    } else {
      alert('Please enter a valid numeric token ID');
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-gray-800 rounded-xl p-6 shadow-2xl">
      <h2 className="text-2xl font-bold mb-6 text-white">Query Position</h2>

      {/* Input Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          NFT Token ID
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tokenIdInput}
            onChange={(e) => setTokenIdInput(e.target.value)}
            placeholder="Enter NFT token ID (e.g., 12345)"
            className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleQuery}
            disabled={isLoading || !tokenIdInput}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            Query
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-400">Loading position...</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">
            <span className="font-semibold">Error:</span> {error}
          </p>
        </div>
      )}

      {/* Position Info */}
      {position && !isLoading && !error && (
        <div className="space-y-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Position Details</h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Token ID:</span>
                <span className="text-white font-mono">{position.tokenId}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Owner:</span>
                <span className="text-white font-mono">{formatAddress(position.owner)}</span>
              </div>

              {address && address.toLowerCase() !== position.owner.toLowerCase() && (
                <div className="bg-yellow-900/20 border border-yellow-500 rounded p-2 mt-2">
                  <p className="text-yellow-400 text-xs">
                    ⚠️ You are not the owner of this position
                  </p>
                </div>
              )}

              <div className="border-t border-gray-600 my-3"></div>

              <div className="flex justify-between">
                <span className="text-gray-400">Token Pair:</span>
                <span className="text-white font-semibold">
                  {position.token0Symbol} / {position.token1Symbol}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Fee Tier:</span>
                <span className="text-white">{FEE_TIER_LABELS[position.fee] || `${position.fee / 10000}%`}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Tick Range:</span>
                <span className="text-white font-mono">
                  {position.tickLower} → {position.tickUpper}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Liquidity:</span>
                <span className="text-white font-mono">{position.liquidity.toString()}</span>
              </div>

              <div className="border-t border-gray-600 my-3"></div>

              <div className="bg-gray-800 rounded p-3">
                <h4 className="text-white font-semibold mb-2">Uncollected Fees</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{position.token0Symbol}:</span>
                    <span className="text-green-400 font-mono">
                      {formatTokenAmount(position.tokensOwed0, position.token0Decimals || 18)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{position.token1Symbol}:</span>
                    <span className="text-green-400 font-mono">
                      {formatTokenAmount(position.tokensOwed1, position.token1Decimals || 18)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-600 my-3"></div>

              <div className="text-xs text-gray-500">
                <div>Token0: {position.token0}</div>
                <div>Token1: {position.token1}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

