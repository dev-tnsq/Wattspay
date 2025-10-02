import { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import crypto from 'crypto';

/**
 * WattsPayService - Complete smart contract interaction service
 * Uses proper Aptos TypeScript SDK patterns for view functions and entry functions
 */
export default class WattsPayService {
    constructor(apiKey = null) {
        const config = new AptosConfig({ 
            network: Network.DEVNET,
            clientConfig: {
                API_KEY: apiKey
            }
        });
        this.aptos = new Aptos(config);
        this.contractAddress = "0x5717690cf1cb83d2dd7089c537259307cc4474517b8edae3ef9c3fd5205e1703";
    }

    // ================================
    // BASIC ACCOUNT OPERATIONS
    // ================================

    /**
     * Create new account
     */
    async createAccount() {
        const privateKey = new Ed25519PrivateKey(Ed25519PrivateKey.generate().toString());
        const account = Account.fromPrivateKey({ privateKey });
        
        return {
            account: account,
            address: account.accountAddress.toString(),
            privateKey: privateKey.toString()
        };
    }

    /**
     * Fund account using direct faucet API
     */
    async fundAccount(address, amount) {
        try {
            const response = await fetch(`https://faucet.devnet.aptoslabs.com/mint?amount=${amount}&address=${address}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`Faucet API returned ${response.status}`);
            }
            
            const data = await response.json();
            return {
                hash: data[0] || null,
                success: true
            };
        } catch (error) {
            // Fallback to SDK method
            const response = await this.aptos.fundAccount({
                accountAddress: address,
                amount: amount
            });
            return response;
        }
    }

    /**
     * Get account balance
     */
    async getAccountBalance(accountAddress) {
        return await this.aptos.getAccountAPTAmount({ accountAddress });
    }

    // ================================
    // USER REGISTRY SMART CONTRACT
    // ================================

    /**
     * Register user via smart contract
     */
    async registerUser(account, phoneNumber) {
        const transaction = await this.aptos.transaction.build.simple({
            sender: account.accountAddress,
            data: {
                function: `${this.contractAddress}::user_registry::register_user`,
                functionArguments: [phoneNumber]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: account,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Get user by phone number (view function)
     */
    async getUserByPhone(phoneNumber) {
        try {
            const [userAddress] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::user_registry::get_user_by_phone`,
                    functionArguments: [phoneNumber]
                }
            });
            return userAddress;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get user profile (view function)
     */
    async getUserProfile(userAddress) {
        try {
            const [profile] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::user_registry::get_user_profile`,
                    functionArguments: [userAddress]
                }
            });
            return profile;
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if user exists (view function)
     */
    async userExists(userAddress) {
        try {
            const [exists] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::user_registry::user_exists`,
                    functionArguments: [userAddress]
                }
            });
            return exists;
        } catch (error) {
            return false;
        }
    }

    // ================================
    // PAYMENT COORDINATOR SMART CONTRACT
    // ================================

    /**
     * Send payment by phone via smart contract
     */
    async sendPaymentByPhone(senderAccount, recipientPhone, amount, message = "") {
        const transaction = await this.aptos.transaction.build.simple({
            sender: senderAccount.accountAddress,
            data: {
                function: `${this.contractAddress}::payment_coordinator::send_payment_by_phone`,
                functionArguments: [recipientPhone, amount.toString(), message]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: senderAccount,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Request payment via smart contract
     */
    async requestPayment(requesterAccount, payerPhone, amount, description = "") {
        const transaction = await this.aptos.transaction.build.simple({
            sender: requesterAccount.accountAddress,
            data: {
                function: `${this.contractAddress}::payment_coordinator::request_payment`,
                functionArguments: [payerPhone, amount.toString(), description]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: requesterAccount,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Approve payment request via smart contract
     */
    async approvePaymentRequest(payerAccount, paymentId) {
        const transaction = await this.aptos.transaction.build.simple({
            sender: payerAccount.accountAddress,
            data: {
                function: `${this.contractAddress}::payment_coordinator::approve_payment_request`,
                functionArguments: [paymentId.toString()]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: payerAccount,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Get payment details (view function)
     */
    async getPayment(paymentId) {
        try {
            const [payment] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::payment_coordinator::get_payment`,
                    functionArguments: [paymentId.toString()]
                }
            });
            return payment;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get user payments (view function)
     */
    async getUserPayments(userAddress) {
        try {
            const [payments] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::payment_coordinator::get_user_payments`,
                    functionArguments: [userAddress]
                }
            });
            return payments;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get platform fee rate (view function)
     */
    async getPlatformFeeRate() {
        try {
            const [feeRate] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::payment_coordinator::get_platform_fee_rate`,
                    functionArguments: []
                }
            });
            return parseInt(feeRate) / 10000; // Convert basis points to decimal
        } catch (error) {
            return 0.0025; // Default 0.25%
        }
    }

    /**
     * Refund a payment (admin only, for disputes)
     */
    async refundPayment(adminAccount, paymentId) {
        try {
            const transaction = await this.aptos.transaction.build.simple({
                sender: adminAccount.accountAddress,
                data: {
                    function: `${this.contractAddress}::payment_coordinator::refund_payment`,
                    functionArguments: [paymentId.toString()]
                }
            });

            const committedTxn = await this.aptos.signAndSubmitTransaction({
                signer: adminAccount,
                transaction
            });

            return await this.aptos.waitForTransaction({
                transactionHash: committedTxn.hash
            });
        } catch (error) {
            throw new Error(`Failed to refund payment: ${error.message}`);
        }
    }

    // ================================
    // GROUP TREASURY SMART CONTRACT
    // ================================

    /**
     * Create group via smart contract
     */
    async createGroup(creatorAccount, groupName) {
        const transaction = await this.aptos.transaction.build.simple({
            sender: creatorAccount.accountAddress,
            data: {
                function: `${this.contractAddress}::group_treasury::create_group`,
                functionArguments: [groupName]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: creatorAccount,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Add member to group via smart contract
     */
    async addMemberToGroup(adminAccount, groupId, memberAddress) {
        const transaction = await this.aptos.transaction.build.simple({
            sender: adminAccount.accountAddress,
            data: {
                function: `${this.contractAddress}::group_treasury::add_member`,
                functionArguments: [groupId.toString(), memberAddress]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: adminAccount,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Add expense to group via smart contract
     */
    async addGroupExpense(payerAccount, groupId, amount, description, participantAddresses) {
        const transaction = await this.aptos.transaction.build.simple({
            sender: payerAccount.accountAddress,
            data: {
                function: `${this.contractAddress}::group_treasury::add_expense`,
                functionArguments: [groupId.toString(), amount.toString(), description, participantAddresses]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: payerAccount,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Execute optimal settlement via smart contract
     */
    async executeOptimalSettlement(adminAccount, groupId) {
        const transaction = await this.aptos.transaction.build.simple({
            sender: adminAccount.accountAddress,
            data: {
                function: `${this.contractAddress}::group_treasury::execute_optimal_settlement`,
                functionArguments: [groupId.toString()]
            }
        });

        const committedTransaction = await this.aptos.signAndSubmitTransaction({
            signer: adminAccount,
            transaction
        });

        const executedTransaction = await this.aptos.waitForTransaction({
            transactionHash: committedTransaction.hash
        });

        return executedTransaction;
    }

    /**
     * Get group details (view function)
     */
    async getGroup(groupId) {
        try {
            const [group] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::group_treasury::get_group`,
                    functionArguments: [groupId.toString()]
                }
            });
            return group;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get user groups (view function)
     */
    async getUserGroups(userAddress) {
        try {
            const [groups] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::group_treasury::get_user_groups`,
                    functionArguments: [userAddress]
                }
            });
            return groups;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get group balances (view function)
     */
    async getGroupBalances(groupId) {
        try {
            const [balances] = await this.aptos.view({
                payload: {
                    function: `${this.contractAddress}::group_treasury::get_balances`,
                    functionArguments: [groupId.toString()]
                }
            });
            return balances;
        } catch (error) {
            return {};
        }
    }

    // ================================
    // UTILITY FUNCTIONS
    // ================================

    /**
     * Hash phone number for contract calls
     */
    hashPhoneNumber(phoneNumber) {
        const hash = crypto.createHash('sha256').update(phoneNumber.trim()).digest('hex');
        return `0x${hash}`;
    }

    /**
     * Sleep utility for rate limiting
     */
    async sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    /**
     * Convert octas to APT
     */
    octasToApt(octas) {
        return parseInt(octas) / 100_000_000;
    }

    /**
     * Convert APT to octas
     */
    aptToOctas(apt) {
        return Math.floor(apt * 100_000_000);
    }

    /**
     * Format address for display
     */
    formatAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
}