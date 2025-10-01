# WattsPay On-Chain Smart Contract Architecture
## Revolutionary Shift to Programmable Money on Aptos

### 🚀 **Executive Summary**

WattsPay is evolving from a traditional database-driven payment system to a **fully on-chain, programmable money platform** powered by Aptos Move smart contracts. This architectural transformation represents a paradigm shift that makes WattsPay the **first social payment platform with complete on-chain financial logic**.

**Key Revolution Points:**
- 🔗 **100% On-Chain**: All financial logic, user management, and group coordination on Aptos
- 💬 **Social Integration**: WhatsApp bot as frontend to smart contracts
- 🔐 **Multi-Signature Security**: Built-in multi-sig for group approvals and security
- ⚡ **Instant Settlement**: Real-time on-chain settlement with optimal gas efficiency
- 🤖 **Programmable Treasury**: Smart contracts manage group financial policies
- 🔄 **Automated Refunds**: On-chain dispute resolution and automated refunds

---

## 📊 **Current vs Future Architecture**

### Current Architecture (Database-Centric)
```
WhatsApp Bot → Node.js API → Database → Aptos SDK → Individual Transactions
                   ↓
              Off-chain Logic
```

### Future Architecture (Smart Contract-Centric)
```
WhatsApp Bot → Smart Contract Events → On-Chain Logic → Automated Execution
                   ↓
           Programmable Money Platform
```

---

## 🏗️ **Complete Smart Contract System Design**

### **1. Core Contract Modules**

#### **A. UserRegistry Contract**
```move
module wattspay::user_registry {
    struct UserProfile has key {
        phone_hash: vector<u8>,
        wallet_address: address,
        whatsapp_number: String,
        created_at: u64,
        is_active: bool,
        reputation_score: u64,
    }
    
    struct PhoneToAddress has key {
        phone_mapping: SmartTable<vector<u8>, address>,
    }
    
    // Events for WhatsApp bot integration
    struct UserRegisteredEvent has drop, store {
        user_address: address,
        phone_hash: vector<u8>,
        timestamp: u64,
    }
}
```

#### **B. PaymentCoordinator Contract**
```move
module wattspay::payment_coordinator {
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    
    struct Payment has key {
        id: u128,
        from: address,
        to: address,
        amount: u64,
        currency: String,
        status: u8, // 0: pending, 1: completed, 2: failed, 3: refunded
        created_at: u64,
        completed_at: option::Option<u64>,
        group_session_id: option::Option<u128>,
    }
    
    struct PaymentRequest has drop, store {
        payment_id: u128,
        from_phone: String,
        to_phone: String,
        amount: u64,
        message: String,
    }
    
    // Events for WhatsApp notifications
    struct PaymentRequestedEvent has drop, store {
        payment_id: u128,
        from: address,
        to: address,
        amount: u64,
        message: String,
    }
    
    struct PaymentCompletedEvent has drop, store {
        payment_id: u128,
        from: address,
        to: address,
        amount: u64,
    }
}
```

#### **C. GroupTreasury Contract**
```move
module wattspay::group_treasury {
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_std::smart_table::SmartTable;
    
    struct GroupSession has key {
        id: u128,
        name: String,
        admin: address,
        participants: vector<address>,
        treasury_balance: coin::Coin<AptosCoin>,
        total_expenses: u64,
        is_active: bool,
        created_at: u64,
        multisig_threshold: u8,
    }
    
    struct GroupExpense has store {
        id: u128,
        description: String,
        amount: u64,
        paid_by: address,
        split_among: vector<address>,
        approved_by: vector<address>,
        status: u8, // 0: pending, 1: approved, 2: executed, 3: disputed
        created_at: u64,
    }
    
    struct DebtBalance has store {
        debtor: address,
        creditor: address,
        amount: u64,
    }
    
    struct GroupDebtTracker has key {
        group_id: u128,
        debt_balances: SmartTable<address, SmartTable<address, u64>>,
        expenses: SmartTable<u128, GroupExpense>,
        last_settlement: u64,
    }
    
    // Multi-signature support for group decisions
    struct MultiSigProposal has store {
        proposal_id: u128,
        proposal_type: u8, // 1: expense, 2: settlement, 3: refund
        target_expense_id: option::Option<u128>,
        amount: u64,
        approvals: vector<address>,
        rejections: vector<address>,
        executed: bool,
        expires_at: u64,
    }
    
    // Events for WhatsApp notifications
    struct GroupExpenseProposedEvent has drop, store {
        group_id: u128,
        expense_id: u128,
        proposed_by: address,
        amount: u64,
        description: String,
    }
    
    struct GroupSettlementExecutedEvent has drop, store {
        group_id: u128,
        settlements: vector<SettlementTransaction>,
        total_transactions: u64,
    }
    
    struct SettlementTransaction has drop, store {
        from: address,
        to: address,
        amount: u64,
    }
}
```

