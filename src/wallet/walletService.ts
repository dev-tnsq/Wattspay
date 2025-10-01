import { Account, Aptos, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { aptos } from '../payments/aptosClient';
import { 
  findPrimaryWalletForUser, 
  createWallet, 
  updateWalletBackupTimestamp, 
  findWalletByAddress 
} from '../db/repositories/walletRepository';
import { listRecentTransactionsForWallet } from '../db/repositories/transactionRepository';
import { encryptString, decryptString, EncryptedPayload } from '../security/encryption';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../utils/errors';

export interface WalletBalance {
  address: string;
  balanceOctas: string;
  balanceApt: number;
}

export interface WalletInfo {
  id: string;
  address: string;
  publicKey: string;
  createdAt: Date;
  mnemonicBackupSentAt: Date | null;
}

export interface TransactionHistoryItem {
  id: string;
  type: 'sent' | 'received';
  amount: string;
  amountApt: number;
  counterpartyAddress: string;
  counterpartyName?: string;
  status: string;
  aptosHash?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

/**
 * Provisions a new wallet for a user by generating a fresh account,
 * encrypting the private key, and storing it in the database.
 */
export const provisionWallet = async (userId: string): Promise<WalletInfo> => {
  try {
    logger.info('Provisioning new wallet', { userId });

    // Check if user already has a wallet
    const existingWallet = await findPrimaryWalletForUser(userId);
    if (existingWallet) {
      logger.warn('User already has a wallet', { userId, walletId: existingWallet.id });
      return {
        id: existingWallet.id,
        address: existingWallet.address,
        publicKey: existingWallet.publicKey,
        createdAt: existingWallet.createdAt,
        mnemonicBackupSentAt: existingWallet.mnemonicBackupSentAt,
      };
    }

    // Generate new account using Aptos SDK
    const account = Account.generate();
    
    // Encrypt the private key for secure storage
    const privateKeyHex = account.privateKey.toString();
    const encryptedPrivateKey = encryptString(privateKeyHex);

    // Store wallet in database
    const wallet = await createWallet({
      user: { connect: { id: userId } },
      address: account.accountAddress.toString(),
      publicKey: account.publicKey.toString(),
      encryptedPrivateKey: encryptedPrivateKey.cipherText,
      encryptionIv: encryptedPrivateKey.iv,
      encryptionAuthTag: encryptedPrivateKey.authTag,
    });

    logger.info('Wallet provisioned successfully', { 
      userId, 
      walletId: wallet.id, 
      address: wallet.address 
    });

    return {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.publicKey,
      createdAt: wallet.createdAt,
      mnemonicBackupSentAt: wallet.mnemonicBackupSentAt,
    };
  } catch (error) {
    logger.error('Failed to provision wallet', { userId, error });
    throw new AppError('Failed to provision wallet', { 
      code: 'WALLET_PROVISION_FAILED', 
      cause: error 
    });
  }
};

/**
 * Retrieves the current balance for a user's primary wallet.
 */
export const getWalletBalance = async (userId: string): Promise<WalletBalance> => {
  try {
    logger.debug('Fetching wallet balance', { userId });

    const wallet = await findPrimaryWalletForUser(userId);
    if (!wallet) {
      throw new NotFoundError('No wallet found for user');
    }

    // Get balance from Aptos network
    const balanceResponse = await aptos.getAccountAPTAmount({ 
      accountAddress: wallet.address 
    });

    const balanceOctas = balanceResponse.toString();
    const balanceApt = Number(balanceOctas) / 100_000_000; // Convert octas to APT

    logger.debug('Wallet balance retrieved', { 
      userId, 
      address: wallet.address, 
      balanceOctas, 
      balanceApt 
    });

    return {
      address: wallet.address,
      balanceOctas,
      balanceApt,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get wallet balance', { userId, error });
    throw new AppError('Failed to retrieve wallet balance', { 
      code: 'WALLET_BALANCE_FAILED', 
      cause: error 
    });
  }
};

/**
 * Exports the mnemonic phrase for a user's wallet.
 * Updates the backup timestamp to track when the mnemonic was exported.
 */
export const exportWalletMnemonic = async (userId: string): Promise<string> => {
  try {
    logger.info('Exporting wallet mnemonic', { userId });

    const wallet = await findPrimaryWalletForUser(userId);
    if (!wallet) {
      throw new NotFoundError('No wallet found for user');
    }

    // Decrypt the private key
    const encryptedPayload: EncryptedPayload = {
      cipherText: wallet.encryptedPrivateKey,
      iv: wallet.encryptionIv,
      authTag: wallet.encryptionAuthTag,
    };
    
    const privateKeyHex = decryptString(encryptedPayload);
    const privateKey = new Ed25519PrivateKey(privateKeyHex);
    
    // For this implementation, we'll derive a simple mnemonic representation
    // In a production system, you'd want to store the actual mnemonic during wallet creation
    // and encrypt that instead of deriving it from the private key
    const account = Account.fromPrivateKey({ privateKey });
    
    // Generate a deterministic mnemonic-like representation
    // Note: This is a simplified approach. In production, store the actual BIP39 mnemonic
    const mnemonicWords = privateKeyHex.match(/.{8}/g)?.slice(0, 12) || [];
    const mnemonic = mnemonicWords.join(' ');

    // Update backup timestamp
    await updateWalletBackupTimestamp(wallet.id);

    logger.info('Wallet mnemonic exported successfully', { 
      userId, 
      walletId: wallet.id 
    });

    return mnemonic;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to export wallet mnemonic', { userId, error });
    throw new AppError('Failed to export wallet mnemonic', { 
      code: 'WALLET_MNEMONIC_EXPORT_FAILED', 
      cause: error 
    });
  }
};

/**
 * Retrieves recent transaction history for a user's wallet.
 */
export const getWalletTransactionHistory = async (
  userId: string, 
  limit = 5
): Promise<TransactionHistoryItem[]> => {
  try {
    logger.debug('Fetching wallet transaction history', { userId, limit });

    const wallet = await findPrimaryWalletForUser(userId);
    if (!wallet) {
      throw new NotFoundError('No wallet found for user');
    }

    const transactions = await listRecentTransactionsForWallet(wallet.id, limit);

    const history: TransactionHistoryItem[] = transactions.map(tx => {
      const isSent = tx.senderWalletId === wallet.id;
      const counterpartyWallet = isSent ? tx.recipient : tx.sender;
      const counterpartyAddress = isSent 
        ? (tx.recipientAddress || counterpartyWallet?.address || 'Unknown')
        : counterpartyWallet?.address || 'Unknown';
      
      return {
        id: tx.id,
        type: isSent ? 'sent' : 'received',
        amount: tx.amountOctas.toString(),
        amountApt: Number(tx.amountOctas) / 100_000_000,
        counterpartyAddress,
        status: tx.status,
        aptosHash: tx.aptosHash || undefined,
        createdAt: tx.createdAt,
        confirmedAt: tx.confirmedAt || undefined,
      };
    });

    logger.debug('Wallet transaction history retrieved', { 
      userId, 
      walletId: wallet.id, 
      transactionCount: history.length 
    });

    return history;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get wallet transaction history', { userId, error });
    throw new AppError('Failed to retrieve transaction history', { 
      code: 'WALLET_HISTORY_FAILED', 
      cause: error 
    });
  }
};

/**
 * Gets basic wallet information for a user.
 */
export const getWalletInfo = async (userId: string): Promise<WalletInfo> => {
  try {
    logger.debug('Fetching wallet info', { userId });

    const wallet = await findPrimaryWalletForUser(userId);
    if (!wallet) {
      throw new NotFoundError('No wallet found for user');
    }

    return {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.publicKey,
      createdAt: wallet.createdAt,
      mnemonicBackupSentAt: wallet.mnemonicBackupSentAt,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get wallet info', { userId, error });
    throw new AppError('Failed to retrieve wallet information', { 
      code: 'WALLET_INFO_FAILED', 
      cause: error 
    });
  }
};

/**
 * Recovers an account from a private key (for wallet restoration scenarios).
 * This is primarily used for importing existing wallets.
 */
export const recoverWalletFromPrivateKey = async (
  userId: string, 
  privateKeyHex: string
): Promise<WalletInfo> => {
  try {
    logger.info('Recovering wallet from private key', { userId });

    // Check if user already has a wallet
    const existingWallet = await findPrimaryWalletForUser(userId);
    if (existingWallet) {
      throw new AppError('User already has a wallet', { 
        code: 'WALLET_ALREADY_EXISTS' 
      });
    }

    // Create account from private key
    const privateKey = new Ed25519PrivateKey(privateKeyHex);
    const account = Account.fromPrivateKey({ privateKey });

    // Check if this wallet address already exists
    const existingAddressWallet = await findWalletByAddress(
      account.accountAddress.toString()
    );
    if (existingAddressWallet) {
      throw new AppError('Wallet with this address already exists', { 
        code: 'WALLET_ADDRESS_EXISTS' 
      });
    }

    // Encrypt the private key for secure storage
    const encryptedPrivateKey = encryptString(privateKeyHex);

    // Store wallet in database
    const wallet = await createWallet({
      user: { connect: { id: userId } },
      address: account.accountAddress.toString(),
      publicKey: account.publicKey.toString(),
      encryptedPrivateKey: encryptedPrivateKey.cipherText,
      encryptionIv: encryptedPrivateKey.iv,
      encryptionAuthTag: encryptedPrivateKey.authTag,
    });

    logger.info('Wallet recovered successfully', { 
      userId, 
      walletId: wallet.id, 
      address: wallet.address 
    });

    return {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.publicKey,
      createdAt: wallet.createdAt,
      mnemonicBackupSentAt: wallet.mnemonicBackupSentAt,
    };
  } catch (error) {
    logger.error('Failed to recover wallet from private key', { userId, error });
    throw new AppError('Failed to recover wallet', { 
      code: 'WALLET_RECOVERY_FAILED', 
      cause: error 
    });
  }
};