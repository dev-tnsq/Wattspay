# WattsPay Smart Contract Migration Guide
## From Database-Driven to On-Chain Architecture

### 🎯 **Migration Overview**

This guide details the complete migration from WattsPay's current database-driven architecture to a revolutionary **on-chain smart contract system** on Aptos. This transformation will make WattsPay the **first social payment platform with complete on-chain financial logic**.

---

## 📋 **Pre-Migration Checklist**

### **1. Smart Contract Deployment Preparation**
- [ ] Deploy smart contracts to Aptos testnet
- [ ] Complete security audit of all contracts
- [ ] Set up monitoring and alerting systems
- [ ] Configure event indexing infrastructure
- [ ] Test WhatsApp bot integration with testnet

### **2. Data Migration Preparation**
- [ ] Export all user data from current database
- [ ] Map phone numbers to addresses
- [ ] Calculate current debt balances
- [ ] Backup all transaction history
- [ ] Prepare migration scripts

### **3. Infrastructure Setup**
- [ ] Set up Aptos node infrastructure
- [ ] Configure event listening services
- [ ] Deploy gas fee management system
- [ ] Set up monitoring dashboards
- [ ] Configure backup and recovery systems

---

## 🔄 **Migration Strategy**

### **Phase 1: Parallel System Deployment (Week 1-2)**

#### **Deploy Smart Contracts**
```bash
# Deploy to Aptos testnet first
aptos move publish --package-dir ./contracts --named-addresses wattspay=<YOUR_ADDRESS>

# Deploy to mainnet after testing
aptos move publish --package-dir ./contracts --named-addresses wattspay=<MAINNET_ADDRESS> --network mainnet
```

#### **Update WhatsApp Bot Architecture**
```typescript
// New event-driven bot implementation
class OnChainWattsPayBot {
    private aptosClient: AptosClient;
    private eventStream: EventStream;
    private userMigrationTracker: Map<string, MigrationStatus>;
    
    async startMigration() {
        // Run both old and new systems in parallel
        this.setupDualProcessing();
        this.beginUserMigration();
    }
    
    private setupDualProcessing() {
        // Process commands through both systems
        // Validate results match
        // Gradually shift traffic to smart contracts
    }
}
```

### **Phase 2: User Migration (Week 2-3)**

#### **Automated User Registration**
```typescript
async function migrateUser(phoneNumber: string, existingData: UserData) {
    try {
        // Generate address for user
        const account = Account.generate();
        
        // Hash phone number
        const phoneHash = sha256(phoneNumber + SALT);
        
        // Register on smart contract
        const payload = {
            type: "entry_function_payload",
            function: `${CONTRACT_ADDRESS}::user_registry::register_user`,
            arguments: [
                Array.from(phoneHash),
                phoneNumber
            ]
        };
        
        const transaction = await aptosClient.generateTransaction(account.address(), payload);
        const signedTxn = await aptosClient.signTransaction(account, transaction);
        const result = await aptosClient.submitTransaction(signedTxn);
        
        // Update migration tracker
        await updateMigrationStatus(phoneNumber, 'MIGRATED', {
            address: account.address().hex(),
            transactionHash: result.hash
        });
        
        // Send new wallet info to user via WhatsApp
        await sendMigrationNotification(phoneNumber, account);
        
    } catch (error) {
        console.error(`Migration failed for ${phoneNumber}:`, error);
        await updateMigrationStatus(phoneNumber, 'FAILED', { error: error.message });
    }
}
```

#### **Batch Migration Script**
```typescript
async function batchMigrateUsers() {
    const users = await getAllUsersFromDatabase();
    const batchSize = 100;
    
    for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        const migrationPromises = batch.map(user => 
            migrateUser(user.phoneNumber, user)
        );
        
        await Promise.allSettled(migrationPromises);
        
        // Wait between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}
```

### **Phase 3: Data Migration (Week 3-4)**

