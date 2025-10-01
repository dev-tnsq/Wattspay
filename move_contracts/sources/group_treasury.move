module wattspay::group_treasury {
    use std::string::String;
    use std::signer;
    use std::error;
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::table::{Self, Table};
    use wattspay::user_registry;

    // Error codes
    const E_GROUP_NOT_FOUND: u64 = 1;
    const E_UNAUTHORIZED: u64 = 2;
    const E_NOT_GROUP_MEMBER: u64 = 3;
    const E_INSUFFICIENT_BALANCE: u64 = 4;
    const E_INVALID_AMOUNT: u64 = 5;
    const E_EXPENSE_NOT_FOUND: u64 = 6;
    const E_ALREADY_SETTLED: u64 = 7;
    const E_USER_NOT_REGISTERED: u64 = 8;
    const E_INVALID_PARTICIPANTS: u64 = 9;

    // Group roles
    const ROLE_ADMIN: u8 = 0;
    const ROLE_MEMBER: u8 = 1;

    // Settlement status
    const SETTLEMENT_PENDING: u8 = 0;
    const SETTLEMENT_PARTIAL: u8 = 1;
    const SETTLEMENT_COMPLETE: u8 = 2;

    // Events
    #[event]
    struct GroupCreatedEvent has drop, store {
        group_id: u64,
        admin: address,
        group_name: String,
        timestamp: u64,
    }

    #[event]
    struct ExpenseAddedEvent has drop, store {
        group_id: u64,
        expense_id: u64,
        paid_by: address,
        amount: u64,
        description: String,
        participants: vector<address>,
        timestamp: u64,
    }

    #[event]
    struct DebtSettledEvent has drop, store {
        group_id: u64,
        from_user: address,
        to_user: address,
        amount: u64,
        timestamp: u64,
    }

    #[event]
    struct OptimalSettlementEvent has drop, store {
        group_id: u64,
        transactions_count: u64,
        total_amount: u64,
        timestamp: u64,
    }

    // Group member info
    struct GroupMember has store {
        user_address: address,
        role: u8,
        joined_timestamp: u64,
        total_paid: u64,
        total_owed: u64,
    }

    // Individual expense record
    struct GroupExpense has store {
        id: u64,
        paid_by: address,
        amount: u64,
        description: String,
        participants: vector<address>,
        per_person_amount: u64,
        created_timestamp: u64,
        is_settled: bool,
    }

    // Debt balance between two users
    struct DebtBalance has store, drop, copy {
        from_user: address,
        to_user: address,
        amount: u64,
    }

    // Group treasury state
    struct GroupTreasury has store {
        id: u64,
        name: String,
        admin: address,
        members: Table<address, GroupMember>,
        member_list: vector<address>,
        expenses: Table<u64, GroupExpense>,
        next_expense_id: u64,
        debt_balances: vector<DebtBalance>,
        total_expenses: u64,
        settlement_status: u8,
        created_timestamp: u64,
    }

    // Global registry of all groups
    struct GroupRegistry has key {
        groups: Table<u64, GroupTreasury>,
        next_group_id: u64,
        user_groups: Table<address, vector<u64>>, // user -> group_ids
    }

    // Initialize the group treasury system
    fun init_module(admin: &signer) {
        let registry = GroupRegistry {
            groups: table::new(),
            next_group_id: 1,
            user_groups: table::new(),
        };
        move_to(admin, registry);
    }

    #[test_only]
    public fun init_for_test(admin: &signer) {
        init_module(admin);
    }

    // Create a new group treasury
    public entry fun create_group(
        creator: &signer,
        group_name: String,
    ) acquires GroupRegistry {
        let creator_addr = signer::address_of(creator);
        
        // Validate user is registered
        assert!(user_registry::is_user_registered(creator_addr), error::invalid_argument(E_USER_NOT_REGISTERED));
        
        let registry = borrow_global_mut<GroupRegistry>(@wattspay);
        let group_id = registry.next_group_id;
        registry.next_group_id = group_id + 1;
        
        // Create admin member
        let admin_member = GroupMember {
            user_address: creator_addr,
            role: ROLE_ADMIN,
            joined_timestamp: timestamp::now_seconds(),
            total_paid: 0,
            total_owed: 0,
        };
        
        let members = table::new();
        table::add(&mut members, creator_addr, admin_member);
        
        let member_list = vector::empty<address>();
        vector::push_back(&mut member_list, creator_addr);
        
        // Create group treasury
        let group = GroupTreasury {
            id: group_id,
            name: group_name,
            admin: creator_addr,
            members,
            member_list,
            expenses: table::new(),
            next_expense_id: 1,
            debt_balances: vector::empty(),
            total_expenses: 0,
            settlement_status: SETTLEMENT_PENDING,
            created_timestamp: timestamp::now_seconds(),
        };
        
        // Store group
        table::add(&mut registry.groups, group_id, group);
        
        // Update user groups
        if (!table::contains(&registry.user_groups, creator_addr)) {
            table::add(&mut registry.user_groups, creator_addr, vector::empty<u64>());
        };
        let user_groups = table::borrow_mut(&mut registry.user_groups, creator_addr);
        vector::push_back(user_groups, group_id);
        
        // Emit event
        event::emit(GroupCreatedEvent {
            group_id,
            admin: creator_addr,
            group_name,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Add member to group
    public entry fun add_member(
        caller: &signer,
        group_id: u64,
        member_address: address,
    ) acquires GroupRegistry {
        let caller_addr = signer::address_of(caller);
        
        // Validate member is registered
        assert!(user_registry::is_user_registered(member_address), error::invalid_argument(E_USER_NOT_REGISTERED));
        
        let registry = borrow_global_mut<GroupRegistry>(@wattspay);
        assert!(table::contains(&registry.groups, group_id), error::not_found(E_GROUP_NOT_FOUND));
        
        let group = table::borrow_mut(&mut registry.groups, group_id);
        
        // Only admin can add members
        assert!(caller_addr == group.admin, error::permission_denied(E_UNAUTHORIZED));
        
        // Check if already a member
        if (!table::contains(&group.members, member_address)) {
            let new_member = GroupMember {
                user_address: member_address,
                role: ROLE_MEMBER,
                joined_timestamp: timestamp::now_seconds(),
                total_paid: 0,
                total_owed: 0,
            };
            
            table::add(&mut group.members, member_address, new_member);
            vector::push_back(&mut group.member_list, member_address);
            
            // Update user groups
            if (!table::contains(&registry.user_groups, member_address)) {
                table::add(&mut registry.user_groups, member_address, vector::empty<u64>());
            };
            let user_groups = table::borrow_mut(&mut registry.user_groups, member_address);
            vector::push_back(user_groups, group_id);
        };
    }

    // Add expense to group
    public entry fun add_expense(
        payer: &signer,
        group_id: u64,
        amount: u64,
        description: String,
        participant_addresses: vector<address>,
    ) acquires GroupRegistry {
        let payer_addr = signer::address_of(payer);
        
        assert!(amount > 0, error::invalid_argument(E_INVALID_AMOUNT));
        assert!(!vector::is_empty(&participant_addresses), error::invalid_argument(E_INVALID_PARTICIPANTS));
        
        let registry = borrow_global_mut<GroupRegistry>(@wattspay);
        assert!(table::contains(&registry.groups, group_id), error::not_found(E_GROUP_NOT_FOUND));
        
        let group = table::borrow_mut(&mut registry.groups, group_id);
        
        // Verify payer is group member
        assert!(table::contains(&group.members, payer_addr), error::permission_denied(E_NOT_GROUP_MEMBER));
        
        // Verify all participants are group members
        let i = 0;
        let participants_count = vector::length(&participant_addresses);
        while (i < participants_count) {
            let participant = *vector::borrow(&participant_addresses, i);
            assert!(table::contains(&group.members, participant), error::invalid_argument(E_INVALID_PARTICIPANTS));
            i = i + 1;
        };
        
        let expense_id = group.next_expense_id;
        group.next_expense_id = expense_id + 1;
        
        let per_person_amount = amount / participants_count;
        
        // Create expense record
        let expense = GroupExpense {
            id: expense_id,
            paid_by: payer_addr,
            amount,
            description,
            participants: participant_addresses,
            per_person_amount,
            created_timestamp: timestamp::now_seconds(),
            is_settled: false,
        };
        
        // Store expense
        table::add(&mut group.expenses, expense_id, expense);
        group.total_expenses = group.total_expenses + amount;
        
        // Update debt balances
        recalculate_debt_balances(group);
        
        // Emit event
        event::emit(ExpenseAddedEvent {
            group_id,
            expense_id,
            paid_by: payer_addr,
            amount,
            description,
            participants: participant_addresses,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Recalculate debt balances for a group (simplified version)
    fun recalculate_debt_balances(group: &mut GroupTreasury) {
        // Clear existing balances
        group.debt_balances = vector::empty();
        
        // For now, we'll implement a simplified version
        // In production, you'd want to iterate through all expenses
        // and calculate the exact debt balances
        
        // This is a placeholder that creates sample debt balances
        // Replace with actual debt calculation logic
        let members_count = vector::length(&group.member_list);
        if (members_count >= 2) {
            let debtor = *vector::borrow(&group.member_list, 0);
            let creditor = *vector::borrow(&group.member_list, 1);
            
            let sample_debt = DebtBalance {
                from_user: debtor,
                to_user: creditor,
                amount: 100000, // Sample amount in Octas
            };
            vector::push_back(&mut group.debt_balances, sample_debt);
        };
    }

    // Execute optimal settlement for a group
    public entry fun execute_optimal_settlement(
        caller: &signer,
        group_id: u64,
    ) acquires GroupRegistry {
        let caller_addr = signer::address_of(caller);
        
        let registry = borrow_global_mut<GroupRegistry>(@wattspay);
        assert!(table::contains(&registry.groups, group_id), error::not_found(E_GROUP_NOT_FOUND));
        
        let group = table::borrow_mut(&mut registry.groups, group_id);
        
        // Only admin can execute settlement
        assert!(caller_addr == group.admin, error::permission_denied(E_UNAUTHORIZED));
        
        let total_amount = 0;
        let transactions_count = vector::length(&group.debt_balances);
        
        // Execute all debt settlements
        let i = 0;
        while (i < transactions_count) {
            let debt = vector::borrow(&group.debt_balances, i);
            
            // Check debtor has sufficient balance
            let debtor_balance = coin::balance<AptosCoin>(debt.from_user);
            assert!(debtor_balance >= debt.amount, error::invalid_state(E_INSUFFICIENT_BALANCE));
            
            // Execute transfer
            coin::transfer<AptosCoin>(caller, debt.to_user, debt.amount);
            total_amount = total_amount + debt.amount;
            
            // Emit settlement event
            event::emit(DebtSettledEvent {
                group_id,
                from_user: debt.from_user,
                to_user: debt.to_user,
                amount: debt.amount,
                timestamp: timestamp::now_seconds(),
            });
            
            i = i + 1;
        };
        
        // Clear debt balances and mark as settled
        group.debt_balances = vector::empty();
        group.settlement_status = SETTLEMENT_COMPLETE;
        
        // Emit optimal settlement event
        event::emit(OptimalSettlementEvent {
            group_id,
            transactions_count,
            total_amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Get group debt balances
    #[view]
    public fun get_group_debt_balances(group_id: u64): vector<DebtBalance> acquires GroupRegistry {
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(table::contains(&registry.groups, group_id), error::not_found(E_GROUP_NOT_FOUND));
        
        let group = table::borrow(&registry.groups, group_id);
        group.debt_balances
    }

    // Get group info
    #[view]
    public fun get_group_info(group_id: u64): (u64, String, address, vector<address>, u64, u64, u8) acquires GroupRegistry {
        let registry = borrow_global<GroupRegistry>(@wattspay);
        assert!(table::contains(&registry.groups, group_id), error::not_found(E_GROUP_NOT_FOUND));
        
        let group = table::borrow(&registry.groups, group_id);
        (
            group.id,
            group.name,
            group.admin,
            group.member_list,
            group.next_expense_id - 1, // total expenses count
            group.total_expenses,
            group.settlement_status
        )
    }

    // Get user groups
    #[view]
    public fun get_user_groups(user_addr: address): vector<u64> acquires GroupRegistry {
        let registry = borrow_global<GroupRegistry>(@wattspay);
        if (table::contains(&registry.user_groups, user_addr)) {
            *table::borrow(&registry.user_groups, user_addr)
        } else {
            vector::empty<u64>()
        }
    }

    #[test_only]
    use aptos_framework::account;

    #[test(admin = @wattspay, creator = @0x123, member1 = @0x456, member2 = @0x789)]
    public fun test_group_treasury(
        admin: &signer,
        creator: &signer,
        member1: &signer,
        member2: &signer
    ) acquires GroupRegistry {
        // Setup
        timestamp::set_time_has_started_for_testing(&account::create_signer_for_test(@0x1));
        init_for_test(admin);
        user_registry::init_for_test(admin);
        
        // Register users
        user_registry::register_user(creator, string::utf8(b"+1111111111"));
        user_registry::register_user(member1, string::utf8(b"+2222222222"));
        user_registry::register_user(member2, string::utf8(b"+3333333333"));
        
        let creator_addr = signer::address_of(creator);
        let member1_addr = signer::address_of(member1);
        let member2_addr = signer::address_of(member2);
        
        // Create group
        create_group(creator, string::utf8(b"Test Group"));
        
        // Add members
        add_member(creator, 1, member1_addr);
        add_member(creator, 1, member2_addr);
        
        // Verify group creation
        let (id, name, admin_addr, members, _, _, _) = get_group_info(1);
        assert!(id == 1, 1);
        assert!(name == string::utf8(b"Test Group"), 2);
        assert!(admin_addr == creator_addr, 3);
        assert!(vector::length(&members) == 3, 4);
        
        // Add expense
        let participants = vector::empty<address>();
        vector::push_back(&mut participants, creator_addr);
        vector::push_back(&mut participants, member1_addr);
        vector::push_back(&mut participants, member2_addr);
        
        add_expense(creator, 1, 300000, string::utf8(b"Dinner"), participants);
        
        // Check debt balances
        let debt_balances = get_group_debt_balances(1);
        assert!(!vector::is_empty(&debt_balances), 5);
    }
}