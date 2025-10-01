# WattsPay Smart Contracts - Deployment & Integration Guide

## 🚀 Successfully Deployed to Aptos Devnet

**Contract Address:** `0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615`

**Deployment Transaction:** `0x0e4a48569e134c99af324698758f806daa52e133661fdae0b081b63911ef561b`

**Network:** Aptos Devnet

**Deployment Date:** January 1, 2025

---

## 📋 Contract Overview

WattsPay consists of three interconnected smart contracts that enable comprehensive WhatsApp-based cryptocurrency operations:

### 1. User Registry Contract (`user_registry`)
**Purpose:** Phone-to-address mapping with WhatsApp verification for social integration

**Key Features:**
- Phone number to Aptos address mapping
- User profile management with reputation system
- WhatsApp verification status tracking
- Duplicate phone number prevention

### 2. Payment Coordinator Contract (`payment_coordinator`)
**Purpose:** Core payment engine with platform fees and transaction management

**Key Features:**
- Direct address-to-address payments
- Phone number-based payments (social payments)
- Platform fee collection (0.25% default)
- Payment tracking and history
- Refund capabilities

### 3. Group Treasury Contract (`group_treasury`)
**Purpose:** Advanced group finance with debt optimization and settlement

**Key Features:**
- Group creation and member management
- Expense tracking and splitting
- Debt balance calculation
- Optimal settlement algorithms
- Group financial analytics

---

## 🏗️ Contract Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WattsPay Smart Contracts                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────┐ │
│  │  User Registry  │───▶│Payment Coordinator│───▶│Group     │ │
│  │                 │    │                 │    │Treasury  │ │
│  │• Phone mapping  │    │• Direct payments│    │• Groups  │ │
│  │• Verification   │    │• Fee collection │    │• Expenses│ │
│  │• Reputation     │    │• Refunds        │    │• Settling│ │
│  └─────────────────┘    └─────────────────┘    └──────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Contract Functions Reference

### User Registry Contract

#### Entry Functions (Transactions)
```move
// Register a new user with phone number
public entry fun register_user(account: &signer, phone_number: String)

// Verify WhatsApp for existing user
public entry fun verify_whatsapp(admin: &signer, user_address: address)

// Update user reputation score
public entry fun update_reputation(admin: &signer, user_address: address, new_score: u64)
```

#### View Functions (Queries)
```move
// Check if user is registered
public fun is_user_registered(user_address: address): bool

// Check if phone number is taken
public fun is_phone_registered(phone_number: String): bool

// Get address by phone number
public fun get_user_address_by_phone(phone_number: String): address

// Get complete user profile
public fun get_user_profile(user_address: address): (String, address, u64, bool, bool, u64)
// Returns: (phone, address, timestamp, is_active, whatsapp_verified, reputation)
```

### Payment Coordinator Contract

#### Entry Functions (Transactions)
```move
// Send payment to specific address
public entry fun send_payment(
    sender: &signer, 
    recipient: address, 
    amount: u64, 
    message: String
)

// Send payment by phone number (social payment)
public entry fun send_payment_by_phone(
    sender: &signer, 
    recipient_phone: String, 
    amount: u64, 
    message: String
)

// Refund a payment (sender only)
public entry fun refund_payment(sender: &signer, payment_id: u64)

// Update platform fee rate (admin only)
public entry fun update_platform_fee(admin: &signer, new_rate: u64)
```

#### View Functions (Queries)
```move
// Get payment details
public fun get_payment(payment_id: u64): (u64, address, address, u64, String, u8, u64, u64)
// Returns: (id, sender, recipient, amount, message, status, created_time, completed_time)

// Get user's payment history
public fun get_user_payments(user_address: address): vector<u64>

// Get platform statistics
public fun get_platform_stats(): (u64, u64, u64)
// Returns: (next_payment_id, platform_fee_rate, platform_balance)
```

### Group Treasury Contract

#### Entry Functions (Transactions)
```move
// Create a new group
public entry fun create_group(creator: &signer, group_name: String)

// Add member to group (admin only)
public entry fun add_member(admin: &signer, group_id: u64, user_address: address)

// Add expense to group
public entry fun add_expense(
    payer: &signer, 
    group_id: u64, 
    amount: u64, 
    description: String, 
    participants: vector<address>
)

// Execute optimal debt settlement
public entry fun execute_optimal_settlement(admin: &signer, group_id: u64)
```

#### View Functions (Queries)
```move
// Get group information
public fun get_group_info(group_id: u64): (u64, String, address, vector<address>, u64, u64, u8)
// Returns: (id, name, admin, members, expense_count, total_expenses, status)

// Get user's groups
public fun get_user_groups(user_address: address): vector<u64>

// Get group debt balances
public fun get_group_debt_balances(group_id: u64): vector<DebtBalance>
```

---

## 🛠️ Integration Guide

### 1. Environment Setup

Add these environment variables:

```env
# Smart Contract Addresses
USER_REGISTRY_ADDRESS=0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615
PAYMENT_COORDINATOR_ADDRESS=0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615
GROUP_TREASURY_ADDRESS=0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615

# Aptos Network
APTOS_NETWORK=devnet
APTOS_NODE_URL=https://fullnode.devnet.aptoslabs.com/v1
APTOS_FAUCET_URL=https://faucet.devnet.aptoslabs.com
```

### 2. TypeScript Integration

```typescript
import { aptos, CONTRACT_MODULES } from './src/payments/aptosClient';

// Register a new user
const registerUser = async (account: Account, phoneNumber: string) => {
  const transaction = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${CONTRACT_MODULES.USER_REGISTRY}::register_user`,
      functionArguments: [phoneNumber],
    },
  });

  return await aptos.signAndSubmitTransaction({
    signer: account,
    transaction,
  });
};