#### **Migrate Group Data**
```typescript
async function migrateGroupSessions() {
    const groups = await getAllGroupsFromDatabase();
    
    for (const group of groups) {
        try {
            // Get migrated addresses for participants
            const participantAddresses = await Promise.all(
                group.participants.map(phone => getUserAddressByPhone(phone))
            );
            
            // Create group on smart contract
            const adminAccount = await getAccountByPhone(group.adminPhone);
            const payload = {
                type: "entry_function_payload",
                function: `${CONTRACT_ADDRESS}::group_treasury::create_group_session`,
                arguments: [
                    group.name,
                    group.participants.map(phone => hashPhone(phone)),
                    group.multisigThreshold || 1
                ]
            };
            
            const result = await executeTransaction(adminAccount, payload);
            
            // Migrate group expenses
            await migrateGroupExpenses(group.id, group.expenses);
            
        } catch (error) {
            console.error(`Group migration failed for ${group.id}:`, error);
        }
    }
}
```

#### **Migrate Historical Transactions**
```typescript
async function migrateTransactionHistory() {
    const transactions = await getAllTransactionsFromDatabase();
    
    // Create historical transaction records on-chain
    // Note: These won't execute payments, just record history
    for (const tx of transactions) {
        if (tx.status === 'completed') {
            await recordHistoricalTransaction(tx);
        }
    }
}
```

### **Phase 4: System Cutover (Week 4)**

#### **Traffic Migration**
```typescript
class TrafficMigrator {
    private migrationPercentage = 0;
    
    async graduallySwitchTraffic() {
        // Start with 10% of traffic to smart contracts
        this.migrationPercentage = 10;
        
        // Monitor for 24 hours
        await this.monitorSystemHealth();
        
        // Gradually increase if stable
        const increments = [25, 50, 75, 90, 100];
        for (const percentage of increments) {
            this.migrationPercentage = percentage;
            await this.monitorSystemHealth();
            
            if (this.detectIssues()) {
                await this.rollbackToDatabase();
                throw new Error('Migration issues detected, rolling back');
            }
        }
    }
    
    shouldUseSmartContract(userId: string): boolean {
        // Consistent hashing to ensure same users always use same system
        const hash = this.hashUserId(userId);
        return (hash % 100) < this.migrationPercentage;
    }
}
```

---

## 🔧 **Updated WhatsApp Bot Implementation**

