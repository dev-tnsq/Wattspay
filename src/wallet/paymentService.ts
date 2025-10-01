import { Account, Ed25519PrivateKey, AnyNumber } from '@aptos-labs/ts-sdk';
import { aptos } from '../payments/aptosClient';
import { 
  findPrimaryWalletForUser, 
  findWalletByAddress 
} from '../db/repositories/walletRepository';
import { 
  createTransaction, 
  updateTransactionStatus 
} from '../db/repositories/transactionRepository';
import { decryptString, EncryptedPayload } from '../security/encryption';
import { logger } from '../utils/logger';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { TransactionStatus } from '@prisma/client';

export interface PaymentRequest {
  fromUserId: string;
  toAddress: string;
  amountApt: number;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  transactionId: string;
  aptosHash: string;
  fromAddress: string;
  toAddress: string;
  amountOctas: string;
  amountApt: number;
  status: TransactionStatus;
}

/**
 * Sends APT from one user's wallet to a recipient address.
 * Handles the full transaction lifecycle including signing and submission.
 */
export const sendPayment = async (request: PaymentRequest): Promise<PaymentResult> => {
  const { fromUserId, toAddress, amountApt, metadata } = request;
  
  try {
    logger.info('Initiating payment', { 
      fromUserId, 
      toAddress, 
      amountApt 
    });

    // Validate amount
    if (amountApt <= 0) {
      throw new ValidationError('Payment amount must be positive');
    }

    // Get sender's wallet
    const senderWallet = await findPrimaryWalletForUser(fromUserId);
    if (!senderWallet) {
      throw new NotFoundError('Sender wallet not found');
    }

    // Get recipient wallet (optional - they might not be in our system)
    const recipientWallet = await findWalletByAddress(toAddress);

    // Convert APT to octas (1 APT = 100,000,000 octas)
    const amountOctas = Math.floor(amountApt * 100_000_000);

    // Create pending transaction record
    const transactionData: any = {
      sender: { connect: { id: senderWallet.id } },
      amountOctas,
      status: TransactionStatus.PENDING,
      metadata: metadata || {},
    };

    // Connect recipient wallet if they exist in our system, otherwise store address
    if (recipientWallet) {
      transactionData.recipient = { connect: { id: recipientWallet.id } };
    } else {
      transactionData.recipientAddress = toAddress;
    }

    const transaction = await createTransaction(transactionData);

    logger.debug('Transaction record created', { 
      transactionId: transaction.id,
      fromUserId,
      senderWalletId: senderWallet.id,
      recipientWalletId: recipientWallet?.id
    });

    try {
      // Decrypt sender's private key
      const encryptedPayload: EncryptedPayload = {
        cipherText: senderWallet.encryptedPrivateKey,
        iv: senderWallet.encryptionIv,
        authTag: senderWallet.encryptionAuthTag,
      };
      
      const privateKeyHex = decryptString(encryptedPayload);
      const privateKey = new Ed25519PrivateKey(privateKeyHex);
      const senderAccount = Account.fromPrivateKey({ privateKey });

      // Check sender's balance
      const senderBalance = await aptos.getAccountAPTAmount({ 
        accountAddress: senderWallet.address 
      });
      
      if (Number(senderBalance) < amountOctas) {
        throw new ValidationError('Insufficient balance for transaction');
      }

      // Build and submit transaction
      const transferTxn = await aptos.transferCoinTransaction({
        sender: senderAccount.accountAddress,
        recipient: toAddress,
        amount: amountOctas,
      });

      const pendingTxn = await aptos.signAndSubmitTransaction({
        signer: senderAccount,
        transaction: transferTxn,
      });

      logger.info('Transaction submitted to network', { 
        transactionId: transaction.id,
        aptosHash: pendingTxn.hash,
        fromAddress: senderWallet.address,
        toAddress
      });

      // Update transaction with Aptos hash
      await updateTransactionStatus(transaction.id, {
        status: TransactionStatus.PENDING,
        aptosHash: pendingTxn.hash,
        confirmedAt: null,
      });

      // Wait for transaction confirmation
      const confirmedTxn = await aptos.waitForTransaction({
        transactionHash: pendingTxn.hash,
      });

      // Update transaction status based on result
      const finalStatus = confirmedTxn.success 
        ? TransactionStatus.CONFIRMED 
        : TransactionStatus.FAILED;

      await updateTransactionStatus(transaction.id, {
        status: finalStatus,
        aptosHash: pendingTxn.hash,
        confirmedAt: finalStatus === TransactionStatus.CONFIRMED ? new Date() : null,
      });

      logger.info('Payment completed successfully', { 
        transactionId: transaction.id,
        aptosHash: pendingTxn.hash,
        status: finalStatus,
        fromUserId,
        amountApt
      });

      return {
        transactionId: transaction.id,
        aptosHash: pendingTxn.hash,
        fromAddress: senderWallet.address,
        toAddress,
        amountOctas: amountOctas.toString(),
        amountApt,
        status: finalStatus,
      };

    } catch (txnError) {
      // Mark transaction as failed
      await updateTransactionStatus(transaction.id, {
        status: TransactionStatus.FAILED,
        aptosHash: null,
        confirmedAt: null,
      });

      logger.error('Transaction execution failed', { 
        transactionId: transaction.id,
        fromUserId,
        error: txnError
      });

      throw new AppError('Transaction execution failed', { 
        code: 'TRANSACTION_EXECUTION_FAILED', 
        cause: txnError 
      });
    }

  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    logger.error('Payment failed', { fromUserId, toAddress, amountApt, error });
    throw new AppError('Payment processing failed', { 
      code: 'PAYMENT_FAILED', 
      cause: error 
    });
  }
};