#### **D. RefundManager Contract**
```move
module wattspay::refund_manager {
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    
    struct RefundRequest has key {
        id: u128,
        original_payment_id: u128,
        requester: address,
        amount: u64,
        reason: String,
        status: u8, // 0: pending, 1: approved, 2: rejected, 3: executed
        created_at: u64,
        expires_at: u64,
        approver: option::Option<address>,
    }
    
    struct DisputeEscrow has key {
        payment_id: u128,
        escrowed_amount: coin::Coin<AptosCoin>,
        disputer: address,
        disputed_against: address,
        arbitrator: option::Option<address>,
        resolution_deadline: u64,
    }
    
    // Automated refund conditions
    struct AutoRefundRule has store {
        condition_type: u8, // 1: timeout, 2: multi_rejection, 3: fraud_detected
        trigger_value: u64,
        auto_execute: bool,
    }
    
    // Events
    struct RefundRequestedEvent has drop, store {
        refund_id: u128,
        payment_id: u128,
        requester: address,
        amount: u64,
        reason: String,
    }
    
    struct RefundExecutedEvent has drop, store {
        refund_id: u128,
        payment_id: u128,
        refunded_to: address,
        amount: u64,
    }
}
```

#### **E. MultiSigManager Contract**
```move
module wattspay::multisig_manager {
    struct MultiSigWallet has key {
        id: u128,
        owners: vector<address>,
        threshold: u8,
        transaction_count: u64,
        daily_limit: u64,
        spent_today: u64,
        last_day: u64,
    }
    
    struct Transaction has store {
        id: u64,
        to: address,
        amount: u64,
        data: vector<u8>,
        executed: bool,
        confirmations: vector<address>,
        submission_time: u64,
    }
    
    struct MultiSigTransactionEvent has drop, store {
        wallet_id: u128,
        transaction_id: u64,
        submitted_by: address,
        to: address,
        amount: u64,
    }
    
    struct TransactionConfirmedEvent has drop, store {
        wallet_id: u128,
        transaction_id: u64,
        confirmed_by: address,
        confirmations_count: u8,
        threshold: u8,
    }
}
```

---

## 🔗 **WhatsApp Bot Integration Architecture**

### **Event-Driven Integration**
```typescript
// New WhatsApp bot architecture
class OnChainWattsPayBot {
    private aptosClient: AptosClient;
    private contractAddresses: ContractAddresses;
    private eventListeners: Map<string, EventHandler>;
    
    constructor() {
        this.setupEventListeners();
        this.startEventPolling();
    }
    
    // Listen to on-chain events
    private setupEventListeners() {
        // Payment events
        this.eventListeners.set('PaymentRequestedEvent', this.handlePaymentRequest);
        this.eventListeners.set('PaymentCompletedEvent', this.handlePaymentCompleted);
        
        // Group events
        this.eventListeners.set('GroupExpenseProposedEvent', this.handleGroupExpenseProposal);
        this.eventListeners.set('GroupSettlementExecutedEvent', this.handleGroupSettlement);
        
        // Refund events
        this.eventListeners.set('RefundRequestedEvent', this.handleRefundRequest);
        this.eventListeners.set('RefundExecutedEvent', this.handleRefundExecuted);
        
        // Multi-sig events
        this.eventListeners.set('MultiSigTransactionEvent', this.handleMultiSigTransaction);
    }
    
    // Process WhatsApp messages by calling smart contracts
    async processWhatsAppMessage(message: WhatsAppMessage) {
        const command = this.parseCommand(message.body);
        
        switch(command.type) {
            case 'SEND':
                return await this.executePayment(command, message.from);
            case 'REQUEST':
                return await this.requestPayment(command, message.from);
            case 'GROUP_EXPENSE':
                return await this.proposeGroupExpense(command, message.from);
            case 'APPROVE_EXPENSE':
                return await this.approveGroupExpense(command, message.from);
            case 'SETTLE_GROUP':
                return await this.executeGroupSettlement(command, message.from);
            case 'REQUEST_REFUND':
                return await this.requestRefund(command, message.from);
            default:
                return this.sendHelp(message.from);
        }
    }
    
    // Execute smart contract functions
    private async executePayment(command: PaymentCommand, fromPhone: string) {
        const payload = {
            type: "entry_function_payload",
            function: `${this.contractAddresses.paymentCoordinator}::execute_payment`,
            arguments: [
                command.toPhone,
                command.amount.toString(),
                command.message
            ],
            type_arguments: ["0x1::aptos_coin::AptosCoin"]
        };
        
        const transaction = await this.aptosClient.generateTransaction(
            fromPhone, // This would be user's registered address
            payload
        );
        
        // Submit to blockchain
        const result = await this.aptosClient.submitTransaction(transaction);
        return result;
    }
}
```