### **Event-Driven Architecture**
```typescript
import { AptosClient, AptosAccount, HexString } from 'aptos';

class OnChainWattsPayBot {
    private aptosClient: AptosClient;
    private eventListeners: Map<string, EventHandler[]>;
    private contractAddresses: ContractAddresses;
    
    constructor() {
        this.aptosClient = new AptosClient(process.env.APTOS_NODE_URL!);
        this.setupEventListeners();
        this.startEventPolling();
    }
    
    private setupEventListeners() {
        // Payment events
        this.addEventHandler('PaymentRequestedEvent', this.handlePaymentRequest.bind(this));
        this.addEventHandler('PaymentCompletedEvent', this.handlePaymentCompleted.bind(this));
        this.addEventHandler('PaymentFailedEvent', this.handlePaymentFailed.bind(this));
        
        // Group events
        this.addEventHandler('GroupCreatedEvent', this.handleGroupCreated.bind(this));
        this.addEventHandler('GroupExpenseProposedEvent', this.handleExpenseProposal.bind(this));
        this.addEventHandler('ExpenseApprovedEvent', this.handleExpenseApproval.bind(this));
        this.addEventHandler('GroupSettlementExecutedEvent', this.handleGroupSettlement.bind(this));
        
        // User events
        this.addEventHandler('UserRegisteredEvent', this.handleUserRegistered.bind(this));
        this.addEventHandler('ReputationUpdatedEvent', this.handleReputationUpdate.bind(this));
    }
    
    private async startEventPolling() {
        while (true) {
            try {
                const events = await this.aptosClient.getEventsByEventHandle(
                    this.contractAddresses.userRegistry,
                    'UserRegisteredEvent',
                    { limit: 100 }
                );
                
                for (const event of events) {
                    await this.processEvent(event);
                }
                
                // Poll every 5 seconds
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error('Event polling error:', error);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
    
    // WhatsApp message processing
    async processWhatsAppMessage(message: WhatsAppMessage): Promise<void> {
        const command = this.parseCommand(message.body);
        const userAccount = await this.getUserAccount(message.from);
        
        if (!userAccount) {
            await this.handleNewUserRegistration(message.from);
            return;
        }
        
        switch (command.type) {
            case 'SEND':
                await this.executeSendPayment(userAccount, command);
                break;
            case 'REQUEST':
                await this.executeRequestPayment(userAccount, command);
                break;
            case 'GROUP_CREATE':
                await this.executeCreateGroup(userAccount, command);
                break;
            case 'GROUP_EXPENSE':
                await this.executeGroupExpense(userAccount, command);
                break;
            case 'APPROVE':
                await this.executeApproval(userAccount, command);
                break;
            case 'SETTLE':
                await this.executeGroupSettlement(userAccount, command);
                break;
            default:
                await this.sendHelp(message.from);
        }
    }
    
    private async executeSendPayment(account: AptosAccount, command: SendCommand) {
        const recipientPhoneHash = this.hashPhone(command.recipientPhone);
        
        const payload = {
            type: "entry_function_payload",
            function: `${this.contractAddresses.paymentCoordinator}::execute_payment`,
            arguments: [
                Array.from(recipientPhoneHash),
                command.amount.toString(),
                command.message
            ],
            type_arguments: ["0x1::aptos_coin::AptosCoin"]
        };
        
        try {
            const result = await this.executeTransaction(account, payload);
            
            // Don't send confirmation immediately - wait for event
            this.pendingTransactions.set(result.hash, {
                type: 'SEND',
                from: this.getPhoneByAccount(account),
                to: command.recipientPhone,
                amount: command.amount
            });
            
        } catch (error) {
            await this.sendErrorMessage(
                this.getPhoneByAccount(account), 
                `Payment failed: ${error.message}`
            );
        }
    }
    
    // Event handlers
    private async handlePaymentCompleted(event: PaymentCompletedEvent) {
        const senderPhone = await this.getPhoneByAddress(event.from);
        const recipientPhone = await this.getPhoneByAddress(event.to);
        
        await this.sendMessage(senderPhone, 
            `✅ Payment sent successfully!\n` +
            `Amount: ${this.formatAmount(event.amount)} APT\n` +
            `To: ${recipientPhone}\n` +
            `Transaction: ${event.payment_id}`
        );
        
        await this.sendMessage(recipientPhone,
            `💰 Payment received!\n` +
            `Amount: ${this.formatAmount(event.amount)} APT\n` +
            `From: ${senderPhone}\n` +
            `Transaction: ${event.payment_id}`
        );
    }
    
    private async handleGroupExpenseProposal(event: GroupExpenseProposedEvent) {
        const proposerPhone = await this.getPhoneByAddress(event.proposed_by);
        const groupDetails = await this.getGroupDetails(event.group_id);
        
        // Notify all group members
        for (const participant of groupDetails.participants) {
            const participantPhone = await this.getPhoneByAddress(participant);
            
            await this.sendMessage(participantPhone,
                `📝 New expense proposal in "${groupDetails.name}"\n` +
                `Proposed by: ${proposerPhone}\n` +
                `Amount: ${this.formatAmount(event.amount)} APT\n` +
                `Description: ${event.description}\n` +
                `Reply with "approve ${event.expense_id}" to approve`
            );
        }
    }
    
    // Helper methods
    private async executeTransaction(account: AptosAccount, payload: any): Promise<any> {
        const transaction = await this.aptosClient.generateTransaction(
            account.address(),
            payload
        );
        
        const signedTxn = await this.aptosClient.signTransaction(account, transaction);
        return await this.aptosClient.submitTransaction(signedTxn);
    }
    
    private hashPhone(phoneNumber: string): Uint8Array {
        const crypto = require('crypto');
        return crypto.createHash('sha256')
            .update(phoneNumber + process.env.PHONE_SALT)
            .digest();
    }
    
    private formatAmount(amount: number): string {
        return (amount / 100000000).toFixed(8); // Convert from octas to APT
    }
}
```

---

## 📊 **Migration Monitoring Dashboard**

### **Key Metrics to Track**
```typescript
class MigrationMonitor {
    private metrics = {
        usersRegistered: 0,
        transactionsMigrated: 0,
        groupsMigrated: 0,
        errorRate: 0,
        systemHealth: 'healthy'
    };
    
    async trackMigrationProgress() {
        setInterval(async () => {
            await this.updateMetrics();
            await this.checkSystemHealth();
            await this.alertIfNecessary();
        }, 30000); // Every 30 seconds
    }
    
    private async updateMetrics() {
        // Query smart contracts for current state
        const userCount = await this.getUserRegistryStats();
        const groupCount = await this.getGroupRegistryStats();
        const transactionCount = await this.getPaymentStats();
        
        this.metrics = {
            ...this.metrics,
            usersRegistered: userCount,
            groupsMigrated: groupCount,
            transactionsMigrated: transactionCount
        };
    }
    
    private async checkSystemHealth() {
        const checks = [
            this.checkEventStreamHealth(),
            this.checkTransactionThroughput(),
            this.checkErrorRates(),
            this.checkGasUsage()
        ];
        
        const results = await Promise.allSettled(checks);
        const failures = results.filter(r => r.status === 'rejected');
        
        if (failures.length > 0) {
            this.metrics.systemHealth = 'degraded';
            await this.sendAlert(`System health degraded: ${failures.length} checks failed`);
        }
    }
}
```

