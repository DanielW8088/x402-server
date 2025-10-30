'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { PositionInfo } from '@/hooks/usePosition';
import { getUniswapV3Addresses } from '@/contracts/addresses';
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/contracts/abis';
import { formatTokenAmount, getDeadline } from '@/lib/utils';
import { MAX_UINT128, DEFAULT_SLIPPAGE } from '@/lib/constants';

interface LiquidityRemoverProps {
  position: PositionInfo;
  chainId: number;
  onSuccess?: () => void;
}

export function LiquidityRemover({ position, chainId, onSuccess }: LiquidityRemoverProps) {
  const [removePercent, setRemovePercent] = useState('100');
  const [isRemoving, setIsRemoving] = useState(false);
  const [step, setStep] = useState<'idle' | 'decrease' | 'collect' | 'burn'>('idle');

  const { address } = useAccount();
  const addresses = getUniswapV3Addresses(chainId);

  const { writeContract: decreaseLiquidity, data: decreaseHash } = useWriteContract();
  const { writeContract: collect, data: collectHash } = useWriteContract();
  const { writeContract: burn, data: burnHash } = useWriteContract();

  const { isLoading: isDecreaseConfirming } = useWaitForTransactionReceipt({
    hash: decreaseHash,
  });

  const { isLoading: isCollectConfirming } = useWaitForTransactionReceipt({
    hash: collectHash,
  });

  const { isLoading: isBurnConfirming } = useWaitForTransactionReceipt({
    hash: burnHash,
  });

  const isOwner = address && address.toLowerCase() === position.owner.toLowerCase();

  const handleDecreaseLiquidity = async () => {
    if (!isOwner) {
      alert('You are not the owner of this position');
      return;
    }

    const percent = parseFloat(removePercent);
    if (isNaN(percent) || percent <= 0 || percent > 100) {
      alert('Please enter a valid percentage (1-100)');
      return;
    }

    try {
      setIsRemoving(true);
      setStep('decrease');

      const liquidityToRemove = (position.liquidity * BigInt(Math.floor(percent * 100))) / 10000n;

      decreaseLiquidity({
        address: addresses.NonfungiblePositionManager as `0x${string}`,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'decreaseLiquidity',
        args: [
          {
            tokenId: BigInt(position.tokenId),
            liquidity: liquidityToRemove,
            amount0Min: 0n, // Consider slippage in production
            amount1Min: 0n,
            deadline: BigInt(getDeadline()),
          },
        ],
      });
    } catch (error: any) {
      console.error('Error decreasing liquidity:', error);
      alert(`Failed to decrease liquidity: ${error.message}`);
      setIsRemoving(false);
      setStep('idle');
    }
  };

  const handleCollect = async () => {
    if (!isOwner) {
      alert('You are not the owner of this position');
      return;
    }

    try {
      setStep('collect');

      collect({
        address: addresses.NonfungiblePositionManager as `0x${string}`,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'collect',
        args: [
          {
            tokenId: BigInt(position.tokenId),
            recipient: address as `0x${string}`,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
          },
        ],
      });
    } catch (error: any) {
      console.error('Error collecting tokens:', error);
      alert(`Failed to collect tokens: ${error.message}`);
      setIsRemoving(false);
      setStep('idle');
    }
  };

  const handleBurn = async () => {
    if (!isOwner) {
      alert('You are not the owner of this position');
      return;
    }

    if (position.liquidity > 0n) {
      alert('Please remove all liquidity before burning the NFT');
      return;
    }

    if (!confirm('Are you sure you want to burn this NFT? This action cannot be undone.')) {
      return;
    }

    try {
      setStep('burn');

      burn({
        address: addresses.NonfungiblePositionManager as `0x${string}`,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'burn',
        args: [BigInt(position.tokenId)],
      });
    } catch (error: any) {
      console.error('Error burning NFT:', error);
      alert(`Failed to burn NFT: ${error.message}`);
      setStep('idle');
    }
  };

  // Auto-transition after decrease completes
  if (decreaseHash && !isDecreaseConfirming && step === 'decrease') {
    setStep('idle');
    setIsRemoving(false);
    alert('Liquidity decreased successfully! Now you can collect your tokens.');
  }

  // Auto-transition after collect completes
  if (collectHash && !isCollectConfirming && step === 'collect') {
    setStep('idle');
    alert('Tokens collected successfully!');
    if (onSuccess) onSuccess();
  }

  // Auto-transition after burn completes
  if (burnHash && !isBurnConfirming && step === 'burn') {
    setStep('idle');
    alert('NFT burned successfully!');
    if (onSuccess) onSuccess();
  }

  if (!isOwner) {
    return (
      <div className="w-full max-w-2xl mx-auto bg-gray-800 rounded-xl p-6 shadow-2xl">
        <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
          <p className="text-yellow-400">
            ⚠️ You are not the owner of this position. Only the owner can remove liquidity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-gray-800 rounded-xl p-6 shadow-2xl">
      <h2 className="text-2xl font-bold mb-6 text-white">Remove Liquidity</h2>

      {/* Position Summary */}
      <div className="bg-gray-700 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-400">Position:</span>
          <span className="text-white font-semibold">
            {position.token0Symbol} / {position.token1Symbol}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Current Liquidity:</span>
          <span className="text-white font-mono">{position.liquidity.toString()}</span>
        </div>
      </div>

      {/* Remove Percentage Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Remove Percentage
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            min="1"
            max="100"
            value={removePercent}
            onChange={(e) => setRemovePercent(e.target.value)}
            className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isRemoving}
          />
          <span className="flex items-center text-white text-lg">%</span>
        </div>

        {/* Quick percentage buttons */}
        <div className="grid grid-cols-4 gap-2">
          {['25', '50', '75', '100'].map((percent) => (
            <button
              key={percent}
              onClick={() => setRemovePercent(percent)}
              disabled={isRemoving}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
            >
              {percent}%
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={handleDecreaseLiquidity}
          disabled={isRemoving || step !== 'idle' || position.liquidity === 0n}
          className="w-full px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {isDecreaseConfirming ? 'Confirming...' : 'Decrease Liquidity'}
        </button>

        <button
          onClick={handleCollect}
          disabled={step !== 'idle' || (position.tokensOwed0 === 0n && position.tokensOwed1 === 0n)}
          className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {isCollectConfirming ? 'Confirming...' : 'Collect Tokens'}
        </button>

        <button
          onClick={handleBurn}
          disabled={step !== 'idle' || position.liquidity > 0n}
          className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {isBurnConfirming ? 'Confirming...' : 'Burn NFT'}
        </button>
      </div>

      {/* Status Messages */}
      {step !== 'idle' && (
        <div className="mt-4 bg-blue-900/20 border border-blue-500 rounded-lg p-4">
          <p className="text-blue-400">
            {step === 'decrease' && '🔄 Decreasing liquidity...'}
            {step === 'collect' && '🔄 Collecting tokens...'}
            {step === 'burn' && '🔄 Burning NFT...'}
          </p>
        </div>
      )}

      {/* Uncollected Fees Display */}
      {(position.tokensOwed0 > 0n || position.tokensOwed1 > 0n) && (
        <div className="mt-6 bg-green-900/20 border border-green-500 rounded-lg p-4">
          <h4 className="text-green-400 font-semibold mb-2">💰 Uncollected Tokens</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">{position.token0Symbol}:</span>
              <span className="text-green-400 font-mono">
                {formatTokenAmount(position.tokensOwed0, position.token0Decimals || 18)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">{position.token1Symbol}:</span>
              <span className="text-green-400 font-mono">
                {formatTokenAmount(position.tokensOwed1, position.token1Decimals || 18)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 bg-gray-700 rounded-lg p-4 text-sm text-gray-300">
        <h4 className="font-semibold mb-2">ℹ️ How to Remove Liquidity:</h4>
        <ol className="list-decimal list-inside space-y-1">
          <li>Choose the percentage of liquidity to remove</li>
          <li>Click "Decrease Liquidity" and confirm the transaction</li>
          <li>Click "Collect Tokens" to withdraw your tokens</li>
          <li>Optional: Burn the NFT if all liquidity is removed</li>
        </ol>
      </div>
    </div>
  );
}