### **Smart Contract Function Signatures**

```move
// Core payment functions
public entry fun register_user(
    user: &signer,
    phone_hash: vector<u8>,
    whatsapp_number: String
) { }

public entry fun execute_payment(
    sender: &signer,
    recipient_phone: String,
    amount: u64,
    message: String
) { }

public entry fun request_payment(
    requester: &signer,
    from_phone: String,
    amount: u64,
    message: String
) { }

// Group treasury functions
public entry fun create_group_session(
    admin: &signer,
    name: String,
    participants: vector<String>, // phone numbers
    multisig_threshold: u8
) { }

public entry fun propose_group_expense(
    proposer: &signer,
    group_id: u128,
    description: String,
    amount: u64,
    split_among: vector<String>
) { }

public entry fun approve_group_expense(
    approver: &signer,
    group_id: u128,
    expense_id: u128
) { }

public entry fun execute_optimal_settlement(
    executor: &signer,
    group_id: u128
) { }

// Refund functions
public entry fun request_refund(
    requester: &signer,
    payment_id: u128,
    reason: String
) { }

public entry fun process_automated_refund(
    payment_id: u128
) { }

// Multi-sig functions
public entry fun create_multisig_wallet(
    creator: &signer,
    owners: vector<address>,
    threshold: u8,
    daily_limit: u64
) { }

public entry fun submit_multisig_transaction(
    submitter: &signer,
    wallet_id: u128,
    to: address,
    amount: u64,
    data: vector<u8>
) { }

public entry fun confirm_multisig_transaction(
    confirmer: &signer,
    wallet_id: u128,
    transaction_id: u64
) { }
```

---

## 🚀 **Implementation Roadmap**

### **Phase 1: Core Infrastructure (4-6 weeks)**
1. **Week 1-2**: Deploy basic smart contracts
   - UserRegistry contract
   - PaymentCoordinator contract
   - Basic event emission

2. **Week 3-4**: WhatsApp bot integration
   - Event listening system
   - Basic payment commands
   - User registration flow

3. **Week 5-6**: Testing and security audit
   - Unit tests for all contracts
   - Integration testing
   - Security review

### **Phase 2: Group Payments (4-6 weeks)**
1. **Week 1-2**: GroupTreasury contract
   - Group creation and management
   - Expense proposals and approvals
   - Basic debt tracking

2. **Week 3-4**: Advanced group features
   - Optimal settlement algorithm
   - Multi-signature integration
   - Group treasury management

3. **Week 5-6**: WhatsApp group integration
   - Group command processing
   - Multi-party notifications
   - Settlement execution

### **Phase 3: Advanced Features (4-6 weeks)**
1. **Week 1-2**: RefundManager contract
   - Refund requests and processing
   - Dispute resolution system
   - Automated refund conditions

2. **Week 3-4**: MultiSigManager contract
   - Multi-signature wallet creation
   - Transaction proposals and confirmations
   - Security features

3. **Week 5-6**: Advanced treasury features
   - Programmable financial policies
   - Automated expense categorization
   - Advanced analytics

### **Phase 4: Migration & Production (2-4 weeks)**
1. **Week 1-2**: Data migration
   - Migrate existing users to smart contracts
   - Transfer historical data
   - Parallel testing

2. **Week 3-4**: Production deployment
   - Mainnet deployment
   - Monitoring and alerting
   - Performance optimization

---

## 💰 **Economic Model & Gas Optimization**

