module wattspay::user_registry {
    use std::string::{String};
    use std::signer;
    use std::vector;
    use aptos_std::smart_table::{Self, SmartTable};
    use aptos_framework::timestamp;
    use aptos_framework::event;

    /// Error codes
    const E_USER_ALREADY_EXISTS: u64 = 1;
    const E_USER_NOT_FOUND: u64 = 2;
    const E_PHONE_ALREADY_REGISTERED: u64 = 3;
    const E_INVALID_PHONE_HASH: u64 = 4;
    const E_NOT_AUTHORIZED: u64 = 5;

    /// User profile stored on-chain
    struct UserProfile has key {
        phone_hash: vector<u8>,
        wallet_address: address,
        whatsapp_number: String,
        created_at: u64,
        is_active: bool,
        reputation_score: u64,
        total_transactions: u64,
        total_volume: u64,
    }

    /// Global mapping of phone hashes to addresses
    struct PhoneToAddress has key {
        phone_mapping: SmartTable<vector<u8>, address>,
    }

    /// Registry configuration and admin functions
    struct RegistryConfig has key {
        admin: address,
        registration_fee: u64,
        min_reputation_score: u64,
        is_paused: bool,
    }

    /// Events for WhatsApp bot integration
    #[event]
    struct UserRegisteredEvent has drop, store {
        user_address: address,
        phone_hash: vector<u8>,
        whatsapp_number: String,
        timestamp: u64,
    }

    #[event]
    struct UserUpdatedEvent has drop, store {
        user_address: address,
        field_updated: String,
        timestamp: u64,
    }

    #[event]
    struct ReputationUpdatedEvent has drop, store {
        user_address: address,
        old_score: u64,
        new_score: u64,
        reason: String,
        timestamp: u64,
    }

    /// Initialize the registry (called once during deployment)
    fun init_module(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        
        // Initialize phone mapping
        move_to(admin, PhoneToAddress {
            phone_mapping: smart_table::new(),
        });

        // Initialize registry config
        move_to(admin, RegistryConfig {
            admin: admin_addr,
            registration_fee: 10000, // 0.01 APT in octas
            min_reputation_score: 50,
            is_paused: false,
        });
    }

