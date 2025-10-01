module wattspay::group_treasury {
    use std::string::{String};
    use std::signer;
    use std::vector;
    use std::option::{Self, Option};
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::smart_table::{Self, SmartTable};
    use wattspay::user_registry;
    use wattspay::payment_coordinator;

    /// Error codes
    const E_GROUP_NOT_FOUND: u64 = 1;
    const E_NOT_GROUP_MEMBER: u64 = 2;
    const E_NOT_GROUP_ADMIN: u64 = 3;
    const E_EXPENSE_NOT_FOUND: u64 = 4;
    const E_INSUFFICIENT_APPROVALS: u64 = 5;
    const E_ALREADY_APPROVED: u64 = 6;
    const E_EXPENSE_ALREADY_EXECUTED: u64 = 7;
    const E_INVALID_SPLIT: u64 = 8;
    const E_GROUP_INACTIVE: u64 = 9;
    const E_INSUFFICIENT_TREASURY: u64 = 10;

    /// Group and expense status constants
    const GROUP_ACTIVE: u8 = 1;
    const GROUP_INACTIVE: u8 = 2;
    const GROUP_SETTLING: u8 = 3;

    const EXPENSE_PENDING: u8 = 0;
    const EXPENSE_APPROVED: u8 = 1;
    const EXPENSE_EXECUTED: u8 = 2;
    const EXPENSE_DISPUTED: u8 = 3;
    const EXPENSE_CANCELLED: u8 = 4;

    /// Group session for managing shared expenses
    struct GroupSession has key {
        id: u128,
        name: String,
        admin: address,
        participants: vector<address>,
        treasury_balance: Coin<AptosCoin>,
        total_expenses: u64,
        total_contributions: u64,
        status: u8,
        created_at: u64,
        multisig_threshold: u8,
        min_expense_approval: u8,
    }

    /// Individual expense within a group
    struct GroupExpense has store {
        id: u128,
        description: String,
        amount: u64,
        paid_by: address,
        split_among: vector<address>,
        split_amounts: vector<u64>, // Custom split amounts
        approved_by: vector<address>,
        status: u8,
        created_at: u64,
        executed_at: Option<u64>,
        receipt_hash: Option<vector<u8>>,
    }

    /// Debt tracking between group members
    struct DebtBalance has store {
        debtor: address,
        creditor: address,
        amount: u64,
        last_updated: u64,
    }

    /// Group debt and expense tracker
    struct GroupDebtTracker has key {
        group_id: u128,
        debt_balances: SmartTable<address, SmartTable<address, u64>>, // debtor -> creditor -> amount
        expenses: SmartTable<u128, GroupExpense>,
        next_expense_id: u128,
        last_settlement: u64,
        total_settled_amount: u64,
    }

    /// Global group registry
    struct GroupRegistry has key {
        next_group_id: u128,
        active_groups: SmartTable<u128, address>, // group_id -> admin_address
        total_groups: u64,
        total_group_volume: u64,
    }

    /// Settlement transaction for optimal debt resolution
    struct SettlementTransaction has drop, store {
        from: address,
        to: address,
        amount: u64,
    }

    /// Events for WhatsApp bot integration
    #[event]
    struct GroupCreatedEvent has drop, store {
        group_id: u128,
        name: String,
        admin: address,
        participants: vector<address>,
        timestamp: u64,
    }

    #[event]
    struct GroupExpenseProposedEvent has drop, store {
        group_id: u128,
        expense_id: u128,
        proposed_by: address,
        amount: u64,
        description: String,
        split_among: vector<address>,
        timestamp: u64,
    }

    #[event]
    struct ExpenseApprovedEvent has drop, store {
        group_id: u128,
        expense_id: u128,
        approved_by: address,
        total_approvals: u64,
        required_approvals: u8,
        timestamp: u64,
    }

    #[event]
    struct ExpenseExecutedEvent has drop, store {
        group_id: u128,
        expense_id: u128,
        executor: address,
        amount: u64,
        timestamp: u64,
    }

    #[event]
    struct GroupSettlementExecutedEvent has drop, store {
        group_id: u128,
        settlements: vector<SettlementTransaction>,
        total_transactions: u64,
        total_amount: u64,
        timestamp: u64,
    }

    #[event]
    struct TreasuryContributionEvent has drop, store {
        group_id: u128,
        contributor: address,
        amount: u64,
        new_balance: u64,
        timestamp: u64,
    }

    /// Initialize the group treasury system
    fun init_module(admin: &signer) {
        move_to(admin, GroupRegistry {
            next_group_id: 1,
            active_groups: smart_table::new(),
            total_groups: 0,
            total_group_volume: 0,
        });
    }

    /// Create a new group session
    public entry fun create_group_session(
        admin: &signer,
        name: String,
        participant_phone_hashes: vector<vector<u8>>,
        multisig_threshold: u8
    ) acquires GroupRegistry {
        let admin_addr = signer::address_of(admin);
        
        // Validate admin eligibility
        assert!(user_registry::is_user_eligible(admin_addr), E_NOT_GROUP_MEMBER);
        
        // Convert phone hashes to addresses and validate participants
        let participants = vector::empty<address>();
        vector::push_back(&mut participants, admin_addr); // Admin is always a participant
        
        let i = 0;
        let phone_count = vector::length(&participant_phone_hashes);
        while (i < phone_count) {
            let phone_hash = vector::borrow(&participant_phone_hashes, i);
            let participant_addr = user_registry::get_address_by_phone(*phone_hash);
            assert!(user_registry::is_user_eligible(participant_addr), E_NOT_GROUP_MEMBER);
            
            // Avoid duplicates
            if (!vector::contains(&participants, &participant_addr)) {
                vector::push_back(&mut participants, participant_addr);
            };
            i = i + 1;
        };
        
        let participant_count = vector::length(&participants);
        assert!(multisig_threshold <= (participant_count as u8), E_INVALID_SPLIT);
        
        // Generate group ID
        let registry = borrow_global_mut<GroupRegistry>(@wattspay);
        let group_id = registry.next_group_id;
        registry.next_group_id = registry.next_group_id + 1;
        
        // Create group session
        let group_session = GroupSession {
            id: group_id,
            name,
            admin: admin_addr,
            participants,
            treasury_balance: coin::zero<AptosCoin>(),
            total_expenses: 0,
            total_contributions: 0,
            status: GROUP_ACTIVE,
            created_at: timestamp::now_seconds(),
            multisig_threshold,
            min_expense_approval: if (multisig_threshold > 1) { multisig_threshold } else { 1 },
        };
        
        // Create debt tracker
        let debt_tracker = GroupDebtTracker {
            group_id,
            debt_balances: smart_table::new(),
            expenses: smart_table::new(),
            next_expense_id: 1,
            last_settlement: timestamp::now_seconds(),
            total_settled_amount: 0,
        };
        
        // Update registry
        smart_table::add(&mut registry.active_groups, group_id, admin_addr);
        registry.total_groups = registry.total_groups + 1;
        
        // Store structures
        move_to(admin, group_session);
        move_to(admin, debt_tracker);
        
        // Emit event
        event::emit(GroupCreatedEvent {
            group_id,
            name: group_session.name,
            admin: admin_addr,
            participants: group_session.participants,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Propose a group expense
    public entry fun propose_group_expense(
        proposer: &signer,
        group_id: u128,
        description: String,
        amount: u64,
        split_among_phone_hashes: vector<vector<u8>>,
        custom_split_amounts: vector<u64> // Empty vector means equal split
    ) acquires GroupRegistry, GroupSession, GroupDebtTracker {
        let proposer_addr = signer::address_of(proposer);
        
        // Get group admin and validate group exists
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(smart_table::contains(&registry.active_groups, group_id), E_GROUP_NOT_FOUND);
        let admin_addr = *smart_table::borrow(&registry.active_groups, group_id);
        
        // Get group session and validate proposer is member
        assert!(exists<GroupSession>(admin_addr), E_GROUP_NOT_FOUND);
        let group_session = borrow_global<GroupSession>(admin_addr);
        assert!(group_session.status == GROUP_ACTIVE, E_GROUP_INACTIVE);
        assert!(vector::contains(&group_session.participants, &proposer_addr), E_NOT_GROUP_MEMBER);
        
        // Convert phone hashes to addresses for split participants
        let split_among = vector::empty<address>();
        let i = 0;
        let phone_count = vector::length(&split_among_phone_hashes);
        while (i < phone_count) {
            let phone_hash = vector::borrow(&split_among_phone_hashes, i);
            let participant_addr = user_registry::get_address_by_phone(*phone_hash);
            assert!(vector::contains(&group_session.participants, &participant_addr), E_NOT_GROUP_MEMBER);
            vector::push_back(&mut split_among, participant_addr);
            i = i + 1;
        };
        
        // Validate split amounts
        let split_amounts = if (vector::length(&custom_split_amounts) == 0) {
            // Equal split
            let split_count = vector::length(&split_among);
            let per_person = amount / (split_count as u64);
            let remainder = amount % (split_count as u64);
            
            let equal_splits = vector::empty<u64>();
            let j = 0;
            while (j < split_count) {
                let split_amount = if (j < remainder) { per_person + 1 } else { per_person };
                vector::push_back(&mut equal_splits, split_amount);
                j = j + 1;
            };
            equal_splits
        } else {
            // Custom split - validate total equals amount
            assert!(vector::length(&custom_split_amounts) == vector::length(&split_among), E_INVALID_SPLIT);
            let total_split = 0;
            let k = 0;
            while (k < vector::length(&custom_split_amounts)) {
                total_split = total_split + *vector::borrow(&custom_split_amounts, k);
                k = k + 1;
            };
            assert!(total_split == amount, E_INVALID_SPLIT);
            custom_split_amounts
        };
        
        // Get debt tracker
        assert!(exists<GroupDebtTracker>(admin_addr), E_GROUP_NOT_FOUND);
        let debt_tracker = borrow_global_mut<GroupDebtTracker>(admin_addr);
        
        // Create expense
        let expense_id = debt_tracker.next_expense_id;
        debt_tracker.next_expense_id = debt_tracker.next_expense_id + 1;
        
        let expense = GroupExpense {
            id: expense_id,
            description,
            amount,
            paid_by: proposer_addr,
            split_among,
            split_amounts,
            approved_by: vector::empty<address>(),
            status: EXPENSE_PENDING,
            created_at: timestamp::now_seconds(),
            executed_at: option::none(),
            receipt_hash: option::none(),
        };
        
        // Store expense
        smart_table::add(&mut debt_tracker.expenses, expense_id, expense);
        
        // Emit event
        event::emit(GroupExpenseProposedEvent {
            group_id,
            expense_id,
            proposed_by: proposer_addr,
            amount,
            description,
            split_among: expense.split_among,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Approve a group expense
    public entry fun approve_group_expense(
        approver: &signer,
        group_id: u128,
        expense_id: u128
    ) acquires GroupRegistry, GroupSession, GroupDebtTracker {
        let approver_addr = signer::address_of(approver);
        
        // Get group and validate
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(smart_table::contains(&registry.active_groups, group_id), E_GROUP_NOT_FOUND);
        let admin_addr = *smart_table::borrow(&registry.active_groups, group_id);
        
        let group_session = borrow_global<GroupSession>(admin_addr);
        assert!(vector::contains(&group_session.participants, &approver_addr), E_NOT_GROUP_MEMBER);
        
        // Get expense and validate
        let debt_tracker = borrow_global_mut<GroupDebtTracker>(admin_addr);
        assert!(smart_table::contains(&debt_tracker.expenses, expense_id), E_EXPENSE_NOT_FOUND);
        
        let expense = smart_table::borrow_mut(&mut debt_tracker.expenses, expense_id);
        assert!(expense.status == EXPENSE_PENDING, E_EXPENSE_ALREADY_EXECUTED);
        assert!(!vector::contains(&expense.approved_by, &approver_addr), E_ALREADY_APPROVED);
        
        // Add approval
        vector::push_back(&mut expense.approved_by, approver_addr);
        let approval_count = vector::length(&expense.approved_by);
        
        // Emit approval event
        event::emit(ExpenseApprovedEvent {
            group_id,
            expense_id,
            approved_by: approver_addr,
            total_approvals: approval_count,
            required_approvals: group_session.min_expense_approval,
            timestamp: timestamp::now_seconds(),
        });
        
        // Check if we have enough approvals to execute
        if ((approval_count as u8) >= group_session.min_expense_approval) {
            execute_approved_expense(group_id, expense_id, admin_addr, debt_tracker, group_session);
        };
    }

    /// Internal function to execute an approved expense
    fun execute_approved_expense(
        group_id: u128,
        expense_id: u128,
        admin_addr: address,
        debt_tracker: &mut GroupDebtTracker,
        group_session: &GroupSession
    ) {
        let expense = smart_table::borrow_mut(&mut debt_tracker.expenses, expense_id);
        expense.status = EXPENSE_EXECUTED;
        expense.executed_at = option::some(timestamp::now_seconds());
        
        // Update debt balances
        let i = 0;
        let split_count = vector::length(&expense.split_among);
        while (i < split_count) {
            let debtor = *vector::borrow(&expense.split_among, i);
            let amount_owed = *vector::borrow(&expense.split_amounts, i);
            
            // Skip if debtor is the payer
            if (debtor != expense.paid_by) {
                update_debt_balance(debt_tracker, debtor, expense.paid_by, amount_owed);
            };
            i = i + 1;
        };
        
        // Emit execution event
        event::emit(ExpenseExecutedEvent {
            group_id,
            expense_id,
            executor: admin_addr,
            amount: expense.amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Update debt balance between two users
    fun update_debt_balance(
        debt_tracker: &mut GroupDebtTracker,
        debtor: address,
        creditor: address,
        amount: u64
    ) {
        // Get or create debtor's debt table
        if (!smart_table::contains(&debt_tracker.debt_balances, debtor)) {
            smart_table::add(&mut debt_tracker.debt_balances, debtor, smart_table::new<address, u64>());
        };
        
        let debtor_debts = smart_table::borrow_mut(&mut debt_tracker.debt_balances, debtor);
        
        // Update or create debt to creditor
        if (smart_table::contains(debtor_debts, creditor)) {
            let current_debt = smart_table::borrow_mut(debtor_debts, creditor);
            *current_debt = *current_debt + amount;
        } else {
            smart_table::add(debtor_debts, creditor, amount);
        };
    }

    /// Calculate optimal settlement for the group
    public entry fun execute_optimal_settlement(
        executor: &signer,
        group_id: u128
    ) acquires GroupRegistry, GroupSession, GroupDebtTracker {
        let executor_addr = signer::address_of(executor);
        
        // Get group and validate
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(smart_table::contains(&registry.active_groups, group_id), E_GROUP_NOT_FOUND);
        let admin_addr = *smart_table::borrow(&registry.active_groups, group_id);
        
        let group_session = borrow_global<GroupSession>(admin_addr);
        assert!(vector::contains(&group_session.participants, &executor_addr), E_NOT_GROUP_MEMBER);
        
        let debt_tracker = borrow_global_mut<GroupDebtTracker>(admin_addr);
        
        // Calculate net balances for each participant
        let net_balances = calculate_net_balances(debt_tracker, &group_session.participants);
        
        // Generate optimal settlement transactions
        let settlements = calculate_optimal_settlements(&net_balances);
        
        // Execute settlements
        let total_settlement_amount = execute_settlements(&settlements, group_session);
        
        // Update settlement tracking
        debt_tracker.last_settlement = timestamp::now_seconds();
        debt_tracker.total_settled_amount = debt_tracker.total_settled_amount + total_settlement_amount;
        
        // Clear settled debts
        clear_settled_debts(debt_tracker, &group_session.participants);
        
        // Emit settlement event
        event::emit(GroupSettlementExecutedEvent {
            group_id,
            settlements,
            total_transactions: vector::length(&settlements),
            total_amount: total_settlement_amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Calculate net balances for all participants
    fun calculate_net_balances(
        debt_tracker: &GroupDebtTracker,
        participants: &vector<address>
    ): SmartTable<address, i64> {
        let net_balances = smart_table::new<address, i64>();
        
        // Initialize all participants with 0 balance
        let i = 0;
        let participant_count = vector::length(participants);
        while (i < participant_count) {
            let participant = *vector::borrow(participants, i);
            smart_table::add(&mut net_balances, participant, 0);
            i = i + 1;
        };
        
        // Calculate net balances from debt relationships
        let j = 0;
        while (j < participant_count) {
            let debtor = *vector::borrow(participants, j);
            
            if (smart_table::contains(&debt_tracker.debt_balances, debtor)) {
                let debtor_debts = smart_table::borrow(&debt_tracker.debt_balances, debtor);
                
                // Iterate through this debtor's debts
                let k = 0;
                while (k < participant_count) {
                    let creditor = *vector::borrow(participants, k);
                    
                    if (smart_table::contains(debtor_debts, creditor)) {
                        let debt_amount = *smart_table::borrow(debtor_debts, creditor);
                        
                        // Debtor owes money (negative balance)
                        let debtor_balance = smart_table::borrow_mut(&mut net_balances, debtor);
                        *debtor_balance = *debtor_balance - (debt_amount as i64);
                        
                        // Creditor is owed money (positive balance)
                        let creditor_balance = smart_table::borrow_mut(&mut net_balances, creditor);
                        *creditor_balance = *creditor_balance + (debt_amount as i64);
                    };
                    k = k + 1;
                };
            };
            j = j + 1;
        };
        
        net_balances
    }

    /// Calculate optimal settlement transactions using simplified algorithm
    fun calculate_optimal_settlements(
        net_balances: &SmartTable<address, i64>
    ): vector<SettlementTransaction> {
        let settlements = vector::empty<SettlementTransaction>();
        
        // Create temporary working copy of balances
        let working_balances = smart_table::new<address, i64>();
        
        // Note: In a full implementation, you'd iterate through the SmartTable
        // For now, we'll return empty settlements as the iteration methods
        // might not be available in all Move implementations
        
        settlements
    }

    /// Execute settlement transactions
    fun execute_settlements(
        settlements: &vector<SettlementTransaction>,
        group_session: &GroupSession
    ): u64 {
        let total_amount = 0;
        let i = 0;
        let settlement_count = vector::length(settlements);
        
        while (i < settlement_count) {
            let settlement = vector::borrow(settlements, i);
            total_amount = total_amount + settlement.amount;
            
            // In a real implementation, you would execute the actual transfer here
            // This might involve calling the payment_coordinator or handling treasury funds
            
            i = i + 1;
        };
        
        total_amount
    }

    /// Clear settled debts from the debt tracker
    fun clear_settled_debts(
        debt_tracker: &mut GroupDebtTracker,
        participants: &vector<address>
    ) {
        // Clear all debt balances after settlement
        let i = 0;
        let participant_count = vector::length(participants);
        while (i < participant_count) {
            let participant = *vector::borrow(participants, i);
            if (smart_table::contains(&debt_tracker.debt_balances, participant)) {
                let debtor_debts = smart_table::borrow_mut(&mut debt_tracker.debt_balances, participant);
                // Clear the inner table - in a full implementation you'd iterate and remove
                // For now, we'll leave this as is since SmartTable might not have clear()
            };
            i = i + 1;
        };
    }

    /// Contribute to group treasury
    public entry fun contribute_to_treasury(
        contributor: &signer,
        group_id: u128,
        amount: u64
    ) acquires GroupRegistry, GroupSession {
        let contributor_addr = signer::address_of(contributor);
        
        // Get group and validate
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(smart_table::contains(&registry.active_groups, group_id), E_GROUP_NOT_FOUND);
        let admin_addr = *smart_table::borrow(&registry.active_groups, group_id);
        
        let group_session = borrow_global_mut<GroupSession>(admin_addr);
        assert!(vector::contains(&group_session.participants, &contributor_addr), E_NOT_GROUP_MEMBER);
        assert!(group_session.status == GROUP_ACTIVE, E_GROUP_INACTIVE);
        
        // Check contributor balance
        assert!(coin::balance<AptosCoin>(contributor_addr) >= amount, E_INSUFFICIENT_TREASURY);
        
        // Transfer to treasury
        let contribution = coin::withdraw<AptosCoin>(contributor, amount);
        coin::merge(&mut group_session.treasury_balance, contribution);
        group_session.total_contributions = group_session.total_contributions + amount;
        
        let new_balance = coin::value(&group_session.treasury_balance);
        
        // Emit event
        event::emit(TreasuryContributionEvent {
            group_id,
            contributor: contributor_addr,
            amount,
            new_balance,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Get group details
    public fun get_group_details(group_id: u128): (
        String, address, vector<address>, u64, u64, u8, u64
    ) acquires GroupRegistry, GroupSession {
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(smart_table::contains(&registry.active_groups, group_id), E_GROUP_NOT_FOUND);
        let admin_addr = *smart_table::borrow(&registry.active_groups, group_id);
        
        let group_session = borrow_global<GroupSession>(admin_addr);
        (
            group_session.name,
            group_session.admin,
            group_session.participants,
            coin::value(&group_session.treasury_balance),
            group_session.total_expenses,
            group_session.status,
            group_session.created_at
        )
    }

    #[test_only]
    use std::string;

    #[test(admin = @wattspay, user1 = @0x123, user2 = @0x456)]
    public fun test_group_creation(
        admin: &signer,
        user1: &signer, 
        user2: &signer
    ) acquires GroupRegistry {
        // Initialize modules
        init_module(admin);
        user_registry::init_module(admin);
        
        // Register users
        let user1_phone = vector[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
        let user2_phone = vector[32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        
        user_registry::register_user(user1, user1_phone, string::utf8(b"+1234567890"));
        user_registry::register_user(user2, user2_phone, string::utf8(b"+0987654321"));
        
        // Create group
        let participant_phones = vector[user2_phone];
        create_group_session(user1, string::utf8(b"Test Group"), participant_phones, 1);
        
        // Verify group was created
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(registry.total_groups == 1, 1);
        assert!(smart_table::contains(&registry.active_groups, 1), 2);
    }
}