---

## 🚨 **Rollback Strategy**

### **Emergency Rollback Procedure**
```typescript
class EmergencyRollback {
    async executeRollback(reason: string) {
        console.log(`EMERGENCY ROLLBACK INITIATED: ${reason}`);
        
        // 1. Stop all smart contract operations
        await this.pauseSmartContractOperations();
        
        // 2. Switch all traffic back to database
        await this.switchToDatabase();
        
        // 3. Verify database integrity
        await this.verifyDatabaseIntegrity();
        
        // 4. Notify all stakeholders
        await this.notifyRollback(reason);
        
        // 5. Begin investigation
        await this.startPostMortemProcess();
    }
    
    private async pauseSmartContractOperations() {
        // Call emergency pause functions on all contracts
        const contracts = [
            'user_registry',
            'payment_coordinator', 
            'group_treasury'
        ];
        
        for (const contract of contracts) {
            await this.callEmergencyPause(contract);
        }
    }
}
```

---

## ✅ **Post-Migration Verification**

### **Verification Checklist**
- [ ] All users successfully migrated
- [ ] Transaction history preserved
- [ ] Group data integrity maintained
- [ ] WhatsApp bot responding correctly
- [ ] Event streaming working
- [ ] Gas usage within expected ranges
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Backup systems operational
- [ ] Monitoring alerts configured

### **Success Criteria**
1. **100% User Migration**: All existing users have on-chain accounts
2. **Zero Data Loss**: All historical data preserved and accessible
3. **Performance Improvement**: Transaction speed ≥ 2x faster than database
4. **Cost Efficiency**: Gas costs < traditional payment processing fees
5. **System Stability**: 99.9% uptime maintained during migration
6. **User Satisfaction**: No increase in support tickets

---

## 🎉 **Post-Migration Benefits**

### **Immediate Benefits**
- ⚡ **Instant Settlement**: Payments settle in seconds, not hours
- 🔐 **Enhanced Security**: Cryptographic security vs database vulnerabilities
- 🌐 **Global Reach**: Works anywhere with internet, no banking required
- 💸 **Lower Fees**: Blockchain fees vs traditional payment processing
- 📊 **Transparency**: All transactions verifiable on-chain

### **Future Opportunities**
- 🏗️ **Composability**: Other dApps can integrate with WattsPay contracts
- 🤖 **DeFi Integration**: Connect to lending, yield farming, DEXs
- 🎯 **Programmable Money**: Smart contract-based financial products
- 🌍 **Cross-Chain**: Expand to other blockchains
- 📈 **Tokenization**: Create WattsPay utility tokens

---

## 📞 **Support & Troubleshooting**

### **Common Issues & Solutions**

#### **Gas Fee Management**
```typescript
// Implement gas fee optimization
class GasFeeManager {
    async optimizeTransaction(payload: any): Promise<any> {
        // Check current gas prices
        const gasPrice = await this.getCurrentGasPrice();
        
        // Adjust transaction based on urgency
        if (gasPrice > this.maxAcceptableGas) {
            // Queue for later or use gas optimization techniques
            return await this.queueTransaction(payload);
        }
        
        return payload;
    }
}
```

#### **Event Stream Recovery**
```typescript
// Handle event stream interruptions
class EventStreamRecovery {
    async recoverMissedEvents(lastProcessedHeight: number) {
        const currentHeight = await this.aptosClient.getBlockHeight();
        
        // Process missed events in batches
        for (let height = lastProcessedHeight + 1; height <= currentHeight; height += 100) {
            const events = await this.getEventsForHeightRange(height, height + 99);
            await this.processEventBatch(events);
        }
    }
}
```

---

**🚀 Ready to revolutionize payments with on-chain smart contracts? This migration will position WattsPay as the leader in programmable social money on Aptos!**