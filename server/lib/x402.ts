import { recoverTypedDataAddress } from "viem";
import { verify, settle } from "x402/facilitator";
import { publicClient, combinedClient, chain } from "../config/blockchain.js";
import { network } from "../config/env.js";
import { generatePaymentRequirements } from "./helpers.js";
import { log } from "./logger.js";

/**
 * Verify x402 payment using facilitator
 */
export async function verifyX402Payment(
  paymentHeader: string, 
  tokenAddress: string,
  expectedAmount: bigint,
  quantity: number,
  req: any
): Promise<{ valid: boolean; payer?: string; amount?: bigint; error?: string }> {
  try {
    const paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    
    log.debug(`🔐 Payment payload value: ${paymentPayload.value}, expected: ${expectedAmount.toString()}`);
    
    const pricePerMint = Number(expectedAmount) / (1e6 * quantity);
    const totalPrice = pricePerMint * quantity;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const paymentRequirements = generatePaymentRequirements(
      tokenAddress,
      quantity,
      totalPrice,
      expectedAmount,
      baseUrl
    );
    
    log.verify('Verifying x402 payment via facilitator');
    log.debug('📋 Payment requirements:', JSON.stringify({
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      resource: paymentRequirements.resource,
      payTo: paymentRequirements.payTo,
      asset: paymentRequirements.asset,
      maxAmountRequired: paymentRequirements.maxAmountRequired
    }, null, 2));
    
    const verifyResult = await verify(
      publicClient as any,
      paymentPayload,
      paymentRequirements
    );
    
    log.debug('Verify result:', {
      isValid: verifyResult.isValid,
      invalidReason: verifyResult.invalidReason,
      payer: verifyResult.payer
    });
    
    if (verifyResult.isValid) {
      return {
        valid: true,
        payer: verifyResult.payer || paymentPayload.from as string,
        amount: BigInt(paymentPayload.value || expectedAmount),
      };
    } else {
      // Debug: Try to recover signer address
      try {
        const auth = paymentPayload.payload?.authorization;
        if (auth && paymentPayload.payload?.signature) {
          const normMsg = {
            from: auth.from,
            to: auth.to,
            value: BigInt(auth.value),
            validAfter: BigInt(auth.validAfter),
            validBefore: BigInt(auth.validBefore),
            nonce: auth.nonce as `0x${string}`,
          };
          
          const usdcAddress = network === 'base-sepolia' 
            ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
            : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
          
          const usdcName = network === 'base-sepolia' ? 'USDC' : 'USD Coin';
          
          const domain = {
            name: usdcName,
            version: '2',
            chainId: chain.id,
            verifyingContract: usdcAddress,
          };
          
          const types = {
            TransferWithAuthorization: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' },
            ],
          };
          
          await recoverTypedDataAddress({
            domain,
            types,
            primaryType: 'TransferWithAuthorization',
            message: normMsg,
            signature: paymentPayload.payload.signature as `0x${string}`,
          });
        }
      } catch (recoverError: any) {
        // Signature recovery failed
      }
      
      return { 
        valid: false, 
        error: verifyResult.invalidReason || "Payment verification failed" 
      };
    }
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Settle x402 payment through facilitator
 */
export async function settleX402Payment(
  paymentHeader: string,
  tokenAddress: string,
  expectedAmount: bigint,
  quantity: number,
  req: any
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    
    log.payment('Settling x402 payment via facilitator');
    
    const pricePerMint = Number(expectedAmount) / (1e6 * quantity);
    const totalPrice = pricePerMint * quantity;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const paymentRequirements = generatePaymentRequirements(
      tokenAddress,
      quantity,
      totalPrice,
      expectedAmount,
      baseUrl
    );

    log.debug('📋 Settle payment requirements:', JSON.stringify({
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      resource: paymentRequirements.resource,
      payTo: paymentRequirements.payTo,
      asset: paymentRequirements.asset,
      maxAmountRequired: paymentRequirements.maxAmountRequired
    }, null, 2));
    
    const settleResult = await settle(
      combinedClient,
      paymentPayload,
      paymentRequirements
    );

    log.debug('Facilitator settle result:', {
      success: settleResult.success,
      errorReason: settleResult.errorReason,
      transaction: settleResult.transaction,
      network: settleResult.network
    });

    if (settleResult.success) {
      log.success('Payment settled via facilitator');
      return {
        success: true,
        txHash: settleResult.transaction,
      };
    } else {
      log.failure('Facilitator settlement failed:', settleResult.errorReason);
      return {
        success: false,
        error: settleResult.errorReason || "Payment settlement failed via facilitator",
      };
    }
  } catch (error: any) {
    log.error('Settlement error:', error);
    return { success: false, error: error.message };
  }
}

