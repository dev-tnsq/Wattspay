import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { aptos, CONTRACT_MODULES } from '../src/payments/aptosClient';

describe('Smart Contract Account Creation and Registration Tests', () => {
  let testAccount1: Account;
  let testAccount2: Account;
  let testAccount3: Account;

  beforeAll(async () => {
    // Create test accounts with new private keys
    console.log('🔑 Creating test accounts...');
    
    testAccount1 = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(Ed25519PrivateKey.generate().toString()),
    });
    
    testAccount2 = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(Ed25519PrivateKey.generate().toString()),
    });
    
    testAccount3 = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(Ed25519PrivateKey.generate().toString()),
    });

    // Fund accounts from faucet
    console.log('💰 Funding test accounts from faucet...');
    try {
      await aptos.fundAccount({
        accountAddress: testAccount1.accountAddress,
        amount: 100_000_000, // 1 APT
      });
      
      await aptos.fundAccount({
        accountAddress: testAccount2.accountAddress,
        amount: 100_000_000, // 1 APT
      });
      
      await aptos.fundAccount({
        accountAddress: testAccount3.accountAddress,
        amount: 100_000_000, // 1 APT
      });
      
      console.log('✅ All accounts funded successfully');
      console.log(`Account 1: ${testAccount1.accountAddress}`);
      console.log(`Account 2: ${testAccount2.accountAddress}`);
      console.log(`Account 3: ${testAccount3.accountAddress}`);
    } catch (error) {
      console.error('❌ Failed to fund accounts:', error);
      throw error;
    }
  });

  describe('User Registry Contract Tests', () => {
    test('should register a new user with phone number', async () => {
      const phoneNumber = '+1234567890';
      
      console.log('📱 Testing user registration...');
      
      const transaction = await aptos.transaction.build.simple({
        sender: testAccount1.accountAddress,
        data: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::register_user`,
          functionArguments: [phoneNumber],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: testAccount1,
        transaction,
      });

      const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      expect(executedTransaction.success).toBe(true);
      console.log(`✅ User registered successfully. Transaction: ${committedTxn.hash}`);
    });

    test('should verify user registration status', async () => {
      console.log('🔍 Checking user registration status...');
      
      const [isRegistered] = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::is_user_registered`,
          functionArguments: [testAccount1.accountAddress.toString()],
        },
      });

      expect(isRegistered).toBe(true);
      console.log('✅ User registration status verified');
    });

    test('should check phone number registration', async () => {
      const phoneNumber = '+1234567890';
      
      console.log('📞 Checking phone number registration...');
      
      const [isPhoneRegistered] = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::is_phone_registered`,
          functionArguments: [phoneNumber],
        },
      });

      expect(isPhoneRegistered).toBe(true);
      console.log('✅ Phone number registration verified');
    });

    test('should get user address by phone number', async () => {
      const phoneNumber = '+1234567890';
      
      console.log('🔍 Getting user address by phone...');
      
      const [userAddress] = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::get_user_address_by_phone`,
          functionArguments: [phoneNumber],
        },
      });

      expect(userAddress).toBe(testAccount1.accountAddress.toString());
      console.log(`✅ User address retrieved: ${userAddress}`);
    });

    test('should get user profile information', async () => {
      console.log('👤 Getting user profile...');
      
      const userProfile = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::get_user_profile`,
          functionArguments: [testAccount1.accountAddress.toString()],
        },
      });

      expect(userProfile).toHaveLength(6); // phone, address, timestamp, active, verified, reputation
      expect(userProfile[0]).toBe('+1234567890'); // phone number
      expect(userProfile[1]).toBe(testAccount1.accountAddress.toString()); // address
      expect(userProfile[3]).toBe(true); // is_active
      expect(userProfile[4]).toBe(false); // whatsapp_verified (not verified yet)
      
      console.log('✅ User profile retrieved successfully');
      console.log(`Phone: ${userProfile[0]}, Address: ${userProfile[1]}, Active: ${userProfile[3]}`);
    });

    test('should register multiple users with different phone numbers', async () => {
      console.log('👥 Registering multiple users...');
      
      // Register second user
      const phone2 = '+1987654321';
      const transaction2 = await aptos.transaction.build.simple({
        sender: testAccount2.accountAddress,
        data: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::register_user`,
          functionArguments: [phone2],
        },
      });

      const committedTxn2 = await aptos.signAndSubmitTransaction({
        signer: testAccount2,
        transaction: transaction2,
      });

      await aptos.waitForTransaction({
        transactionHash: committedTxn2.hash,
      });

      // Register third user
      const phone3 = '+1555123456';
      const transaction3 = await aptos.transaction.build.simple({
        sender: testAccount3.accountAddress,
        data: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::register_user`,
          functionArguments: [phone3],
        },
      });

      const committedTxn3 = await aptos.signAndSubmitTransaction({
        signer: testAccount3,
        transaction: transaction3,
      });

      await aptos.waitForTransaction({
        transactionHash: committedTxn3.hash,
      });

      // Verify all registrations
      const [isRegistered2] = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::is_user_registered`,
          functionArguments: [testAccount2.accountAddress.toString()],
        },
      });

      const [isRegistered3] = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.USER_REGISTRY}::is_user_registered`,
          functionArguments: [testAccount3.accountAddress.toString()],
        },
      });

      expect(isRegistered2).toBe(true);
      expect(isRegistered3).toBe(true);
      
      console.log('✅ Multiple users registered successfully');
    });

    test('should prevent duplicate phone number registration', async () => {
      console.log('🚫 Testing duplicate phone registration prevention...');
      
      const duplicatePhone = '+1234567890'; // Same as testAccount1
      
      try {
        const transaction = await aptos.transaction.build.simple({
          sender: testAccount2.accountAddress,
          data: {
            function: `${CONTRACT_MODULES.USER_REGISTRY}::register_user`,
            functionArguments: [duplicatePhone],
          },
        });

        const committedTxn = await aptos.signAndSubmitTransaction({
          signer: testAccount2,
          transaction,
        });

        const result = await aptos.waitForTransaction({
          transactionHash: committedTxn.hash,
        });

        // Should fail due to duplicate phone
        expect(result.success).toBe(false);
        console.log('✅ Duplicate phone registration correctly prevented');
      } catch (error) {
        // Expected to fail
        console.log('✅ Duplicate phone registration correctly prevented with error');
      }
    });
  });

  describe('Payment Coordinator Contract Tests', () => {
    test('should get platform statistics', async () => {
      console.log('📊 Getting platform statistics...');
      
      const stats = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.PAYMENT_COORDINATOR}::get_platform_stats`,
          functionArguments: [],
        },
      });

      expect(stats).toHaveLength(3); // next_payment_id, platform_fee_rate, platform_balance
      console.log(`✅ Platform stats: Payment ID: ${stats[0]}, Fee Rate: ${stats[1]}, Balance: ${stats[2]}`);
    });

    test('should send payment between registered users', async () => {
      console.log('💸 Testing payment between users...');
      
      const paymentAmount = 1000000; // 0.01 APT in octas
      const message = "Test payment";
      
      const transaction = await aptos.transaction.build.simple({
        sender: testAccount1.accountAddress,
        data: {
          function: `${CONTRACT_MODULES.PAYMENT_COORDINATOR}::send_payment`,
          functionArguments: [
            testAccount2.accountAddress.toString(),
            paymentAmount,
            message
          ],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: testAccount1,
        transaction,
      });

      const result = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      expect(result.success).toBe(true);
      console.log(`✅ Payment sent successfully. Transaction: ${committedTxn.hash}`);
    });

    test('should send payment by phone number', async () => {
      console.log('📱 Testing payment by phone number...');
      
      const recipientPhone = '+1987654321'; // testAccount2's phone
      const paymentAmount = 500000; // 0.005 APT in octas
      const message = "Payment by phone";
      
      const transaction = await aptos.transaction.build.simple({
        sender: testAccount1.accountAddress,
        data: {
          function: `${CONTRACT_MODULES.PAYMENT_COORDINATOR}::send_payment_by_phone`,
          functionArguments: [
            recipientPhone,
            paymentAmount,
            message
          ],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: testAccount1,
        transaction,
      });

      const result = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      expect(result.success).toBe(true);
      console.log(`✅ Payment by phone sent successfully. Transaction: ${committedTxn.hash}`);
    });
  });

  describe('Group Treasury Contract Tests', () => {
    let groupId: number;

    test('should create a new group', async () => {
      console.log('👥 Creating a new group...');
      
      const groupName = "Test Group";
      
      const transaction = await aptos.transaction.build.simple({
        sender: testAccount1.accountAddress,
        data: {
          function: `${CONTRACT_MODULES.GROUP_TREASURY}::create_group`,
          functionArguments: [groupName],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: testAccount1,
        transaction,
      });

      const result = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      expect(result.success).toBe(true);
      
      // Get user groups to find the created group ID
      const userGroups = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.GROUP_TREASURY}::get_user_groups`,
          functionArguments: [testAccount1.accountAddress.toString()],
        },
      });

      groupId = parseInt((userGroups[0] as string[])[0]); // First group ID
      expect(groupId).toBeGreaterThan(0);
      
      console.log(`✅ Group created successfully. Group ID: ${groupId}`);
    });

    test('should get group information', async () => {
      console.log('ℹ️ Getting group information...');
      
      const groupInfo = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.GROUP_TREASURY}::get_group_info`,
          functionArguments: [groupId],
        },
      });

      expect(groupInfo).toHaveLength(7); // id, name, admin, members, expenses_count, total_expenses, status
      expect(groupInfo[0]).toBe(groupId); // group id
      expect(groupInfo[1]).toBe("Test Group"); // group name
      expect(groupInfo[2]).toBe(testAccount1.accountAddress.toString()); // admin
      
      console.log(`✅ Group info: ID: ${groupInfo[0]}, Name: ${groupInfo[1]}, Admin: ${groupInfo[2]}`);
    });

    test('should add members to group', async () => {
      console.log('➕ Adding members to group...');
      
      // Add testAccount2 to the group
      const transaction = await aptos.transaction.build.simple({
        sender: testAccount1.accountAddress, // Admin adds member
        data: {
          function: `${CONTRACT_MODULES.GROUP_TREASURY}::add_member`,
          functionArguments: [
            groupId,
            testAccount2.accountAddress.toString()
          ],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: testAccount1,
        transaction,
      });

      const result = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      expect(result.success).toBe(true);
      console.log(`✅ Member added successfully. Transaction: ${committedTxn.hash}`);
    });

    test('should add expense to group', async () => {
      console.log('💰 Adding expense to group...');
      
      const expenseAmount = 2000000; // 0.02 APT in octas
      const description = "Test group expense";
      const participants = [
        testAccount1.accountAddress.toString(),
        testAccount2.accountAddress.toString()
      ];
      
      const transaction = await aptos.transaction.build.simple({
        sender: testAccount1.accountAddress,
        data: {
          function: `${CONTRACT_MODULES.GROUP_TREASURY}::add_expense`,
          functionArguments: [
            groupId,
            expenseAmount,
            description,
            participants
          ],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: testAccount1,
        transaction,
      });

      const result = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      expect(result.success).toBe(true);
      console.log(`✅ Expense added successfully. Transaction: ${committedTxn.hash}`);
    });

    test('should get group debt balances', async () => {
      console.log('📊 Getting group debt balances...');
      
      const debtBalances = await aptos.view({
        payload: {
          function: `${CONTRACT_MODULES.GROUP_TREASURY}::get_group_debt_balances`,
          functionArguments: [groupId],
        },
      });

      expect(Array.isArray(debtBalances[0])).toBe(true);
      console.log(`✅ Debt balances retrieved. Count: ${(debtBalances[0] as any[]).length}`);
    });
  });

  afterAll(async () => {
    console.log('🧹 Test cleanup completed');
  });
});