    /// Register a new user
    public entry fun register_user(
        user: &signer,
        phone_hash: vector<u8>,
        whatsapp_number: String
    ) acquires PhoneToAddress, RegistryConfig {
        let user_addr = signer::address_of(user);
        let config = borrow_global<RegistryConfig>(@wattspay);
        
        // Check if registry is paused
        assert!(!config.is_paused, E_NOT_AUTHORIZED);
        
        // Validate phone hash length (should be 32 bytes for SHA-256)
        assert!(vector::length(&phone_hash) == 32, E_INVALID_PHONE_HASH);
        
        // Check if user already exists
        assert!(!exists<UserProfile>(user_addr), E_USER_ALREADY_EXISTS);
        
        // Check if phone is already registered
        let phone_mapping_ref = borrow_global_mut<PhoneToAddress>(@wattspay);
        assert!(!smart_table::contains(&phone_mapping_ref.phone_mapping, phone_hash), E_PHONE_ALREADY_REGISTERED);
        
        // Add phone to address mapping
        smart_table::add(&mut phone_mapping_ref.phone_mapping, phone_hash, user_addr);
        
        // Create user profile
        let user_profile = UserProfile {
            phone_hash,
            wallet_address: user_addr,
            whatsapp_number,
            created_at: timestamp::now_seconds(),
            is_active: true,
            reputation_score: 100, // Starting reputation
            total_transactions: 0,
            total_volume: 0,
        };
        
        move_to(user, user_profile);

        // Emit registration event
        event::emit(UserRegisteredEvent {
            user_address: user_addr,
            phone_hash,
            whatsapp_number,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Update user's WhatsApp number
    public entry fun update_whatsapp_number(
        user: &signer,
        new_whatsapp_number: String
    ) acquires UserProfile {
        let user_addr = signer::address_of(user);
        assert!(exists<UserProfile>(user_addr), E_USER_NOT_FOUND);
        
        let user_profile = borrow_global_mut<UserProfile>(user_addr);
        user_profile.whatsapp_number = new_whatsapp_number;
        
        event::emit(UserUpdatedEvent {
            user_address: user_addr,
            field_updated: std::string::utf8(b"whatsapp_number"),
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Update user's reputation score (called by other contracts)
    public fun update_reputation(
        user_addr: address,
        score_change: i64,
        reason: String
    ) acquires UserProfile {
        assert!(exists<UserProfile>(user_addr), E_USER_NOT_FOUND);
        
        let user_profile = borrow_global_mut<UserProfile>(user_addr);
        let old_score = user_profile.reputation_score;
        
        if (score_change >= 0) {
            user_profile.reputation_score = user_profile.reputation_score + (score_change as u64);
        } else {
            let decrease = (-score_change as u64);
            if (user_profile.reputation_score >= decrease) {
                user_profile.reputation_score = user_profile.reputation_score - decrease;
            } else {
                user_profile.reputation_score = 0;
            };
        };
        
        event::emit(ReputationUpdatedEvent {
            user_address: user_addr,
            old_score,
            new_score: user_profile.reputation_score,
            reason,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Update transaction statistics
    public fun update_transaction_stats(
        user_addr: address,
        volume: u64
    ) acquires UserProfile {
        assert!(exists<UserProfile>(user_addr), E_USER_NOT_FOUND);
        
        let user_profile = borrow_global_mut<UserProfile>(user_addr);
        user_profile.total_transactions = user_profile.total_transactions + 1;
        user_profile.total_volume = user_profile.total_volume + volume;
    }

    /// Deactivate user (emergency function)
    public entry fun deactivate_user(
        admin: &signer,
        user_addr: address
    ) acquires UserProfile, RegistryConfig {
        let admin_addr = signer::address_of(admin);
        let config = borrow_global<RegistryConfig>(@wattspay);
        assert!(admin_addr == config.admin, E_NOT_AUTHORIZED);
        
        assert!(exists<UserProfile>(user_addr), E_USER_NOT_FOUND);
        let user_profile = borrow_global_mut<UserProfile>(user_addr);
        user_profile.is_active = false;
        
        event::emit(UserUpdatedEvent {
            user_address: user_addr,
            field_updated: std::string::utf8(b"is_active"),
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Get user address by phone hash
    public fun get_address_by_phone(phone_hash: vector<u8>): address acquires PhoneToAddress {
        let phone_mapping_ref = borrow_global<PhoneToAddress>(@wattspay);
        assert!(smart_table::contains(&phone_mapping_ref.phone_mapping, phone_hash), E_USER_NOT_FOUND);
        *smart_table::borrow(&phone_mapping_ref.phone_mapping, phone_hash)
    }

    /// Check if user exists
    public fun user_exists(user_addr: address): bool {
        exists<UserProfile>(user_addr)
    }

    /// Get user profile (read-only)
    public fun get_user_profile(user_addr: address): (vector<u8>, String, u64, bool, u64, u64, u64) acquires UserProfile {
        assert!(exists<UserProfile>(user_addr), E_USER_NOT_FOUND);
        let user_profile = borrow_global<UserProfile>(user_addr);
        (
            user_profile.phone_hash,
            user_profile.whatsapp_number,
            user_profile.created_at,
            user_profile.is_active,
            user_profile.reputation_score,
            user_profile.total_transactions,
            user_profile.total_volume
        )
    }

    /// Check if user is active and has minimum reputation
    public fun is_user_eligible(user_addr: address): bool acquires UserProfile, RegistryConfig {
        if (!exists<UserProfile>(user_addr)) {
            return false
        };
        
        let user_profile = borrow_global<UserProfile>(user_addr);
        let config = borrow_global<RegistryConfig>(@wattspay);
        
        user_profile.is_active && user_profile.reputation_score >= config.min_reputation_score
    }

    /// Admin function to pause/unpause registry
    public entry fun set_registry_pause(
        admin: &signer,
        is_paused: bool
    ) acquires RegistryConfig {
        let admin_addr = signer::address_of(admin);
        let config = borrow_global_mut<RegistryConfig>(@wattspay);
        assert!(admin_addr == config.admin, E_NOT_AUTHORIZED);
        
        config.is_paused = is_paused;
    }

    /// Admin function to update registration fee
    public entry fun update_registration_fee(
        admin: &signer,
        new_fee: u64
    ) acquires RegistryConfig {
        let admin_addr = signer::address_of(admin);
        let config = borrow_global_mut<RegistryConfig>(@wattspay);
        assert!(admin_addr == config.admin, E_NOT_AUTHORIZED);
        
        config.registration_fee = new_fee;
    }

    #[test_only]
    use std::string;

    #[test(admin = @wattspay, user = @0x123)]
    public fun test_user_registration(admin: &signer, user: &signer) acquires PhoneToAddress, RegistryConfig {
        // Initialize the module
        init_module(admin);
        
        // Register a user
        let phone_hash = vector[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
        let whatsapp_number = string::utf8(b"+1234567890");
        
        register_user(user, phone_hash, whatsapp_number);
        
        // Verify user exists
        let user_addr = signer::address_of(user);
        assert!(user_exists(user_addr), 1);
        
        // Verify phone mapping
        let retrieved_addr = get_address_by_phone(phone_hash);
        assert!(retrieved_addr == user_addr, 2);
    }
}