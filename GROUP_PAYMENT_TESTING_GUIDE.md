# Group Payment Testing with API Keys

## Problem
We're hitting Aptos API rate limits (50,000 compute units per 300 seconds) when using the CLI without API keys.

## Solution
Use the Aptos TypeScript SDK with API keys to avoid rate limiting.

## Setup Instructions

### 1. Install Aptos SDK in Frontend
```bash
cd Frontend
npm install @aptos-labs/ts-sdk
# or
pnpm add @aptos-labs/ts-sdk
```

### 2. Get Aptos API Key
1. Visit: https://geomi.dev/docs/start
2. Create an account and get your API key
3. Set it as environment variable or pass directly

### 3. Run Group Payment Demo

#### Option A: With API Key (Recommended)
```typescript
import { runGroupPaymentDemo } from './lib/groupPaymentService';

// Use with API key to avoid rate limits
await runGroupPaymentDemo('your-api-key-here');
```

#### Option B: Without API Key (Limited)
```typescript
// Will work but may hit rate limits
await runGroupPaymentDemo();
```

## Group Payment Flow Commands

Instead of using CLI directly, use our TypeScript service:

### Test Commands (run in Frontend directory):
```bash
# Install dependencies
pnpm install @aptos-labs/ts-sdk

# Create test file
echo "
import { runGroupPaymentDemo } from './lib/groupPaymentService';

async function test() {
  await runGroupPaymentDemo('YOUR_API_KEY');
}

test().catch(console.error);
" > test-group-payments.ts

# Run the test
npx tsx test-group-payments.ts
```

## CLI Commands (if you want to wait for rate limit reset)

```bash
# Wait 5 minutes for rate limit reset, then run:

# 1. Create Group
aptos move run --profile wattspay_fresh \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::create_group \
  --args string:"Trip" --assume-yes

# 2. Add Members  
aptos move run --profile wattspay_fresh \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::add_member \
  --args u64:1 string:"+91 88888 11111" --assume-yes

aptos move run --profile wattspay_fresh \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::add_member \
  --args u64:1 string:"+91 77777 22222" --assume-yes

aptos move run --profile wattspay_fresh \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::add_member \
  --args u64:1 string:"+91 66666 33333" --assume-yes

# 3. Add Expenses
aptos move run --profile wattspay_fresh \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::add_expense \
  --args u64:1 u64:200000000 string:"Hotel booking" --assume-yes

aptos move run --profile default \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::add_expense \
  --args u64:1 u64:150000000 string:"Flight tickets" --assume-yes

aptos move run --profile wattspay_v2 \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::add_expense \
  --args u64:1 u64:80000000 string:"Food and activities" --assume-yes

aptos move run --profile wattspay_v3 \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::add_expense \
  --args u64:1 u64:30000000 string:"Transportation" --assume-yes

# 4. Execute Settlement
aptos move run --profile wattspay_fresh \
  --function-id 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703::group_treasury::execute_optimal_settlement \
  --args u64:1 --assume-yes
```

## Expected Results

**Group**: College Trip Fund  
**Members**: 4 (Admin + Alice + Bob + Charlie)  
**Total Expenses**: 4.6 APT  
**Per Person Share**: 1.15 APT each  

**Settlement**:
- Admin: Paid 2.0 APT → Gets back 0.85 APT
- Alice: Paid 1.5 APT → Gets back 0.35 APT  
- Bob: Paid 0.8 APT → Pays 0.35 APT
- Charlie: Paid 0.3 APT → Pays 0.85 APT

**Optimal Transactions**:
- Bob pays 0.35 APT to Alice
- Charlie pays 0.85 APT to Admin

## WhatsApp Bot Demo Script

Use the `GROUP_DEMO_SCRIPT` from the service file for your video recording!