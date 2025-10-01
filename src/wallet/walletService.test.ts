import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provisionWallet, getWalletInfo, getWalletBalance } from './walletService';
import * as walletRepository from '../db/repositories/walletRepository';
import * as aptosClient from '../payments/aptosClient';
import { Account } from '@aptos-labs/ts-sdk';

// Mock dependencies
vi.mock('../db/repositories/walletRepository');
vi.mock('../payments/aptosClient');
vi.mock('../security/encryption');

const mockWalletRepository = vi.mocked(walletRepository);
const mockAptosClient = vi.mocked(aptosClient);

describe('WalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('provisionWallet', () => {
    it('should provision a new wallet for user', async () => {
      const userId = 'test-user-id';
      const mockWallet = {
        id: 'wallet-id',
        address: '0x123',
        publicKey: 'public-key',
        createdAt: new Date(),
        mnemonicBackupSentAt: null,
      };

      // Mock no existing wallet
      mockWalletRepository.findPrimaryWalletForUser.mockResolvedValue(null);
      mockWalletRepository.createWallet.mockResolvedValue(mockWallet as any);

      const result = await provisionWallet(userId);

      expect(result).toMatchObject({
        id: 'wallet-id',
        address: '0x123',
        publicKey: 'public-key',
        mnemonicBackupSentAt: null,
      });
      expect(mockWalletRepository.createWallet).toHaveBeenCalledOnce();
    });

    it('should return existing wallet if user already has one', async () => {
      const userId = 'test-user-id';
      const existingWallet = {
        id: 'existing-wallet-id',
        address: '0x456',
        publicKey: 'existing-public-key',
        createdAt: new Date(),
        mnemonicBackupSentAt: null,
      };

      mockWalletRepository.findPrimaryWalletForUser.mockResolvedValue(existingWallet as any);

      const result = await provisionWallet(userId);

      expect(result).toMatchObject({
        id: 'existing-wallet-id',
        address: '0x456',
        publicKey: 'existing-public-key',
      });
      expect(mockWalletRepository.createWallet).not.toHaveBeenCalled();
    });
  });

  describe('getWalletBalance', () => {
    it('should retrieve wallet balance from Aptos network', async () => {
      const userId = 'test-user-id';
      const mockWallet = {
        id: 'wallet-id',
        address: '0x123',
        publicKey: 'public-key',
      };

      mockWalletRepository.findPrimaryWalletForUser.mockResolvedValue(mockWallet as any);
      mockAptosClient.aptos.getAccountAPTAmount = vi.fn().mockResolvedValue(BigInt(100_000_000)); // 1 APT

      const result = await getWalletBalance(userId);

      expect(result).toEqual({
        address: '0x123',
        balanceOctas: '100000000',
        balanceApt: 1,
      });
    });

    it('should throw NotFoundError when wallet does not exist', async () => {
      const userId = 'test-user-id';

      mockWalletRepository.findPrimaryWalletForUser.mockResolvedValue(null);

      await expect(getWalletBalance(userId)).rejects.toThrow('No wallet found for user');
    });
  });

  describe('getWalletInfo', () => {
    it('should return wallet information', async () => {
      const userId = 'test-user-id';
      const mockWallet = {
        id: 'wallet-id',
        address: '0x123',
        publicKey: 'public-key',
        createdAt: new Date('2024-01-01'),
        mnemonicBackupSentAt: null,
      };

      mockWalletRepository.findPrimaryWalletForUser.mockResolvedValue(mockWallet as any);

      const result = await getWalletInfo(userId);

      expect(result).toEqual({
        id: 'wallet-id',
        address: '0x123',
        publicKey: 'public-key',
        createdAt: new Date('2024-01-01'),
        mnemonicBackupSentAt: null,
      });
    });
  });
});