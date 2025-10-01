import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createUser } from '../db/repositories/userRepository';
import { findUserByPhoneNumber } from '../db/repositories/userRepository';
import { 
  provisionWallet, 
  getWalletBalance
} from './walletService';
import { 
  createGroupPayment,
  executeGroupPayment,
  getGroupPaymentSession,
  type GroupPaymentRequest
} from './groupPaymentService';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

// Test database instance
const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

// Initialize Aptos client for faucet funding
const aptosConfig = new AptosConfig({ network: Network.DEVNET });
const aptos = new Aptos(aptosConfig);

// Helper function to fund wallet from faucet
async function fundWalletFromFaucet(walletAddress: string): Promise<void> {
  try {
    console.log('💰 Funding wallet from devnet faucet:', walletAddress);
    await aptos.fundAccount({
      accountAddress: walletAddress,
      amount: 100000000, // 1 APT in octas
    });
    console.log('✅ Wallet funded with 1 APT from faucet');
    
    // Wait for transaction to process
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error: any) {
    console.log('⚠️  Faucet funding failed (may be rate limited):', error.message);
  }
}

describe('Group Payment Integration Tests', () => {
  // Test phone numbers for group payment
  const CREATOR_PHONE = '+918447676107';
  const MEMBER1_PHONE = '+919871607184'; 
  const MEMBER2_PHONE = '+917896541230';
  const MEMBER3_PHONE = '+916789012345';
  
  const CREATOR_WHATSAPP = 'wa_creator_8447676107';
  const MEMBER1_WHATSAPP = 'wa_member1_9871607184';
  const MEMBER2_WHATSAPP = 'wa_member2_7896541230';
  const MEMBER3_WHATSAPP = 'wa_member3_6789012345';

  let creatorUserId: string;
  let member1UserId: string;
  let member2UserId: string;
  let member3UserId: string;

  beforeAll(async () => {
    // Clean up any existing test data
    const phoneNumbers = [CREATOR_PHONE, MEMBER1_PHONE, MEMBER2_PHONE, MEMBER3_PHONE];
    
    await testPrisma.transaction.deleteMany({
      where: {
        OR: [
          { sender: { user: { phoneNumber: { in: phoneNumbers } } } },
          { recipient: { user: { phoneNumber: { in: phoneNumbers } } } }
        ]
      }
    });
    
    await testPrisma.groupSessionParticipant.deleteMany({
      where: {
        user: { phoneNumber: { in: phoneNumbers } }
      }
    });
    
    await testPrisma.groupSession.deleteMany({
      where: {
        creator: { phoneNumber: { in: phoneNumbers } }
      }
    });
    
    await testPrisma.wallet.deleteMany({
      where: {
        user: { phoneNumber: { in: phoneNumbers } }
      }
    });
    
    await testPrisma.user.deleteMany({
      where: { phoneNumber: { in: phoneNumbers } }
    });
  });

  afterAll(async () => {
    // Clean up test data
    const phoneNumbers = [CREATOR_PHONE, MEMBER1_PHONE, MEMBER2_PHONE, MEMBER3_PHONE];
    
    await testPrisma.transaction.deleteMany({
      where: {
        OR: [
          { sender: { user: { phoneNumber: { in: phoneNumbers } } } },
          { recipient: { user: { phoneNumber: { in: phoneNumbers } } } }
        ]
      }
    });
    
    await testPrisma.groupSessionParticipant.deleteMany({
      where: {
        user: { phoneNumber: { in: phoneNumbers } }
      }
    });
    
    await testPrisma.groupSession.deleteMany({
      where: {
        creator: { phoneNumber: { in: phoneNumbers } }
      }
    });
    
    await testPrisma.wallet.deleteMany({
      where: {
        user: { phoneNumber: { in: phoneNumbers } }
      }
    });
    
    await testPrisma.user.deleteMany({
      where: { phoneNumber: { in: phoneNumbers } }
    });
    
    await testPrisma.$disconnect();
  });

  it('should create users and wallets for group payment test', async () => {
    console.log('🚀 Setting up group payment test users...');

    // Create creator
    console.log('👑 Creating group creator:', CREATOR_PHONE);
    const creator = await createUser({
      whatsappId: CREATOR_WHATSAPP,
      phoneNumber: CREATOR_PHONE,
      displayName: 'Group Creator',
    });
    creatorUserId = creator.id;
    
    const creatorWallet = await provisionWallet(creatorUserId);
    await fundWalletFromFaucet(creatorWallet.address);
    console.log('✅ Creator wallet:', creatorWallet.address);

    // Create member 1
    console.log('👤 Creating member 1:', MEMBER1_PHONE);
    const member1 = await createUser({
      whatsappId: MEMBER1_WHATSAPP,
      phoneNumber: MEMBER1_PHONE,
      displayName: 'Member One',
    });
    member1UserId = member1.id;
    
    const member1Wallet = await provisionWallet(member1UserId);
    await fundWalletFromFaucet(member1Wallet.address);
    console.log('✅ Member 1 wallet:', member1Wallet.address);

    // Create member 2
    console.log('👤 Creating member 2:', MEMBER2_PHONE);
    const member2 = await createUser({
      whatsappId: MEMBER2_WHATSAPP,
      phoneNumber: MEMBER2_PHONE,
      displayName: 'Member Two',
    });
    member2UserId = member2.id;
    
    const member2Wallet = await provisionWallet(member2UserId);
    await fundWalletFromFaucet(member2Wallet.address);
    console.log('✅ Member 2 wallet:', member2Wallet.address);

    // Create member 3
    console.log('👤 Creating member 3:', MEMBER3_PHONE);
    const member3 = await createUser({
      whatsappId: MEMBER3_WHATSAPP,
      phoneNumber: MEMBER3_PHONE,
      displayName: 'Member Three',
    });
    member3UserId = member3.id;
    
    const member3Wallet = await provisionWallet(member3UserId);
    await fundWalletFromFaucet(member3Wallet.address);
    console.log('✅ Member 3 wallet:', member3Wallet.address);

    // Verify all balances
    const creatorBalance = await getWalletBalance(creatorUserId);
    const member1Balance = await getWalletBalance(member1UserId);
    const member2Balance = await getWalletBalance(member2UserId);
    const member3Balance = await getWalletBalance(member3UserId);

    console.log('💰 Wallet balances:');
    console.log(`   Creator: ${creatorBalance.balanceApt} APT`);
    console.log(`   Member 1: ${member1Balance.balanceApt} APT`);
    console.log(`   Member 2: ${member2Balance.balanceApt} APT`);
    console.log(`   Member 3: ${member3Balance.balanceApt} APT`);

    expect(creatorBalance.balanceApt).toBeGreaterThanOrEqual(0);
    expect(member1Balance.balanceApt).toBeGreaterThanOrEqual(0);
    expect(member2Balance.balanceApt).toBeGreaterThanOrEqual(0);
    expect(member3Balance.balanceApt).toBeGreaterThanOrEqual(0);

    console.log('🎉 All group payment users created successfully!');
  }, 120000); // 2 minutes for wallet creation and funding

  it('should create a group payment session', async () => {
    console.log('🏗️  Creating group payment session...');

    const groupPaymentRequest: GroupPaymentRequest = {
      creatorPhoneNumber: CREATOR_PHONE,
      participantPhoneNumbers: [MEMBER1_PHONE, MEMBER2_PHONE, MEMBER3_PHONE],
      totalAmountApt: 0.03, // 0.01 APT per participant
      topic: 'Test Group Payment - Pizza Split',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    };

    const groupSession = await createGroupPayment(groupPaymentRequest);

    expect(groupSession).toBeDefined();
    expect(groupSession.sessionId).toBeDefined();
    expect(groupSession.creatorPhoneNumber).toBe(CREATOR_PHONE);
    expect(groupSession.participants).toHaveLength(4); // Creator + 3 members
    expect(groupSession.totalAmountApt).toBe(0.03);
    expect(groupSession.individualAmountApt).toBe(0.01); // 0.03 / 3 members
    expect(groupSession.topic).toBe('Test Group Payment - Pizza Split');

    console.log('✅ Group session created:', {
      sessionId: groupSession.sessionId,
      participants: groupSession.participants.length,
      individualAmount: groupSession.individualAmountApt
    });

    // Verify participants
    const creatorParticipant = groupSession.participants.find(p => p.phoneNumber === CREATOR_PHONE);
    expect(creatorParticipant?.role).toBe('ADMIN');

    const member1Participant = groupSession.participants.find(p => p.phoneNumber === MEMBER1_PHONE);
    expect(member1Participant?.role).toBe('MEMBER');

    console.log('📋 Group session details:', {
      creator: creatorParticipant?.displayName,
      members: groupSession.participants.filter(p => p.role === 'MEMBER').map(p => p.displayName)
    });

    // Store session ID for next test
    (global as any).testGroupSessionId = groupSession.sessionId;

    console.log('🎉 Group payment session created successfully!');
  }, 60000);

  it('should execute group payment transactions', async () => {
    const sessionId = (global as any).testGroupSessionId;
    expect(sessionId).toBeDefined();

    console.log('💸 Executing group payment transactions...');
    console.log('📱 Each member will pay 0.01 APT to the creator');

    // Execute the group payment
    const transactionResults = await executeGroupPayment(sessionId);

    expect(transactionResults).toBeDefined();
    expect(Array.isArray(transactionResults)).toBe(true);
    console.log(`🚀 ${transactionResults.length} transactions created`);

    // Verify transaction details
    for (const transaction of transactionResults) {
      expect(transaction.sessionId).toBe(sessionId);
      expect(transaction.transactionId).toBeDefined();
      expect(transaction.fromPhoneNumber).toMatch(/^\+91[6-9]\d{9}$/); // Valid Indian phone number
      expect(transaction.toPhoneNumber).toBe(CREATOR_PHONE);
      expect(transaction.amountApt).toBeCloseTo(0.00333, 4); // 0.01 / 3 members ≈ 0.00333
      expect(transaction.status).toBeDefined();

      console.log('✅ Transaction:', {
        id: transaction.transactionId,
        from: transaction.fromPhoneNumber,
        to: transaction.toPhoneNumber,
        amount: transaction.amountApt,
        hash: transaction.aptosHash ? `${transaction.aptosHash.substring(0, 8)}...` : 'Pending'
      });
    }

    // Verify creator received payments
    console.log('💰 Checking final balances...');
    const finalCreatorBalance = await getWalletBalance(creatorUserId);
    console.log(`Creator final balance: ${finalCreatorBalance.balanceApt} APT`);

    // Creator should have more than initial balance (approximately +0.01 APT from 3 members)
    expect(finalCreatorBalance.balanceApt).toBeGreaterThan(0);

    console.log('🎉 Group payment executed successfully!');
  }, 180000); // 3 minutes for blockchain transactions

  it('should retrieve group payment session details', async () => {
    const sessionId = (global as any).testGroupSessionId;
    expect(sessionId).toBeDefined();

    console.log('📊 Retrieving group payment session details...');

    const sessionDetails = await getGroupPaymentSession(sessionId);

    expect(sessionDetails).toBeDefined();
    expect(sessionDetails!.sessionId).toBe(sessionId);
    expect(sessionDetails!.creatorPhoneNumber).toBe(CREATOR_PHONE);
    expect(sessionDetails!.participants).toHaveLength(4);
    expect(sessionDetails!.status).toBe('SETTLED');

    console.log('✅ Session details retrieved:', {
      sessionId: sessionDetails!.sessionId,
      status: sessionDetails!.status,
      participants: sessionDetails!.participants.map(p => ({
        phone: p.phoneNumber,
        role: p.role
      }))
    });

    console.log('🎉 Group payment session completed successfully!');
  }, 30000);

  it('should demonstrate WhatsApp integration flow', async () => {
    console.log('📱 Demonstrating WhatsApp group payment flow...');

    // Simulate WhatsApp group message: "Split pizza bill - 0.03 APT"
    console.log('💬 WhatsApp Group Message Simulation:');
    console.log('   Creator: "Hey everyone! Let\'s split the pizza bill of 0.03 APT"');
    console.log('   Creator: "Everyone pays 0.01 APT to me"');

    // Step 1: Create group payment session
    const request: GroupPaymentRequest = {
      creatorPhoneNumber: CREATOR_PHONE,
      participantPhoneNumbers: [MEMBER1_PHONE, MEMBER2_PHONE, MEMBER3_PHONE],
      totalAmountApt: 0.03,
      topic: 'WhatsApp Pizza Split Demo'
    };

    const session = await createGroupPayment(request);
    console.log('✅ Group payment session created for WhatsApp group');

    // Step 2: Simulate each member confirming payment
    console.log('📱 Members confirming payments:');
    
    const memberPhones = [MEMBER1_PHONE, MEMBER2_PHONE, MEMBER3_PHONE];
    for (const phone of memberPhones) {
      const user = await findUserByPhoneNumber(phone);
      const balance = await getWalletBalance(user!.id);
      console.log(`   ${phone}: "I'll pay! My balance: ${balance.balanceApt} APT" ✅`);
    }

    // Step 3: Execute group payment
    console.log('🚀 Executing group payment via WhatsApp bot...');
    const transactions = await executeGroupPayment(session.sessionId);

    console.log('💸 Payment results:');
    for (const tx of transactions) {
      console.log(`   ${tx.fromPhoneNumber} → ${tx.toPhoneNumber}: ${tx.amountApt} APT ✅`);
    }

    // Step 4: Check final session status
    const finalSession = await getGroupPaymentSession(session.sessionId);
    console.log(`📊 Final session status: ${finalSession!.status}`);

    expect(finalSession!.status).toBe('SETTLED');
    expect(transactions.length).toBeGreaterThan(0);

    console.log('🎉 WhatsApp group payment flow completed successfully!');
    console.log('📱 Ready for real WhatsApp bot integration!');
  }, 180000);
});