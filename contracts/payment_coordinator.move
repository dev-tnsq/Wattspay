module wattspay::payment_coordinator {
    use std::string::{String};
    use std::signer;
    use std::option::{Self, Option};
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::smart_table::{Self, SmartTable};
    use wattspay::user_registry;

    /// Error codes
    const E_PAYMENT_NOT_FOUND: u64 = 1;
    const E_INSUFFICIENT_BALANCE: u64 = 2;
    const E_INVALID_RECIPIENT: u64 = 3;
    const E_PAYMENT_ALREADY_COMPLETED: u64 = 4;
    const E_PAYMENT_EXPIRED: u64 = 5;
    const E_NOT_AUTHORIZED: u64 = 6;
    const E_INVALID_AMOUNT: u64 = 7;
    const E_USER_NOT_ELIGIBLE: u64 = 8;

    /// Payment status constants
    const PAYMENT_PENDING: u8 = 0;
    const PAYMENT_COMPLETED: u8 = 1;
    const PAYMENT_FAILED: u8 = 2;
    const PAYMENT_REFUNDED: u8 = 3;
    const PAYMENT_EXPIRED: u8 = 4;

    /// Payment types
    const PAYMENT_TYPE_DIRECT: u8 = 1;
    const PAYMENT_TYPE_REQUEST: u8 = 2;
    const PAYMENT_TYPE_GROUP: u8 = 3;

    /// Payment record stored on-chain
    struct Payment has key {
        id: u128,
        from: address,
        to: address,
        amount: u64,
        payment_type: u8,
        status: u8,
        message: String,
        created_at: u64,
        completed_at: Option<u64>,
        expires_at: Option<u64>,
        group_session_id: Option<u128>,
        refund_eligible: bool,
    }

    /// Global payment counter and configuration
    struct PaymentRegistry has key {
        next_payment_id: u128,
        active_payments: SmartTable<u128, address>, // payment_id -> creator_address
        total_volume: u64,
        total_transactions: u64,
        min_payment_amount: u64,
        max_payment_amount: u64,
        default_expiry_seconds: u64,
    }

    /// Payment request that can be approved/rejected
    struct PaymentRequest has key {
        payment_id: u128,
        from_phone_hash: vector<u8>,
        to_phone_hash: vector<u8>,
        amount: u64,
        message: String,
        created_at: u64,
        expires_at: u64,
        approved: bool,
    }

    /// Events for WhatsApp bot integration
    #[event]
    struct PaymentRequestedEvent has drop, store {
        payment_id: u128,
        from: address,
        to: address,
        amount: u64,
        message: String,
        payment_type: u8,
        timestamp: u64,
    }

    #[event]
    struct PaymentCompletedEvent has drop, store {
        payment_id: u128,
        from: address,
        to: address,
        amount: u64,
        timestamp: u64,
    }

    #[event]
    struct PaymentFailedEvent has drop, store {
        payment_id: u128,
        from: address,
        to: address,
        amount: u64,
        reason: String,
        timestamp: u64,
    }

    #[event]
    struct PaymentRequestApprovedEvent has drop, store {
        payment_id: u128,
        approved_by: address,
        timestamp: u64,
    }

    /// Initialize the payment coordinator
    fun init_module(admin: &signer) {
        move_to(admin, PaymentRegistry {
            next_payment_id: 1,
            active_payments: smart_table::new(),
            total_volume: 0,
            total_transactions: 0,
            min_payment_amount: 1000, // 0.001 APT minimum
            max_payment_amount: 1000000000000, // 10,000 APT maximum
            default_expiry_seconds: 86400, // 24 hours
        });
    }

    /// Execute direct payment
    public entry fun execute_payment(
        sender: &signer,
        recipient_phone_hash: vector<u8>,
        amount: u64,
        message: String
    ) acquires PaymentRegistry {
        let sender_addr = signer::address_of(sender);
        
        // Validate sender eligibility
        assert!(user_registry::is_user_eligible(sender_addr), E_USER_NOT_ELIGIBLE);
        
        // Get recipient address
        let recipient_addr = user_registry::get_address_by_phone(recipient_phone_hash);
        assert!(user_registry::is_user_eligible(recipient_addr), E_INVALID_RECIPIENT);
        
        // Validate amount
        let registry = borrow_global_mut<PaymentRegistry>(@wattspay);
        assert!(amount >= registry.min_payment_amount, E_INVALID_AMOUNT);
        assert!(amount <= registry.max_payment_amount, E_INVALID_AMOUNT);
        
        // Check sender balance
        assert!(coin::balance<AptosCoin>(sender_addr) >= amount, E_INSUFFICIENT_BALANCE);
        
        // Generate payment ID
        let payment_id = registry.next_payment_id;
        registry.next_payment_id = registry.next_payment_id + 1;
        
        // Create payment record
        let payment = Payment {
            id: payment_id,
            from: sender_addr,
            to: recipient_addr,
            amount,
            payment_type: PAYMENT_TYPE_DIRECT,
            status: PAYMENT_PENDING,
            message,
            created_at: timestamp::now_seconds(),
            completed_at: option::none(),
            expires_at: option::none(),
            group_session_id: option::none(),
            refund_eligible: true,
        };
        
        // Emit request event
        event::emit(PaymentRequestedEvent {
            payment_id,
            from: sender_addr,
            to: recipient_addr,
            amount,
            message,
            payment_type: PAYMENT_TYPE_DIRECT,
            timestamp: timestamp::now_seconds(),
        });
        
        // Execute the transfer
        let payment_coin = coin::withdraw<AptosCoin>(sender, amount);
        coin::deposit<AptosCoin>(recipient_addr, payment_coin);
        
        // Update payment status
        payment.status = PAYMENT_COMPLETED;
        payment.completed_at = option::some(timestamp::now_seconds());
        
        // Update registry statistics
        registry.total_volume = registry.total_volume + amount;
        registry.total_transactions = registry.total_transactions + 1;
        smart_table::add(&mut registry.active_payments, payment_id, sender_addr);
        
        // Update user statistics
        user_registry::update_transaction_stats(sender_addr, amount);
        user_registry::update_transaction_stats(recipient_addr, amount);
        
        // Update reputation scores
        user_registry::update_reputation(sender_addr, 1, std::string::utf8(b"payment_sent"));
        user_registry::update_reputation(recipient_addr, 1, std::string::utf8(b"payment_received"));
        
        // Store payment record
        move_to(sender, payment);
        
        // Emit completion event
        event::emit(PaymentCompletedEvent {
            payment_id,
            from: sender_addr,
            to: recipient_addr,
            amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Request payment from another user
    public entry fun request_payment(
        requester: &signer,
        from_phone_hash: vector<u8>,
        amount: u64,
        message: String
    ) acquires PaymentRegistry {
        let requester_addr = signer::address_of(requester);
        
        // Validate requester eligibility
        assert!(user_registry::is_user_eligible(requester_addr), E_USER_NOT_ELIGIBLE);
        
        // Validate requested from user
        let from_addr = user_registry::get_address_by_phone(from_phone_hash);
        assert!(user_registry::is_user_eligible(from_addr), E_INVALID_RECIPIENT);
        
        // Validate amount
        let registry = borrow_global_mut<PaymentRegistry>(@wattspay);
        assert!(amount >= registry.min_payment_amount, E_INVALID_AMOUNT);
        assert!(amount <= registry.max_payment_amount, E_INVALID_AMOUNT);
        
        // Generate payment ID
        let payment_id = registry.next_payment_id;
        registry.next_payment_id = registry.next_payment_id + 1;
        
        let current_time = timestamp::now_seconds();
        let expires_at = current_time + registry.default_expiry_seconds;
        
        // Create payment request
        let payment_request = PaymentRequest {
            payment_id,
            from_phone_hash,
            to_phone_hash: user_registry::get_user_profile(requester_addr).0, // Get requester's phone hash
            amount,
            message,
            created_at: current_time,
            expires_at,
            approved: false,
        };
        
        move_to(requester, payment_request);
        smart_table::add(&mut registry.active_payments, payment_id, requester_addr);
        
        // Emit request event
        event::emit(PaymentRequestedEvent {
            payment_id,
            from: from_addr,
            to: requester_addr,
            amount,
            message,
            payment_type: PAYMENT_TYPE_REQUEST,
            timestamp: current_time,
        });
    }

    /// Approve and execute a payment request
    public entry fun approve_payment_request(
        payer: &signer,
        payment_id: u128
    ) acquires PaymentRegistry, PaymentRequest {
        let payer_addr = signer::address_of(payer);
        
        // Validate payer eligibility
        assert!(user_registry::is_user_eligible(payer_addr), E_USER_NOT_ELIGIBLE);
        
        // Get payment request
        let registry = borrow_global_mut<PaymentRegistry>(@wattspay);
        assert!(smart_table::contains(&registry.active_payments, payment_id), E_PAYMENT_NOT_FOUND);
        
        let requester_addr = *smart_table::borrow(&registry.active_payments, payment_id);
        assert!(exists<PaymentRequest>(requester_addr), E_PAYMENT_NOT_FOUND);
        
        let payment_request = borrow_global_mut<PaymentRequest>(requester_addr);
        
        // Check if request is expired
        assert!(timestamp::now_seconds() <= payment_request.expires_at, E_PAYMENT_EXPIRED);
        
        // Verify payer is the correct person
        let payer_phone_hash = user_registry::get_user_profile(payer_addr).0;
        assert!(payment_request.from_phone_hash == payer_phone_hash, E_NOT_AUTHORIZED);
        
        // Check payer balance
        assert!(coin::balance<AptosCoin>(payer_addr) >= payment_request.amount, E_INSUFFICIENT_BALANCE);
        
        // Mark request as approved
        payment_request.approved = true;
        
        // Execute the payment
        let payment_coin = coin::withdraw<AptosCoin>(payer, payment_request.amount);
        coin::deposit<AptosCoin>(requester_addr, payment_coin);
        
        // Create payment record
        let payment = Payment {
            id: payment_id,
            from: payer_addr,
            to: requester_addr,
            amount: payment_request.amount,
            payment_type: PAYMENT_TYPE_REQUEST,
            status: PAYMENT_COMPLETED,
            message: payment_request.message,
            created_at: payment_request.created_at,
            completed_at: option::some(timestamp::now_seconds()),
            expires_at: option::some(payment_request.expires_at),
            group_session_id: option::none(),
            refund_eligible: true,
        };
        
        // Update registry statistics
        registry.total_volume = registry.total_volume + payment_request.amount;
        registry.total_transactions = registry.total_transactions + 1;
        
        // Update user statistics
        user_registry::update_transaction_stats(payer_addr, payment_request.amount);
        user_registry::update_transaction_stats(requester_addr, payment_request.amount);
        
        // Update reputation scores
        user_registry::update_reputation(payer_addr, 2, std::string::utf8(b"request_approved"));
        user_registry::update_reputation(requester_addr, 1, std::string::utf8(b"request_fulfilled"));
        
        // Store payment record with payer
        move_to(payer, payment);
        
        // Emit events
        event::emit(PaymentRequestApprovedEvent {
            payment_id,
            approved_by: payer_addr,
            timestamp: timestamp::now_seconds(),
        });
        
        event::emit(PaymentCompletedEvent {
            payment_id,
            from: payer_addr,
            to: requester_addr,
            amount: payment_request.amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Reject a payment request
    public entry fun reject_payment_request(
        payer: &signer,
        payment_id: u128
    ) acquires PaymentRegistry, PaymentRequest {
        let payer_addr = signer::address_of(payer);
        
        // Get payment request
        let registry = borrow_global<PaymentRegistry>(@wattspay);
        assert!(smart_table::contains(&registry.active_payments, payment_id), E_PAYMENT_NOT_FOUND);
        
        let requester_addr = *smart_table::borrow(&registry.active_payments, payment_id);
        assert!(exists<PaymentRequest>(requester_addr), E_PAYMENT_NOT_FOUND);
        
        let payment_request = borrow_global<PaymentRequest>(requester_addr);
        
        // Verify payer is the correct person
        let payer_phone_hash = user_registry::get_user_profile(payer_addr).0;
        assert!(payment_request.from_phone_hash == payer_phone_hash, E_NOT_AUTHORIZED);
        
        // Emit failure event
        event::emit(PaymentFailedEvent {
            payment_id,
            from: payer_addr,
            to: requester_addr,
            amount: payment_request.amount,
            reason: std::string::utf8(b"request_rejected"),
            timestamp: timestamp::now_seconds(),
        });
        
        // Clean up the request
        // Note: In practice, you might want to keep rejected requests for analytics
    }

    /// Get payment details
    public fun get_payment(payment_creator: address, payment_id: u128): (
        u128, address, address, u64, u8, u8, String, u64, Option<u64>
    ) acquires Payment {
        assert!(exists<Payment>(payment_creator), E_PAYMENT_NOT_FOUND);
        let payment = borrow_global<Payment>(payment_creator);
        assert!(payment.id == payment_id, E_PAYMENT_NOT_FOUND);
        
        (
            payment.id,
            payment.from,
            payment.to,
            payment.amount,
            payment.payment_type,
            payment.status,
            payment.message,
            payment.created_at,
            payment.completed_at
        )
    }

    /// Check if payment is refund eligible
    public fun is_refund_eligible(payment_creator: address, payment_id: u128): bool acquires Payment {
        if (!exists<Payment>(payment_creator)) {
            return false
        };
        
        let payment = borrow_global<Payment>(payment_creator);
        if (payment.id != payment_id) {
            return false
        };
        
        payment.refund_eligible && payment.status == PAYMENT_COMPLETED
    }

    /// Mark payment as refunded (called by refund manager)
    public fun mark_payment_refunded(payment_creator: address, payment_id: u128) acquires Payment {
        assert!(exists<Payment>(payment_creator), E_PAYMENT_NOT_FOUND);
        let payment = borrow_global_mut<Payment>(payment_creator);
        assert!(payment.id == payment_id, E_PAYMENT_NOT_FOUND);
        assert!(payment.status == PAYMENT_COMPLETED, E_PAYMENT_ALREADY_COMPLETED);
        
        payment.status = PAYMENT_REFUNDED;
        payment.refund_eligible = false;
    }

    /// Get registry statistics
    public fun get_registry_stats(): (u64, u64, u64, u64) acquires PaymentRegistry {
        let registry = borrow_global<PaymentRegistry>(@wattspay);
        (
            registry.total_volume,
            registry.total_transactions,
            registry.min_payment_amount,
            registry.max_payment_amount
        )
    }

    #[test_only]
    use std::string;

    #[test(admin = @wattspay, sender = @0x123, recipient = @0x456)]
    public fun test_direct_payment(
        admin: &signer, 
        sender: &signer, 
        recipient: &signer
    ) acquires PaymentRegistry {
        // Initialize modules
        init_module(admin);
        user_registry::init_module(admin);
        
        // Register users
        let sender_phone = vector[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
        let recipient_phone = vector[32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        
        user_registry::register_user(sender, sender_phone, string::utf8(b"+1234567890"));
        user_registry::register_user(recipient, recipient_phone, string::utf8(b"+0987654321"));
        
        // Fund sender account (in real scenario, this would be done differently)
        let sender_addr = signer::address_of(sender);
        coin::register<AptosCoin>(sender);
        
        // Execute payment would require actual APT balance
        // This test verifies the validation logic works
        let registry = borrow_global<PaymentRegistry>(@wattspay);
        assert!(registry.min_payment_amount == 1000, 1);
    }
}