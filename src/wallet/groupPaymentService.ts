import { 
  createGroupSessionReservation, 
  findSessionById 
} from '../db/repositories/groupSessionRepository';
import { findUserByPhoneNumber } from '../db/repositories/userRepository';
import { sendPayment } from './paymentService';
import { getWalletBalance } from './walletService';
import { AppError, ValidationError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { prisma } from '../db/client';
import { GroupSessionStatus, GroupParticipantRole } from '@prisma/client';

export interface GroupPaymentRequest {
  creatorPhoneNumber: string;
  participantPhoneNumbers: string[];
  totalAmountApt: number;
  topic?: string;
  expiresAt?: Date;
}

export interface GroupPaymentSplit {
  sessionId: string;
  participantPhoneNumber: string;
  amountApt: number;
  recipientPhoneNumber: string; // Who receives the payment
}

export interface GroupPaymentResult {
  sessionId: string;
  topic?: string;
  creatorPhoneNumber: string;
  participants: {
    phoneNumber: string;
    displayName?: string;
    walletAddress: string;
    role: GroupParticipantRole;
  }[];
  totalAmountApt: number;
  individualAmountApt: number;
  status: GroupSessionStatus;
  createdAt: Date;
}

export interface GroupTransactionResult {
  sessionId: string;
  transactionId: string;
  fromPhoneNumber: string;
  toPhoneNumber: string;
  amountApt: number;
  aptosHash?: string;
  status: string;
  createdAt: Date;
}

// Advanced group payment interfaces for debt tracking
export interface GroupDebtBalance {
  phoneNumber: string;
  netOwed: number; // positive = owes money, negative = owed money
  debtDetails: { [toPhone: string]: number };
}

export interface GroupExpense {
  id: string;
  description: string;
  amount: number;
  paidBy: string; // phone number of person who paid
  splitAmong: string[]; // phone numbers of people who should pay
  createdAt: Date;
  settled: boolean;
}

export interface NetSettlementTransaction {
  fromPhone: string;
  toPhone: string;
  amount: number;
  settlesDebts: string[]; // expense IDs this settles
}

export interface GroupTreasuryConfig {
  groupId: string;
  enableAutoSettle: boolean;
  settlementThreshold: number; // auto-settle when total debts exceed this
  allowedSpenders: string[]; // phone numbers who can initiate expenses
  spendingLimit?: number; // max expense amount per person
}

/**
 * Create a group payment session with multiple participants
 */
export async function createGroupPayment(request: GroupPaymentRequest): Promise<GroupPaymentResult> {
  logger.info('Creating group payment session', { 
    creatorPhone: request.creatorPhoneNumber,
    participantCount: request.participantPhoneNumbers.length,
    totalAmount: request.totalAmountApt
  });

  try {
    // Step 1: Validate creator exists and has wallet
    const creator = await findUserByPhoneNumber(request.creatorPhoneNumber);
    if (!creator || !creator.wallets?.[0]) {
      throw new NotFoundError(`Creator with phone ${request.creatorPhoneNumber} not found or has no wallet`);
    }

    // Step 2: Validate all participants exist and have wallets
    const participantUsers = [];
    for (const phoneNumber of request.participantPhoneNumbers) {
      const user = await findUserByPhoneNumber(phoneNumber);
      if (!user || !user.wallets?.[0]) {
        throw new NotFoundError(`Participant with phone ${phoneNumber} not found or has no wallet`);
      }
      participantUsers.push(user);
    }

    // Step 3: Calculate individual amount (split equally)
    const individualAmountApt = request.totalAmountApt / request.participantPhoneNumbers.length;
    
    if (individualAmountApt <= 0) {
      throw new ValidationError('Individual payment amount must be greater than 0');
    }

    // Step 4: Create group session
    const session = await createGroupSessionReservation(
      creator.id,
      request.topic,
      request.expiresAt
    );

    // Step 5: Add creator as admin participant
    await prisma.groupSessionParticipant.create({
      data: {
        sessionId: session.id,
        userId: creator.id,
        role: GroupParticipantRole.ADMIN
      }
    });

    // Step 6: Add other participants as members
    for (const user of participantUsers) {
      await prisma.groupSessionParticipant.create({
        data: {
          sessionId: session.id,
          userId: user.id,
          role: GroupParticipantRole.MEMBER
        }
      });
    }

    // Step 7: Build result
    const participants = [
      {
        phoneNumber: creator.phoneNumber,
        displayName: creator.displayName || undefined,
        walletAddress: creator.wallets[0].address,
        role: GroupParticipantRole.ADMIN
      },
      ...participantUsers.map(user => ({
        phoneNumber: user.phoneNumber,
        displayName: user.displayName || undefined,
        walletAddress: user.wallets[0].address,
        role: GroupParticipantRole.MEMBER
      }))
    ];

    const result: GroupPaymentResult = {
      sessionId: session.id,
      topic: session.topic || undefined,
      creatorPhoneNumber: creator.phoneNumber,
      participants,
      totalAmountApt: request.totalAmountApt,
      individualAmountApt,
      status: session.status,
      createdAt: session.createdAt
    };

    logger.info('Group payment session created successfully', {
      sessionId: session.id,
      participantCount: participants.length,
      individualAmount: individualAmountApt
    });

    return result;

  } catch (error) {
    logger.error('Failed to create group payment session', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      creatorPhone: request.creatorPhoneNumber
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError('Failed to create group payment session');
  }
}

/**
 * Execute group payment - each participant pays their share to the creator
 */
export async function executeGroupPayment(sessionId: string): Promise<GroupTransactionResult[]> {
  logger.info('Executing group payment', { sessionId });

  try {
    // Step 1: Get session details
    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Group session ${sessionId} not found`);
    }

    if (session.status !== GroupSessionStatus.ACTIVE) {
      throw new ValidationError(`Group session is not active, current status: ${session.status}`);
    }

    // Step 2: Find creator (admin)
    const creatorParticipant = session.participants.find(p => p.role === GroupParticipantRole.ADMIN);
    if (!creatorParticipant) {
      throw new ValidationError('No admin found in group session');
    }

    const creator = await prisma.user.findUnique({
      where: { id: creatorParticipant.userId },
      include: { wallets: true }
    });

    if (!creator || !creator.wallets?.[0]) {
      throw new NotFoundError('Creator not found or has no wallet');
    }

    // Step 3: Get all member participants (excluding creator)
    const memberParticipants = session.participants.filter(p => p.role === GroupParticipantRole.MEMBER);
    
    if (memberParticipants.length === 0) {
      throw new ValidationError('No members found in group session');
    }

    // Step 4: Calculate individual amount
    const totalParticipants = memberParticipants.length;
    // We need to determine total amount - for now, let's get it from first transaction or calculate
    // For demo, let's assume 1 APT total split among members
    const assumedTotalAmount = 1.0; // This should come from session metadata in real implementation
    const individualAmountApt = assumedTotalAmount / totalParticipants;

    logger.info('Group payment breakdown', {
      sessionId,
      totalParticipants,
      individualAmount: individualAmountApt,
      creatorWallet: creator.wallets[0].address
    });

    // Step 5: Execute payments from each member to creator
    const transactionResults: GroupTransactionResult[] = [];

    for (const memberParticipant of memberParticipants) {
      try {
        // Get member user details
        const member = await prisma.user.findUnique({
          where: { id: memberParticipant.userId },
          include: { wallets: true }
        });

        if (!member || !member.wallets?.[0]) {
          logger.error('Member not found or has no wallet', { memberId: memberParticipant.userId });
          continue;
        }

        // Check member balance
        const memberBalance = await getWalletBalance(member.id);
        if (memberBalance.balanceApt < individualAmountApt) {
          logger.warn('Insufficient balance for member', {
            memberPhone: member.phoneNumber,
            requiredAmount: individualAmountApt,
            availableBalance: memberBalance.balanceApt
          });
          continue;
        }

        // Execute payment from member to creator
        logger.info('Executing payment from member to creator', {
          fromPhone: member.phoneNumber,
          toPhone: creator.phoneNumber,
          amount: individualAmountApt
        });

        const transaction = await sendPayment({
          fromUserId: member.id,
          toAddress: creator.wallets[0].address,
          amountApt: individualAmountApt,
          metadata: {
            sessionId,
            groupPayment: true,
            fromPhone: member.phoneNumber,
            toPhone: creator.phoneNumber,
            note: `Group payment for session: ${sessionId}`
          }
        });

        // Link transaction to group session
        await prisma.transaction.update({
          where: { id: transaction.transactionId },
          data: { groupSessionId: sessionId }
        });

        transactionResults.push({
          sessionId,
          transactionId: transaction.transactionId,
          fromPhoneNumber: member.phoneNumber,
          toPhoneNumber: creator.phoneNumber,
          amountApt: individualAmountApt,
          aptosHash: transaction.aptosHash,
          status: transaction.status,
          createdAt: new Date()
        });

        logger.info('Group payment transaction completed', {
          transactionId: transaction.transactionId,
          fromPhone: member.phoneNumber,
          toPhone: creator.phoneNumber
        });

      } catch (error) {
        logger.error('Failed to process payment for member', {
          memberId: memberParticipant.userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with other members even if one fails
      }
    }

    // Step 6: Update session status if all payments completed
    if (transactionResults.length === memberParticipants.length) {
      await prisma.groupSession.update({
        where: { id: sessionId },
        data: { status: GroupSessionStatus.SETTLED }
      });
      
      logger.info('Group payment session settled', { 
        sessionId, 
        completedTransactions: transactionResults.length 
      });
    }

    return transactionResults;

  } catch (error) {
    logger.error('Failed to execute group payment', { 
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError('Failed to execute group payment');
  }
}

/**
 * Get group payment session details
 */
export async function getGroupPaymentSession(sessionId: string): Promise<GroupPaymentResult | null> {
  try {
    const session = await findSessionById(sessionId);
    if (!session) {
      return null;
    }

    // Get all participants with user details
    const participantsWithDetails = await Promise.all(
      session.participants.map(async (participant) => {
        const user = await prisma.user.findUnique({
          where: { id: participant.userId },
          include: { wallets: true }
        });
        
        return {
          phoneNumber: user?.phoneNumber || 'Unknown',
          displayName: user?.displayName || undefined,
          walletAddress: user?.wallets?.[0]?.address || 'No wallet',
          role: participant.role
        };
      })
    );

    const creator = participantsWithDetails.find(p => p.role === GroupParticipantRole.ADMIN);
    const totalParticipants = session.participants.length;
    const assumedTotalAmount = 1.0; // Should come from session metadata
    
    return {
      sessionId: session.id,
      topic: session.topic || undefined,
      creatorPhoneNumber: creator?.phoneNumber || 'Unknown',
      participants: participantsWithDetails,
      totalAmountApt: assumedTotalAmount,
      individualAmountApt: assumedTotalAmount / Math.max(totalParticipants - 1, 1), // Exclude creator
      status: session.status,
      createdAt: session.createdAt
    };

  } catch (error) {
    logger.error('Failed to get group payment session', { 
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new AppError('Failed to get group payment session');
  }
}

/**
 * ADVANCED GROUP FINANCE FEATURES
 * These functions enable ongoing debt tracking and smart settlement
 */

/**
 * Add an expense to a group and track who owes what
 * This is more advanced than simple bill splitting - it tracks ongoing debts
 */
export async function addGroupExpense(
  groupId: string,
  paidByPhone: string,
  amount: number,
  description: string,
  splitAmongPhones: string[]
): Promise<GroupExpense> {
  try {
    logger.info('Adding group expense', { 
      groupId, 
      paidByPhone, 
      amount, 
      description,
      splitCount: splitAmongPhones.length
    });

    // Create expense record in database
    // Note: You'll need to add this to your Prisma schema
    const expense = await prisma.groupExpense.create({
      data: {
        groupSessionId: groupId,
        description,
        amount: amount.toString(),
        paidByPhone,
        splitAmongPhones: JSON.stringify(splitAmongPhones),
        settled: false
      }
    });

    // Calculate individual amounts (split equally for now)
    const individualAmount = amount / splitAmongPhones.length;

    // Update debt tracking
    await updateGroupDebts(groupId, paidByPhone, splitAmongPhones, individualAmount);

    logger.info('Group expense added successfully', { 
      expenseId: expense.id,
      individualAmount
    });

    return {
      id: expense.id,
      description: expense.description,
      amount: parseFloat(expense.amount),
      paidBy: expense.paidByPhone,
      splitAmong: JSON.parse(expense.splitAmongPhones),
      createdAt: expense.createdAt,
      settled: expense.settled
    };

  } catch (error) {
    logger.error('Failed to add group expense', { error });
    throw new AppError('Failed to add group expense');
  }
}

/**
 * Get current debt balances for all members in a group
 * Shows who owes whom and net amounts
 */
export async function getGroupDebtBalances(groupId: string): Promise<GroupDebtBalance[]> {
  try {
    // Fetch all unsettled expenses for this group
    const expenses = await prisma.groupExpense.findMany({
      where: { 
        groupSessionId: groupId,
        settled: false 
      }
    });

    // Calculate net debts
    const debtMap = new Map<string, Map<string, number>>();
    
    for (const expense of expenses) {
      const amount = parseFloat(expense.amount);
      const paidBy = expense.paidByPhone;
      const splitAmong = JSON.parse(expense.splitAmongPhones) as string[];
      const individualAmount = amount / splitAmong.length;

      for (const phone of splitAmong) {
        if (phone !== paidBy) {
          // This person owes paidBy money
          if (!debtMap.has(phone)) {
            debtMap.set(phone, new Map());
          }
          const currentDebt = debtMap.get(phone)!.get(paidBy) || 0;
          debtMap.get(phone)!.set(paidBy, currentDebt + individualAmount);
        }
      }
    }

    // Convert to result format
    const result: GroupDebtBalance[] = [];
    
    for (const [phone, debts] of debtMap) {
      let netOwed = 0;
      const debtDetails: { [toPhone: string]: number } = {};
      
      for (const [toPhone, amount] of debts) {
        netOwed += amount;
        debtDetails[toPhone] = amount;
      }

      result.push({
        phoneNumber: phone,
        netOwed,
        debtDetails
      });
    }

    return result;

  } catch (error) {
    logger.error('Failed to get group debt balances', { groupId, error });
    throw new AppError('Failed to get group debt balances');
  }
}

/**
 * Calculate optimal settlement transactions to minimize number of payments
 * This is the "smart" part - instead of everyone paying everyone, optimize the flow
 */
export async function calculateOptimalSettlement(groupId: string): Promise<NetSettlementTransaction[]> {
  try {
    const debtBalances = await getGroupDebtBalances(groupId);
    
    // Simple debt optimization algorithm (can be enhanced further)
    const settlements: NetSettlementTransaction[] = [];
    const balances = new Map<string, number>();

    // Calculate net position for each person
    for (const balance of debtBalances) {
      balances.set(balance.phoneNumber, balance.netOwed);
    }

    // Add people who are owed money (negative net owed)
    const allPhones = new Set(debtBalances.flatMap(b => 
      [b.phoneNumber, ...Object.keys(b.debtDetails)]
    ));

    for (const phone of allPhones) {
      if (!balances.has(phone)) {
        balances.set(phone, 0);
      }
    }

    // Calculate who owes money vs who is owed money
    for (const balance of debtBalances) {
      for (const [toPhone, amount] of Object.entries(balance.debtDetails)) {
        const currentBalance = balances.get(toPhone) || 0;
        balances.set(toPhone, currentBalance - amount);
      }
    }

    // Generate minimal settlement transactions
    const debtors = Array.from(balances.entries())
      .filter(([_, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);
    
    const creditors = Array.from(balances.entries())
      .filter(([_, amount]) => amount < 0)
      .sort((a, b) => a[1] - b[1]);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const [debtorPhone, debtAmount] = debtors[i];
      const [creditorPhone, creditAmount] = creditors[j];
      
      const settleAmount = Math.min(debtAmount, Math.abs(creditAmount));
      
      if (settleAmount > 0.01) { // Only settle if meaningful amount
        settlements.push({
          fromPhone: debtorPhone,
          toPhone: creditorPhone,
          amount: settleAmount,
          settlesDebts: [] // Could track which specific expenses this settles
        });
      }

      debtors[i][1] -= settleAmount;
      creditors[j][1] += settleAmount;

      if (debtors[i][1] <= 0.01) i++;
      if (Math.abs(creditors[j][1]) <= 0.01) j++;
    }

    logger.info('Calculated optimal settlement', { 
      groupId, 
      originalDebts: debtBalances.length,
      optimizedTransactions: settlements.length
    });

    return settlements;

  } catch (error) {
    logger.error('Failed to calculate optimal settlement', { groupId, error });
    throw new AppError('Failed to calculate optimal settlement');
  }
}

/**
 * Execute optimized settlement - this pays off all debts with minimal transactions
 */
export async function executeOptimalSettlement(groupId: string): Promise<GroupTransactionResult[]> {
  try {
    const settlements = await calculateOptimalSettlement(groupId);
    const results: GroupTransactionResult[] = [];

    logger.info('Executing optimal settlement', { 
      groupId, 
      transactionCount: settlements.length 
    });

    for (const settlement of settlements) {
      try {
        // Get sender user
        const senderUser = await findUserByPhoneNumber(settlement.fromPhone);
        if (!senderUser) {
          logger.error('Sender not found', { phone: settlement.fromPhone });
          continue;
        }

        // Get recipient user  
        const recipientUser = await findUserByPhoneNumber(settlement.toPhone);
        if (!recipientUser || !recipientUser.wallets?.[0]) {
          logger.error('Recipient not found', { phone: settlement.toPhone });
          continue;
        }

        // Execute payment
        const transaction = await sendPayment({
          fromUserId: senderUser.id,
          toAddress: recipientUser.wallets[0].address,
          amountApt: settlement.amount,
          metadata: {
            groupId,
            settlementPayment: true,
            fromPhone: settlement.fromPhone,
            toPhone: settlement.toPhone,
            note: `Group settlement payment`
          }
        });

        results.push({
          sessionId: groupId,
          transactionId: transaction.transactionId,
          fromPhoneNumber: settlement.fromPhone,
          toPhoneNumber: settlement.toPhone,
          amountApt: settlement.amount,
          aptosHash: transaction.aptosHash,
          status: transaction.status,
          createdAt: new Date()
        });

        logger.info('Settlement transaction completed', {
          from: settlement.fromPhone,
          to: settlement.toPhone,
          amount: settlement.amount
        });

      } catch (error) {
        logger.error('Failed to execute settlement transaction', { 
          settlement, 
          error 
        });
      }
    }

    // Mark all expenses as settled if all transactions succeeded
    if (results.length === settlements.length) {
      await prisma.groupExpense.updateMany({
        where: { 
          groupSessionId: groupId,
          settled: false 
        },
        data: { settled: true }
      });
      
      logger.info('All group expenses marked as settled', { groupId });
    }

    return results;

  } catch (error) {
    logger.error('Failed to execute optimal settlement', { groupId, error });
    throw new AppError('Failed to execute optimal settlement');
  }
}

/**
 * Helper function to update debt tracking when expenses are added
 */
async function updateGroupDebts(
  groupId: string, 
  paidByPhone: string, 
  splitAmongPhones: string[], 
  individualAmount: number
): Promise<void> {
  // This would update a debt tracking table in your database
  // For now, the debt calculation is done dynamically in getGroupDebtBalances
  // In a production system, you might want to cache these for performance
}