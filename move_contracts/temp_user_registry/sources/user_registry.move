module wattspay::user_registry {
    use std::string::{Self, String};
    use std::signer;
    use std::error;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};

    // Error codes
    const E_USER_ALREADY_EXISTS: u64 = 1;
    const E_USER_NOT_FOUND: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INVALID_PHONE: u64 = 4;

    // Events
    #[event]
    struct UserRegisteredEvent has drop, store {
        user_address: address,
        phone_number: String,
        timestamp: u64,
    }

    #[event]
    struct UserUpdatedEvent has drop, store {
        user_address: address,
        phone_number: String,
        timestamp: u64,
    }

    // User profile struct
    struct UserProfile has key {
        phone_number: String,
        aptos_address: address,
        registration_timestamp: u64,
        is_active: bool,
        whatsapp_verified: bool,
        reputation_score: u64,
    }

    // Registry to map phone numbers to addresses
    struct PhoneRegistry has key {
        phone_to_address: Table<String, address>,
    }

    // Initialize the registry (called once)
    fun init_module(admin: &signer) {
        let phone_registry = PhoneRegistry {
            phone_to_address: table::new(),
        };
        move_to(admin, phone_registry);
    }

    #[test_only]
    public fun init_for_test(admin: &signer) {
        init_module(admin);
    }

    // Register a new user
    public entry fun register_user(
        user: &signer,
        phone_number: String,
    ) acquires PhoneRegistry {
        let user_addr = signer::address_of(user);
        
        // Validate phone number format (basic validation)
        assert!(string::length(&phone_number) >= 10, error::invalid_argument(E_INVALID_PHONE));
        
        // Check if user already exists
        assert!(!exists<UserProfile>(user_addr), error::already_exists(E_USER_ALREADY_EXISTS));
        
        // Check if phone number is already registered
        let registry = borrow_global_mut<PhoneRegistry>(@wattspay);
        assert!(!table::contains(&registry.phone_to_address, phone_number), error::already_exists(E_USER_ALREADY_EXISTS));
        
        // Create user profile
        let user_profile = UserProfile {
            phone_number: phone_number,
            aptos_address: user_addr,
            registration_timestamp: timestamp::now_seconds(),
            is_active: true,
            whatsapp_verified: false,
            reputation_score: 100, // Starting reputation
        };
        
        // Store user profile
        move_to(user, user_profile);
        
        // Add to phone registry
        table::add(&mut registry.phone_to_address, phone_number, user_addr);
        
        // Emit event
        event::emit(UserRegisteredEvent {
            user_address: user_addr,
            phone_number,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Get user address by phone number
    #[view]
    public fun get_user_address_by_phone(phone_number: String): address acquires PhoneRegistry {
        let registry = borrow_global<PhoneRegistry>(@wattspay);
        assert!(table::contains(&registry.phone_to_address, phone_number), error::not_found(E_USER_NOT_FOUND));
        *table::borrow(&registry.phone_to_address, phone_number)
    }

    // Get user profile
    #[view]
    public fun get_user_profile(user_addr: address): (String, address, u64, bool, bool, u64) acquires UserProfile {
        assert!(exists<UserProfile>(user_addr), error::not_found(E_USER_NOT_FOUND));
        let profile = borrow_global<UserProfile>(user_addr);
        (
            profile.phone_number,
            profile.aptos_address,
            profile.registration_timestamp,
            profile.is_active,
            profile.whatsapp_verified,
            profile.reputation_score
        )
    }

    // Verify WhatsApp (only callable by admin or user themselves)
    public entry fun verify_whatsapp(
        caller: &signer,
        user_addr: address,
    ) acquires UserProfile {
        let caller_addr = signer::address_of(caller);
        
        // Only admin or user themselves can verify
        assert!(caller_addr == @wattspay || caller_addr == user_addr, error::permission_denied(E_UNAUTHORIZED));
        
        assert!(exists<UserProfile>(user_addr), error::not_found(E_USER_NOT_FOUND));
        let profile = borrow_global_mut<UserProfile>(user_addr);
        profile.whatsapp_verified = true;
        
        // Emit event
        event::emit(UserUpdatedEvent {
            user_address: user_addr,
            phone_number: profile.phone_number,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Update reputation score (only admin)
    public entry fun update_reputation(
        admin: &signer,
        user_addr: address,
        new_score: u64,
    ) acquires UserProfile {
        assert!(signer::address_of(admin) == @wattspay, error::permission_denied(E_UNAUTHORIZED));
        assert!(exists<UserProfile>(user_addr), error::not_found(E_USER_NOT_FOUND));
        
        let profile = borrow_global_mut<UserProfile>(user_addr);
        profile.reputation_score = new_score;
    }

    // Check if user is registered
    #[view]
    public fun is_user_registered(user_addr: address): bool {
        exists<UserProfile>(user_addr)
    }

    // Check if phone is registered
    #[view]
    public fun is_phone_registered(phone_number: String): bool acquires PhoneRegistry {
        let registry = borrow_global<PhoneRegistry>(@wattspay);
        table::contains(&registry.phone_to_address, phone_number)
    }

    #[test_only]
    use aptos_framework::account;

    #[test(admin = @wattspay, user = @0x123)]
    public fun test_user_registration(admin: &signer, user: &signer) acquires PhoneRegistry, UserProfile {
        // Setup
        timestamp::set_time_has_started_for_testing(&account::create_signer_for_test(@0x1));
        init_for_test(admin);
        
        // Register user
        register_user(user, string::utf8(b"+1234567890"));
        
        // Verify registration
        let user_addr = signer::address_of(user);
        assert!(is_user_registered(user_addr), 1);
        assert!(is_phone_registered(string::utf8(b"+1234567890")), 2);
        
        // Check user profile
        let (phone, addr, _, active, verified, score) = get_user_profile(user_addr);
        assert!(phone == string::utf8(b"+1234567890"), 3);
        assert!(addr == user_addr, 4);
        assert!(active == true, 5);
        assert!(verified == false, 6);
        assert!(score == 100, 7);
    }
}