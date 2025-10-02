import WattsPayService from './WattsPayService.js';

const API_KEY = "aptoslabs_ME6eTPfGJUt_KcXcbjgNtYV73e4pyqHLLLQDowtxXSCXa";

async function runP2PPaymentTest() {
    const wattsPayService = new WattsPayService(API_KEY);
    
    try {
        // Create accounts
        const aliceAccount = await wattsPayService.createAccount();
        const bobAccount = await wattsPayService.createAccount();
        
        // Fund accounts  
        await wattsPayService.fundAccount(aliceAccount.address, 200_000_000);
        await wattsPayService.fundAccount(bobAccount.address, 100_000_000);
        await wattsPayService.sleep(3);
        
        // Get initial balances
        const aliceInitialBalance = await wattsPayService.getAccountBalance(aliceAccount.address);
        const bobInitialBalance = await wattsPayService.getAccountBalance(bobAccount.address);
        
        // Register users via smart contract with unique phone numbers
        const timestamp = Date.now();
        const aliceReg = await wattsPayService.registerUser(aliceAccount.account, `+91 98765 ${timestamp % 10000}1`);
        const bobReg = await wattsPayService.registerUser(bobAccount.account, `+91 98765 ${timestamp % 10000}2`);
        await wattsPayService.sleep(2);
        
        // Send payment by phone via smart contract
        const paymentExecution = await wattsPayService.sendPaymentByPhone(
            aliceAccount.account,
            `+91 98765 ${timestamp % 10000}2`, 
            10_000_000, // 0.5 APT
            "P2P Payment Test"
        );
        await wattsPayService.sleep(2);
        
        // Get final balances
        const aliceFinalBalance = await wattsPayService.getAccountBalance(aliceAccount.address);
        const bobFinalBalance = await wattsPayService.getAccountBalance(bobAccount.address);
        
        // Return clean conversation data
        return {
            accounts: {
                alice: {
                    address: aliceAccount.address,
                    phone: `+91 98765 ${timestamp % 10000}1`,
                    initialBalance: wattsPayService.octasToApt(aliceInitialBalance),
                    finalBalance: wattsPayService.octasToApt(aliceFinalBalance)
                },
                bob: {
                    address: bobAccount.address,
                    phone: `+91 98765 ${timestamp % 10000}2`, 
                    initialBalance: wattsPayService.octasToApt(bobInitialBalance),
                    finalBalance: wattsPayService.octasToApt(bobFinalBalance)
                }
            },
            transactions: {
                registration: {
                    alice: aliceReg.hash,
                    bob: bobReg.hash
                },
                payment: {
                    execution: paymentExecution.hash,
                    amount: 0.1,
                    explorerLink: `https://explorer.aptoslabs.com/txn/${paymentExecution.hash}?network=devnet`
                }
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
export { runP2PPaymentTest };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("Running P2P Payment Test...");
    runP2PPaymentTest()
        .then(result => {
            console.log("P2P Test Results:");
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            console.error("P2P Test Failed:", error);
        });
}