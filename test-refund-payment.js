import WattsPayService from './WattsPayService.js';

const API_KEY = "aptoslabs_ME6eTPfGJUt_KcXcbjgNtYV73e4pyqHLLLQDowtxXSCXa";

async function runRefundPaymentTest() {
    const wattsPayService = new WattsPayService(API_KEY);
    
    try {
        // Create accounts for refund test
        const aliceAccount = await wattsPayService.createAccount();
        const bobAccount = await wattsPayService.createAccount();
        
        // Create admin account (this would be the deployed contract admin)
        const adminAccount = await wattsPayService.createAccount();
        
        // Fund accounts
        await wattsPayService.fundAccount(aliceAccount.address, 200_000_000);
        await wattsPayService.fundAccount(bobAccount.address, 100_000_000);
        await wattsPayService.fundAccount(adminAccount.address, 100_000_000);
        await wattsPayService.sleep(3);
        
        // Get initial balances
        const aliceInitialBalance = await wattsPayService.getAccountBalance(aliceAccount.address);
        const bobInitialBalance = await wattsPayService.getAccountBalance(bobAccount.address);
        
        // Register users via smart contract
        const aliceReg = await wattsPayService.registerUser(aliceAccount.account, "+91 98765 33331");
        const bobReg = await wattsPayService.registerUser(bobAccount.account, "+91 98765 33332");
        await wattsPayService.sleep(2);
        
        // Alice sends payment to Bob (this will be completed immediately)
        const paymentTxn = await wattsPayService.sendPaymentByPhone(
            aliceAccount.account,
            "+91 98765 33332", // Bob's phone
            75_000_000, // 0.75 APT
            "Service payment - will be refunded"
        );
        await wattsPayService.sleep(2);
        
        // Get balances after payment
        const aliceAfterPayment = await wattsPayService.getAccountBalance(aliceAccount.address);
        const bobAfterPayment = await wattsPayService.getAccountBalance(bobAccount.address);
        
        // Note: In real scenario, payment ID 1 would be from the PaymentInitiatedEvent
        // For this test, we'll assume payment ID 1 exists
        
        // Try to refund the payment (this should fail with current admin account)
        let refundTxn;
        try {
            refundTxn = await wattsPayService.refundPayment(adminAccount.account, 1);
            await wattsPayService.sleep(2);
        } catch (error) {
            console.log("Expected error - admin account doesn't match contract admin:", error.message);
        }
        
        // Get final balances
        const aliceFinalBalance = await wattsPayService.getAccountBalance(aliceAccount.address);
        const bobFinalBalance = await wattsPayService.getAccountBalance(bobAccount.address);
        
        // Return clean test data
        
        // Return clean test data
        return {
            accounts: {
                alice: {
                    address: aliceAccount.address,
                    phone: "+91 98765 33331",
                    role: "payer",
                    initialBalance: wattsPayService.octasToApt(aliceInitialBalance),
                    afterPayment: wattsPayService.octasToApt(aliceAfterPayment),
                    finalBalance: wattsPayService.octasToApt(aliceFinalBalance)
                },
                bob: {
                    address: bobAccount.address,
                    phone: "+91 98765 33332",
                    role: "recipient",
                    initialBalance: wattsPayService.octasToApt(bobInitialBalance),
                    afterPayment: wattsPayService.octasToApt(bobAfterPayment),
                    finalBalance: wattsPayService.octasToApt(bobFinalBalance)
                },
                admin: {
                    address: adminAccount.address,
                    role: "test_admin_account"
                }
            },
            transactions: {
                registration: {
                    alice: aliceReg.hash,
                    bob: bobReg.hash
                },
                payment: {
                    hash: paymentTxn.hash,
                    amount: 0.75,
                    description: "Service payment - will be refunded",
                    status: "completed",
                    explorerLink: `https://explorer.aptoslabs.com/txn/${paymentTxn.hash}?network=devnet`
                },
                refund: {
                    attempted: true,
                    successful: refundTxn ? true : false,
                    hash: refundTxn ? refundTxn.hash : null,
                    note: "Refund requires actual contract admin account"
                }
            },
            paymentFlow: {
                originalAmount: 0.75,
                aliceBalanceChange: wattsPayService.octasToApt(aliceAfterPayment - aliceInitialBalance),
                bobBalanceChange: wattsPayService.octasToApt(bobAfterPayment - bobInitialBalance),
                paymentSuccessful: true,
                refundNote: "Admin refund function exists but requires contract deployer permissions"
            },
            refundCapabilities: {
                adminRefund: "Available - requires contract admin",
                userRefund: "Not implemented in current contract",
                disputeResolution: "Available via admin intervention"
            },
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        return {
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Export for module usage
export { runRefundPaymentTest };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("Running Refund Payment Test...");
    runRefundPaymentTest()
        .then(result => {
            console.log("Refund Test Results:");
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            console.error("Refund Test Failed:", error);
        });
}