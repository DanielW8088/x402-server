'use client';

import { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { ConnectButton } from '@/components/ConnectButton';
import { PositionViewer } from '@/components/PositionViewer';
import { LiquidityRemover } from '@/components/LiquidityRemover';
import { usePosition } from '@/hooks/usePosition';
import { isValidTokenId } from '@/lib/utils';

export default function Home() {
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [queriedTokenId, setQueriedTokenId] = useState<string | undefined>();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const { position, isLoading, error } = usePosition(queriedTokenId, chainId);

  const handleQuery = () => {
    if (isValidTokenId(tokenIdInput)) {
      setQueriedTokenId(tokenIdInput);
    } else {
      alert('Please enter a valid numeric token ID');
    }
  };

  const handleRefresh = () => {
    // Re-query the same token ID to refresh data
    if (queriedTokenId) {
      const temp = queriedTokenId;
      setQueriedTokenId(undefined);
      setTimeout(() => setQueriedTokenId(temp), 100);
    }
  };

  const getChainName = () => {
    switch (chainId) {
      case 8453:
        return 'Base Mainnet';
      case 84532:
        return 'Base Sepolia';
      default:
        return `Chain ${chainId}`;
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Liquidity Manager
            </h1>
            <p className="text-gray-400">
              Manage your Uniswap V3 positions on Base
            </p>
          </div>
          <ConnectButton />
        </div>

        {isConnected && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-gray-400 text-sm">Network:</span>
                <span className="text-white font-semibold ml-2">{getChainName()}</span>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Wallet:</span>
                <span className="text-white font-mono ml-2 text-sm">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      {!isConnected ? (
        <div className="max-w-2xl mx-auto bg-gray-800 rounded-xl p-12 shadow-2xl text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400">
              Connect your wallet to view and manage your Uniswap V3 liquidity positions
            </p>
          </div>
          <div className="inline-block">
            <ConnectButton />
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Query Section */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 text-white">Query Position</h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                NFT Token ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tokenIdInput}
                  onChange={(e) => setTokenIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
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
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-white">Position Details</h3>
                    <button
                      onClick={handleRefresh}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded transition-colors"
                    >
                      🔄 Refresh
                    </button>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Token ID:</span>
                      <span className="text-white font-mono">{position.tokenId}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">Owner:</span>
                      <span className="text-white font-mono">
                        {position.owner.slice(0, 6)}...{position.owner.slice(-4)}
                      </span>
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
                      <span className="text-white">
                        {position.fee === 100 && '0.01%'}
                        {position.fee === 500 && '0.05%'}
                        {position.fee === 3000 && '0.3%'}
                        {position.fee === 10000 && '1%'}
                        {![100, 500, 3000, 10000].includes(position.fee) && `${position.fee / 10000}%`}
                      </span>
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
                      <h4 className="text-white font-semibold mb-2">💰 Uncollected Tokens</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">{position.token0Symbol}:</span>
                          <span className="text-green-400 font-mono">
                            {(Number(position.tokensOwed0) / Math.pow(10, position.token0Decimals || 18)).toFixed(6)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{position.token1Symbol}:</span>
                          <span className="text-green-400 font-mono">
                            {(Number(position.tokensOwed1) / Math.pow(10, position.token1Decimals || 18)).toFixed(6)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-600 my-3"></div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="break-all">Token0: {position.token0}</div>
                      <div className="break-all">Token1: {position.token1}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Liquidity Remover */}
          {position && !isLoading && !error && (
            <LiquidityRemover 
              position={position} 
              chainId={chainId} 
              onSuccess={handleRefresh}
            />
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-6xl mx-auto mt-12 pt-8 border-t border-gray-700 text-center text-gray-400 text-sm">
        <p>Built for Base chain • Uniswap V3 Liquidity Management</p>
      </footer>
    </main>
  );
}