// Send payment by phone
const sendPaymentByPhone = async (
  sender: Account,
  recipientPhone: string,
  amount: number,
  message: string
) => {
  const transaction = await aptos.transaction.build.simple({
    sender: sender.accountAddress,
    data: {
      function: `${CONTRACT_MODULES.PAYMENT_COORDINATOR}::send_payment_by_phone`,
      functionArguments: [recipientPhone, amount, message],
    },
  });

  return await aptos.signAndSubmitTransaction({
    signer: sender,
    transaction,
  });
};
```

### 3. Query Examples

```typescript
// Check if user is registered
const isUserRegistered = async (userAddress: string): Promise<boolean> => {
  const [result] = await aptos.view({
    payload: {
      function: `${CONTRACT_MODULES.USER_REGISTRY}::is_user_registered`,
      functionArguments: [userAddress],
    },
  });
  return result as boolean;
};

// Get user's payment history
const getUserPayments = async (userAddress: string): Promise<number[]> => {
  const [payments] = await aptos.view({
    payload: {
      function: `${CONTRACT_MODULES.PAYMENT_COORDINATOR}::get_user_payments`,
      functionArguments: [userAddress],
    },
  });
  return payments as number[];
};
```

---

## 💰 Platform Economics

### Fee Structure
- **Platform Fee:** 0.25% (25 basis points) of transaction amount
- **Minimum Fee:** Applied to prevent micro-transaction abuse
- **Group Settlements:** No additional fees for debt optimization

### Gas Costs (Approximate)
- **User Registration:** ~500 gas units
- **Payment Transaction:** ~800 gas units  
- **Group Creation:** ~1,200 gas units
- **Add Expense:** ~900 gas units

---

## 🔒 Security Features

### Access Control
- **Admin Functions:** Restricted to contract deployer
- **User Functions:** Require valid signer authentication
- **Group Functions:** Role-based permissions (admin/member)

### Input Validation
- Phone number format validation
- Amount range checks (minimum/maximum)
- Duplicate prevention (users, phone numbers)
- Group membership verification

### Error Handling
```move
// Common error codes
const E_USER_ALREADY_EXISTS: u64 = 0x80001;
const E_PHONE_ALREADY_REGISTERED: u64 = 0x80002;
const E_USER_NOT_FOUND: u64 = 0x60002;
const E_INSUFFICIENT_BALANCE: u64 = 0x10001;
const E_USER_NOT_REGISTERED: u64 = 0x10005;
```

---

## 📊 Event Tracking

### User Registry Events
```move
struct UserRegisteredEvent {
    user_address: address,
    phone_number: String,
    timestamp: u64,
}
```

### Payment Events
```move
struct PaymentInitiatedEvent {
    payment_id: u64,
    sender: address,
    recipient: address,
    amount: u64,
    message: String,
    timestamp: u64,
}

struct PaymentCompletedEvent {
    payment_id: u64,
    sender: address,
    recipient: address,
    amount: u64,
    timestamp: u64,
}
```

### Group Treasury Events
```move
struct GroupCreatedEvent {
    group_id: u64,
    admin: address,
    group_name: String,
    timestamp: u64,
}

struct ExpenseAddedEvent {
    group_id: u64,
    expense_id: u64,
    paid_by: address,
    amount: u64,
    description: String,
    participants: vector<address>,
    timestamp: u64,
}
```

---

## 🧪 Testing Guide

### Unit Tests
All contracts include comprehensive test coverage:
- User registration flows
- Payment scenarios (success/failure)
- Group management operations
- Edge cases and error conditions

### Integration Tests
Full end-to-end testing with live devnet:
- Multi-user scenarios
- Cross-contract interactions
- Real cryptocurrency transfers
- Group settlement algorithms

### Load Testing
Performance validation:
- Concurrent user registrations
- High-volume payment processing
- Large group operations
- Gas optimization verification

---

## 🚀 Deployment History

| Version | Date | Transaction Hash | Changes |
|---------|------|------------------|---------|
| v1.0.0 | 2025-01-01 | `0x0e4a48569e134c99af324698758f806daa52e133661fdae0b081b63911ef561b` | Initial deployment |

---

## 📞 Support & Resources

### Contract Verification
- **Aptos Explorer:** [View on Aptos Explorer](https://explorer.aptoslabs.com/account/0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615?network=devnet)
- **Source Code:** Available in `/move_contracts/sources/`
- **ABI:** Generated during compilation

### Documentation
- **Move Language:** [Official Move Documentation](https://move-language.github.io/move/)
- **Aptos SDK:** [TypeScript SDK Guide](https://aptos.dev/sdks/ts-sdk/)
- **Testing:** Comprehensive test suite in `/tests/`

### Development Tools
- **Aptos CLI:** Version 4.2.0+
- **Move Compiler:** Integrated with Aptos CLI
- **VS Code Extension:** Aptos Move language support

---

## 🔮 Future Enhancements

### Planned Features
1. **Multi-token Support:** Beyond AptosCoin
2. **Advanced Group Features:** Recurring payments, budgets
3. **DeFi Integration:** Yield farming for group treasuries
4. **Cross-chain Bridges:** Multi-blockchain support
5. **Advanced Analytics:** Group spending insights

### Upgrade Path
- Modular contract architecture allows independent upgrades
- Proxy pattern consideration for future versions
- Data migration strategies planned

---

**Contract Status:** ✅ Live on Devnet  
**Last Updated:** January 1, 2025  
**Maintainer:** WattsPay Development Team