/**
 * Estimates the gas cost for a payment transaction.
 */
export const estimatePaymentGas = async (
  fromUserId: string, 
  toAddress: string, 
  amountApt: number
): Promise<{ gasUnitsUsed: string; gasFee: string; gasFeePricePerUnit: string }> => {
  try {
    logger.debug('Estimating payment gas', { fromUserId, toAddress, amountApt });

    const senderWallet = await findPrimaryWalletForUser(fromUserId);
    if (!senderWallet) {
      throw new NotFoundError('Sender wallet not found');
    }

    const amountOctas = Math.floor(amountApt * 100_000_000);

    // Build transaction for simulation
    const transferTxn = await aptos.transferCoinTransaction({
      sender: senderWallet.address,
      recipient: toAddress,
      amount: amountOctas,
    });

    // For now, return estimated values based on typical APT transfer costs
    // In production, you might want to use the actual simulation API
    const estimatedGasUnits = '2000'; // Typical gas units for APT transfer
    const gasPrice = '100'; // Default gas price in octas
    const estimatedFee = (Number(estimatedGasUnits) * Number(gasPrice)).toString();
    
    logger.debug('Gas estimation completed', { 
      fromUserId,
      gasUnitsUsed: estimatedGasUnits,
      gasFee: estimatedFee,
    });

    return {
      gasUnitsUsed: estimatedGasUnits,
      gasFee: estimatedFee,
      gasFeePricePerUnit: gasPrice,
    };

  } catch (error) {
    logger.error('Gas estimation failed', { fromUserId, toAddress, amountApt, error });
    throw new AppError('Failed to estimate gas cost', { 
      code: 'GAS_ESTIMATION_FAILED', 
      cause: error 
    });
  }
};

/**
 * Validates if an address is a valid Aptos address format.
 */
export const validateAptosAddress = (address: string): boolean => {
  try {
    // Basic validation - Aptos addresses should be 64-character hex strings (with or without 0x prefix)
    const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
    return /^[a-fA-F0-9]{64}$/.test(cleanAddress) || /^[a-fA-F0-9]{1,64}$/.test(cleanAddress);
  } catch (error) {
    return false;
  }
};

/**
 * Formats an amount from octas to APT with proper decimal handling.
 */
export const formatOctasToApt = (octas: string | number): number => {
  const octasNum = typeof octas === 'string' ? Number(octas) : octas;
  return octasNum / 100_000_000;
};

/**
 * Formats an amount from APT to octas.
 */
export const formatAptToOctas = (apt: number): string => {
  return Math.floor(apt * 100_000_000).toString();
};