import WattsPayService from './WattsPayService.js';

const API_KEY = "aptoslabs_ME6eTPfGJUt_KcXcbjgNtYV73e4pyqHLLLQDowtxXSCXa";

async function runGroupPaymentTest() {
    const wattsPayService = new WattsPayService(API_KEY);
    
    try {
        // Create 3 accounts for group payment
        const aliceAccount = await wattsPayService.createAccount();
        const bobAccount = await wattsPayService.createAccount();
        const charlieAccount = await wattsPayService.createAccount();
        
        // Fund accounts
        await wattsPayService.fundAccount(aliceAccount.address, 300_000_000);
        await wattsPayService.fundAccount(bobAccount.address, 200_000_000);
        await wattsPayService.fundAccount(charlieAccount.address, 200_000_000);
        await wattsPayService.sleep(3);
        
        // Get initial balances
        const aliceInitialBalance = await wattsPayService.getAccountBalance(aliceAccount.address);
        const bobInitialBalance = await wattsPayService.getAccountBalance(bobAccount.address);
        const charlieInitialBalance = await wattsPayService.getAccountBalance(charlieAccount.address);
        
        // Register users via smart contract with unique phone numbers
        const timestamp = Date.now();
        const aliceReg = await wattsPayService.registerUser(aliceAccount.account, `+91 98765 ${timestamp % 10000}1`);
        const bobReg = await wattsPayService.registerUser(bobAccount.account, `+91 98765 ${timestamp % 10000}2`);
        const charlieReg = await wattsPayService.registerUser(charlieAccount.account, `+91 98765 ${timestamp % 10000}3`);
        await wattsPayService.sleep(2);
        
        // Create group via smart contract (Alice as admin)
        const groupCreation = await wattsPayService.createGroup(
            aliceAccount.account,
            "Trip to Goa"
        );
        await wattsPayService.sleep(2);
        
        // Add Bob to the group
        const addBob = await wattsPayService.addMemberToGroup(
            aliceAccount.account,
            1, // group ID
            bobAccount.address
        );
        await wattsPayService.sleep(2);
        
        // Add Charlie to the group
        const addCharlie = await wattsPayService.addMemberToGroup(
            aliceAccount.account,
            1, // group ID
            charlieAccount.address
        );
        await wattsPayService.sleep(2);
        
        // Add expense to group via smart contract (Alice paid for hotel)
        const expenseAddition = await wattsPayService.addGroupExpense(
            aliceAccount.account,
            1, // group ID
            150_000_000, // 1.5 APT
            "Hotel booking for 3 nights",
            [aliceAccount.address, bobAccount.address, charlieAccount.address] // all participants
        );
        await wattsPayService.sleep(2);
        
        // Execute optimal settlement via smart contract
        const paymentSettlement = await wattsPayService.executeOptimalSettlement(
            aliceAccount.account,
            1 // group ID
        );
        await wattsPayService.sleep(2);
        
        // Get final balances
        const aliceFinalBalance = await wattsPayService.getAccountBalance(aliceAccount.address);
        const bobFinalBalance = await wattsPayService.getAccountBalance(bobAccount.address);
        const charlieFinalBalance = await wattsPayService.getAccountBalance(charlieAccount.address);
        
        // Return clean conversation data
        return {
            group: {
                name: "Trip to Goa",
                id: 1,
                admin: "Alice",
                members: 3,
                totalExpense: 1.5
            },
            accounts: {
                alice: {
                    address: aliceAccount.address,
                    phone: `+91 98765 ${timestamp % 10000}1`,
                    role: "admin/payer",
                    initialBalance: wattsPayService.octasToApt(aliceInitialBalance),
                    finalBalance: wattsPayService.octasToApt(aliceFinalBalance)
                },
                bob: {
                    address: bobAccount.address,
                    phone: `+91 98765 ${timestamp % 10000}2`,
                    role: "member",
                    initialBalance: wattsPayService.octasToApt(bobInitialBalance),
                    finalBalance: wattsPayService.octasToApt(bobFinalBalance)
                },
                charlie: {
                    address: charlieAccount.address,
                    phone: `+91 98765 ${timestamp % 10000}3`,
                    role: "member",
                    initialBalance: wattsPayService.octasToApt(charlieInitialBalance),
                    finalBalance: wattsPayService.octasToApt(charlieFinalBalance)
                }
            },
            transactions: {
                registration: {
                    alice: aliceReg.hash,
                    bob: bobReg.hash,
                    charlie: charlieReg.hash
                },
                group: {
                    creation: groupCreation.hash,
                    addBob: addBob.hash,
                    addCharlie: addCharlie.hash,
                    expenseAddition: expenseAddition.hash,
                    settlement: paymentSettlement.hash,
                    explorerLink: `https://explorer.aptoslabs.com/txn/${paymentSettlement.hash}?network=devnet`
                }
            },
            expense: {
                description: "Hotel booking for 3 nights",
                amount: 1.5,
                paidBy: "Alice",
                splitBetween: ["Alice", "Bob", "Charlie"],
                perPersonShare: 0.5
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
export { runGroupPaymentTest };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("Running Group Payment Test...");
    runGroupPaymentTest()
        .then(result => {
            console.log("Group Test Results:");
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            console.error("Group Test Failed:", error);
        });
}