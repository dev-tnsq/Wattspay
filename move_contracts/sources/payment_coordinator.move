module wattspay::payment_coordinator {
    use std::string::{Self, String};
    use std::signer;
    use std::error;
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_std::table::{Self, Table};
    use wattspay::user_registry;

    // Error codes
    const E_INSUFFICIENT_BALANCE: u64 = 1;
    const E_INVALID_AMOUNT: u64 = 2;
    const E_PAYMENT_NOT_FOUND: u64 = 3;
    const E_UNAUTHORIZED: u64 = 4;
    const E_USER_NOT_REGISTERED: u64 = 5;
    const E_INVALID_RECIPIENT: u64 = 6;
    const E_PAYMENT_ALREADY_PROCESSED: u64 = 7;

    // Payment status
    const PAYMENT_PENDING: u8 = 0;
    const PAYMENT_COMPLETED: u8 = 1;
    const PAYMENT_FAILED: u8 = 2;
    const PAYMENT_REFUNDED: u8 = 3;

    // Events
    #[event]
    struct PaymentInitiatedEvent has drop, store {
        payment_id: u64,
        sender: address,
        recipient: address,
        amount: u64,
        message: String,
        timestamp: u64,
    }

    #[event]
    struct PaymentCompletedEvent has drop, store {
        payment_id: u64,
        sender: address,
        recipient: address,
        amount: u64,
        timestamp: u64,
    }

    #[event]
    struct PaymentRefundedEvent has drop, store {
        payment_id: u64,
        original_sender: address,
        refund_amount: u64,
        timestamp: u64,
    }

    // Payment record
    struct PaymentRecord has store {
        id: u64,
        sender: address,
        recipient: address,
        amount: u64,
        message: String,
        status: u8,
        created_timestamp: u64,
        completed_timestamp: u64,
        transaction_hash: String,
    }

    // Payment coordinator state
    struct PaymentCoordinator has key {
        next_payment_id: u64,
        payments: Table<u64, PaymentRecord>,
        user_payments: Table<address, vector<u64>>, // user -> payment_ids
        platform_fee_rate: u64, // basis points (e.g., 25 = 0.25%)
        platform_balance: u64,
    }

    // Initialize the payment coordinator
    fun init_module(admin: &signer) {
        let coordinator = PaymentCoordinator {
            next_payment_id: 1,
            payments: table::new(),
            user_payments: table::new(),
            platform_fee_rate: 25, // 0.25% platform fee
            platform_balance: 0,
        };
        move_to(admin, coordinator);
    }

    #[test_only]
    public fun init_for_test(admin: &signer) {
        init_module(admin);
    }

    // Initiate a payment using phone numbers
    public entry fun send_payment_by_phone(
        sender: &signer,
        recipient_phone: String,
        amount: u64,
        message: String,
    ) acquires PaymentCoordinator {
        let sender_addr = signer::address_of(sender);
        
        // Validate sender is registered
        assert!(user_registry::is_user_registered(sender_addr), error::invalid_argument(E_USER_NOT_REGISTERED));
        
        // Get recipient address from phone
        let recipient_addr = user_registry::get_user_address_by_phone(recipient_phone);
        assert!(user_registry::is_user_registered(recipient_addr), error::invalid_argument(E_INVALID_RECIPIENT));
        
        // Execute payment
        send_payment_internal(sender, recipient_addr, amount, message);
    }

    // Initiate a payment using addresses directly
    public entry fun send_payment(
        sender: &signer,
        recipient_addr: address,
        amount: u64,
        message: String,
    ) acquires PaymentCoordinator {
        let sender_addr = signer::address_of(sender);
        
        // Validate both users are registered
        assert!(user_registry::is_user_registered(sender_addr), error::invalid_argument(E_USER_NOT_REGISTERED));
        assert!(user_registry::is_user_registered(recipient_addr), error::invalid_argument(E_INVALID_RECIPIENT));
        
        send_payment_internal(sender, recipient_addr, amount, message);
    }

    // Internal payment logic
    fun send_payment_internal(
        sender: &signer,
        recipient_addr: address,
        amount: u64,
        message: String,
    ) acquires PaymentCoordinator {
        let sender_addr = signer::address_of(sender);
        
        // Validate amount
        assert!(amount > 0, error::invalid_argument(E_INVALID_AMOUNT));
        
        // Check sender balance
        let sender_balance = coin::balance<AptosCoin>(sender_addr);
        assert!(sender_balance >= amount, error::invalid_state(E_INSUFFICIENT_BALANCE));
        
        let coordinator = borrow_global_mut<PaymentCoordinator>(@wattspay);
        let payment_id = coordinator.next_payment_id;
        coordinator.next_payment_id = payment_id + 1;
        
        // Calculate platform fee
        let platform_fee = (amount * coordinator.platform_fee_rate) / 10000;
        let recipient_amount = amount - platform_fee;
        
        // Create payment record
        let payment_record = PaymentRecord {
            id: payment_id,
            sender: sender_addr,
            recipient: recipient_addr,
            amount,
            message,
            status: PAYMENT_PENDING,
            created_timestamp: timestamp::now_seconds(),
            completed_timestamp: 0,
            transaction_hash: string::utf8(b""),
        };
        
        // Store payment record
        table::add(&mut coordinator.payments, payment_id, payment_record);
        
        // Update user payment history
        if (!table::contains(&coordinator.user_payments, sender_addr)) {
            table::add(&mut coordinator.user_payments, sender_addr, vector::empty<u64>());
        };
        let sender_payments = table::borrow_mut(&mut coordinator.user_payments, sender_addr);
        vector::push_back(sender_payments, payment_id);
        
        if (!table::contains(&coordinator.user_payments, recipient_addr)) {
            table::add(&mut coordinator.user_payments, recipient_addr, vector::empty<u64>());
        };
        let recipient_payments = table::borrow_mut(&mut coordinator.user_payments, recipient_addr);
        vector::push_back(recipient_payments, payment_id);
        
        // Emit initiation event
        event::emit(PaymentInitiatedEvent {
            payment_id,
            sender: sender_addr,
            recipient: recipient_addr,
            amount,
            message,
            timestamp: timestamp::now_seconds(),
        });
        
        // Execute the actual transfer
        coin::transfer<AptosCoin>(sender, recipient_addr, recipient_amount);
        
        // Transfer platform fee to coordinator
        if (platform_fee > 0) {
            coin::transfer<AptosCoin>(sender, @wattspay, platform_fee);
            coordinator.platform_balance = coordinator.platform_balance + platform_fee;
        };
        
        // Update payment status
        let payment = table::borrow_mut(&mut coordinator.payments, payment_id);
        payment.status = PAYMENT_COMPLETED;
        payment.completed_timestamp = timestamp::now_seconds();
        
        // Emit completion event
        event::emit(PaymentCompletedEvent {
            payment_id,
            sender: sender_addr,
            recipient: recipient_addr,
            amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Refund a payment (admin only, for disputes)
    public entry fun refund_payment(
        admin: &signer,
        payment_id: u64,
    ) acquires PaymentCoordinator {
        assert!(signer::address_of(admin) == @wattspay, error::permission_denied(E_UNAUTHORIZED));
        
        let coordinator = borrow_global_mut<PaymentCoordinator>(@wattspay);
        assert!(table::contains(&coordinator.payments, payment_id), error::not_found(E_PAYMENT_NOT_FOUND));
        
        let payment = table::borrow_mut(&mut coordinator.payments, payment_id);
        assert!(payment.status == PAYMENT_COMPLETED, error::invalid_state(E_PAYMENT_ALREADY_PROCESSED));
        
        // Calculate refund amount (original amount minus platform fee)
        let platform_fee = (payment.amount * coordinator.platform_fee_rate) / 10000;
        let refund_amount = payment.amount - platform_fee;
        
        // Execute refund
        coin::transfer<AptosCoin>(admin, payment.sender, refund_amount);
        
        // Update payment status
        payment.status = PAYMENT_REFUNDED;
        
        // Emit refund event
        event::emit(PaymentRefundedEvent {
            payment_id,
            original_sender: payment.sender,
            refund_amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Get payment details
    #[view]
    public fun get_payment(payment_id: u64): (u64, address, address, u64, String, u8, u64, u64) acquires PaymentCoordinator {
        let coordinator = borrow_global<PaymentCoordinator>(@wattspay);
        assert!(table::contains(&coordinator.payments, payment_id), error::not_found(E_PAYMENT_NOT_FOUND));
        
        let payment = table::borrow(&coordinator.payments, payment_id);
        (
            payment.id,
            payment.sender,
            payment.recipient,
            payment.amount,
            payment.message,
            payment.status,
            payment.created_timestamp,
            payment.completed_timestamp
        )
    }

    // Get user payment history
    #[view]
    public fun get_user_payments(user_addr: address): vector<u64> acquires PaymentCoordinator {
        let coordinator = borrow_global<PaymentCoordinator>(@wattspay);
        if (table::contains(&coordinator.user_payments, user_addr)) {
            *table::borrow(&coordinator.user_payments, user_addr)
        } else {
            vector::empty<u64>()
        }
    }

    // Get platform statistics
    #[view]
    public fun get_platform_stats(): (u64, u64, u64) acquires PaymentCoordinator {
        let coordinator = borrow_global<PaymentCoordinator>(@wattspay);
        (
            coordinator.next_payment_id - 1, // total payments
            coordinator.platform_fee_rate,
            coordinator.platform_balance
        )
    }

    // Update platform fee (admin only)
    public entry fun update_platform_fee(
        admin: &signer,
        new_fee_rate: u64,
    ) acquires PaymentCoordinator {
        assert!(signer::address_of(admin) == @wattspay, error::permission_denied(E_UNAUTHORIZED));
        assert!(new_fee_rate <= 1000, error::invalid_argument(E_INVALID_AMOUNT)); // Max 10%
        
        let coordinator = borrow_global_mut<PaymentCoordinator>(@wattspay);
        coordinator.platform_fee_rate = new_fee_rate;
    }

    #[test_only]
    use aptos_framework::account;

    #[test(admin = @wattspay, sender = @0x123, recipient = @0x456)]
    public fun test_payment_flow(admin: &signer, sender: &signer, recipient: &signer) acquires PaymentCoordinator {
        // Setup
        timestamp::set_time_has_started_for_testing(&account::create_signer_for_test(@0x1));
        init_for_test(admin);
        
        // Initialize user registry
        user_registry::init_for_test(admin);
        
        // Register users
        user_registry::register_user(sender, string::utf8(b"+1111111111"));
        user_registry::register_user(recipient, string::utf8(b"+2222222222"));
        
        let sender_addr = signer::address_of(sender);
        let recipient_addr = signer::address_of(recipient);
        
        // Test registry functionality
        assert!(user_registry::is_user_registered(sender_addr), 1);
        assert!(user_registry::is_user_registered(recipient_addr), 2);
        
        // Get platform statistics
        let (payment_count, fee_rate, balance) = get_platform_stats();
        assert!(payment_count == 0, 3);
        assert!(fee_rate == 25, 4);
        assert!(balance == 0, 5);
    }
}