### **Gas Efficiency Strategies**
1. **Batch Transactions**: Group multiple operations in single transactions
2. **Event-Based Updates**: Use events for notifications instead of storage updates
3. **Lazy Settlement**: Only settle when needed, not on every transaction
4. **Compression**: Use efficient data structures and compression for large groups

### **Fee Structure**
```move
// Dynamic fee calculation based on transaction complexity
public fun calculate_transaction_fee(
    transaction_type: u8,
    amount: u64,
    participants: u64
): u64 {
    let base_fee = 1000; // 0.001 APT
    let complexity_fee = match transaction_type {
        SIMPLE_PAYMENT => 0,
        GROUP_EXPENSE => participants * 100,
        SETTLEMENT => participants * participants * 50,
        REFUND => 500,
        _ => 1000
    };
    base_fee + complexity_fee + (amount / 1000000) // 0.0001% of amount
}
```

---

## 🔐 **Security Architecture**

### **Multi-Layer Security**
1. **Smart Contract Security**
   - Formal verification of critical functions
   - Reentrancy protection
   - Access control patterns
   - Emergency pause mechanisms

2. **Multi-Signature Protection**
   - Required for large transactions
   - Group admin functions
   - Emergency operations
   - Treasury management

3. **Time-Based Security**
   - Transaction delays for large amounts
   - Refund windows
   - Dispute resolution timeframes
   - Emergency timeouts

### **Risk Mitigation**
```move
// Example security patterns
module wattspay::security {
    use aptos_framework::timestamp;
    
    struct SecurityConfig has key {
        max_transaction_amount: u64,
        daily_limit_per_user: u64,
        multisig_threshold_amount: u64,
        emergency_pause: bool,
        admin: address,
    }
    
    // Reentrancy protection
    struct ReentrancyGuard has key {
        locked: bool,
    }
    
    fun assert_not_locked(account: &signer) {
        let addr = signer::address_of(account);
        if (exists<ReentrancyGuard>(addr)) {
            let guard = borrow_global<ReentrancyGuard>(addr);
            assert!(!guard.locked, E_REENTRANCY_DETECTED);
        };
    }
    
    // Time-delayed execution for large transactions
    struct DelayedTransaction has key {
        transaction_id: u128,
        execute_after: u64,
        amount: u64,
        to: address,
    }
}
```

---

## 🌟 **Revolutionary Benefits**

### **For Users**
- ⚡ **Instant Settlement**: No waiting for bank transfers
- 🔐 **Cryptographic Security**: Transactions secured by Aptos blockchain
- 🌐 **Global Reach**: Works anywhere with WhatsApp and internet
- 💸 **Low Fees**: Minimal transaction costs compared to traditional banking
- 🤖 **Automated Features**: Smart contracts handle complex group settlements

### **For Developers**
- 🧩 **Composability**: Other dApps can integrate with WattsPay contracts
- 📊 **Transparency**: All transactions verifiable on-chain
- 🔧 **Extensibility**: Easy to add new features through smart contracts
- 📈 **Scalability**: Leverages Aptos's high-performance blockchain

### **For the Aptos Ecosystem**
- 🎯 **Real-World Use Case**: Practical application driving adoption
- 👥 **User Onboarding**: Brings non-crypto users to Aptos
- 💼 **Enterprise Interest**: Showcases Aptos for financial applications
- 🚀 **Innovation Leadership**: First social payment platform on Aptos

---

## 🎯 **Competitive Advantage**

WattsPay's on-chain architecture creates **unprecedented advantages**:

1. **First-Mover Advantage**: First WhatsApp payment bot with full smart contract integration
2. **Technical Moat**: Deep integration with Aptos Move language and ecosystem
3. **Network Effects**: Each new user increases value for all users
4. **Programmable Money**: Enables features impossible with traditional systems
5. **Global Scale**: Can operate anywhere without banking infrastructure

---

## 📞 **Call to Action**

This architecture represents a **paradigm shift** in digital payments. By moving to smart contracts, WattsPay becomes:

1. **A Platform, Not Just an App**: Other developers can build on WattsPay contracts
2. **Truly Decentralized**: No single point of failure or control
3. **Globally Accessible**: Works anywhere with internet connectivity
4. **Future-Proof**: Easily extensible with new features and integrations

**Ready to revolutionize payments on Aptos? Let's build the future of programmable social money! 🚀**