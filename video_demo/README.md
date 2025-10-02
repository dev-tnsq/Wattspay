# 🎬 WattsPay Video Demo Scripts

## 📱 WhatsApp Bot Simulation

These scripts simulate the WattsPay bot interactions for your video demo.

### 🎭 Demo Scenario

**Characters:**
- **Shivansh**: +91 99538 12367 (Sender)
- **Sahil**: +91 98998 22573 (Recipient)

**Action**: Shivansh sends 0.1 APT to Sahil through WattsPay bot

## 🚀 Commands for Video Demo

### 1. Create Shivansh's Account
```bash
cd /Users/tanishqmaheshwari/code/blockchain/wattspay/video_demo
./create_shivansh_account.sh
```

**What it does:**
- Registers Shivansh with phone +91 99538 12367
- Shows account address created
- Provides explorer link

### 2. Create Sahil's Account  
```bash
./create_sahil_account.sh
```

**What it does:**
- Registers Sahil with phone +91 98998 22573
- Shows account address created
- Provides explorer link

### 3. Send Payment
```bash
./send_payment.sh
```

**What it does:**
- Sends 0.1 APT from Shivansh to Sahil
- Shows payment transaction hash
- Provides explorer link for the transaction
- Displays platform fee (0.25%)

## 📝 Video Script

**You:** "Hi!"
**Shivansh:** "Hi, I want to send money"
**You:** "Hi Shivansh! I have created your account" *(run script 1)*
**Shivansh:** "Okay, I want to send 0.1 APT to my friend Sahil"
**You:** "Sure! Can I get his number?"
**Shivansh:** *sends contact*
**You:** "Perfect! I've created Sahil's account too" *(run script 2)*
**You:** "Processing your payment now..." *(run script 3)*
**You:** "Payment sent successfully! Here's your transaction link"

## 🎯 Expected Outputs

### Script 1 Output:
```
🎉 SHIVANSH ACCOUNT CREATED!
👤 Name: Shivansh
📱 Phone: +91 99538 12367
🏠 Account Address: 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703
🔗 View on Explorer: https://explorer.aptoslabs.com/txn/[HASH]?network=devnet
```

### Script 2 Output:
```
🎉 SAHIL ACCOUNT CREATED!
👤 Name: Sahil
📱 Phone: +91 98998 22573
🏠 Account Address: 0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703
🔗 View on Explorer: https://explorer.aptoslabs.com/txn/[HASH]?network=devnet
```

### Script 3 Output:
```
🎉 PAYMENT SUCCESSFUL!
💸 Amount: 0.1 APT
👤 From: Shivansh (+91 99538 12367)
👤 To: Sahil (+91 98998 22573)
🔗 Transaction: https://explorer.aptoslabs.com/txn/[HASH]?network=devnet
```

Perfect for your video demo! 🚀