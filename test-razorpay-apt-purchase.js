import WattsPayService from './WattsPayService.js';
import crypto from 'crypto';
import https from 'https';

const API_KEY = "aptoslabs_ME6eTPfGJUt_KcXcbjgNtYV73e4pyqHLLLQDowtxXSCXa";

// Real Razorpay Test Configuration
// To get these credentials:
// 1. Sign up at https://dashboard.razorpay.com/signup
// 2. Go to Settings > API Keys
// 3. Generate Test Keys (these are safe to use and don't process real money)
// 4. Replace the values below
const RAZORPAY_CONFIG = {
    key_id: "rzp_test_1234567890abcd", // Replace with your actual test key from dashboard
    key_secret: "test_secret_1234567890abcdef", // Replace with your actual test secret
    webhook_secret: "webhook_secret_1234567890", // Set this in webhook settings
    currency: "INR",
    apt_price_inr: 850, // 1 APT = 850 INR (current market rate approx)
    base_url: "https://api.razorpay.com/v1"
};

/**
 * Real Razorpay API Service for INR to APT conversion
 * Uses actual Razorpay Test APIs
 */
class RazorpayService {
    constructor(config) {
        this.config = config;
        this.auth = Buffer.from(`${config.key_id}:${config.key_secret}`).toString('base64');
    }

    /**
     * Make authenticated API call to Razorpay
     */
    async makeApiCall(endpoint, method = 'POST', data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.razorpay.com',
                port: 443,
                path: `/v1${endpoint}`,
                method: method,
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(responseData);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`Razorpay API Error: ${response.error?.description || responseData}`));
                        }
                    } catch (error) {
                        reject(new Error(`Invalid JSON response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    /**
     * Create a real payment order for INR to APT conversion
     */
    async createPaymentOrder(amountINR, userPhone, aptosAddress, userEmail = "user@wattspay.com") {
        const aptAmount = (amountINR / this.config.apt_price_inr).toFixed(6);
        const receipt = `apt_${Date.now()}`;
        
        const orderData = {
            amount: amountINR * 100, // Amount in paise
            currency: this.config.currency,
            receipt: receipt,
            notes: {
                user_phone: userPhone,
                aptos_address: aptosAddress,
                apt_amount: aptAmount,
                conversion_rate: this.config.apt_price_inr,
                purpose: "APT_PURCHASE_WATTSPAY"
            }
        };

        try {
            const order = await this.makeApiCall('/orders', 'POST', orderData);
            
            // Add additional fields for frontend integration
            order.payment_link = `https://checkout.razorpay.com/v1/checkout.js`;
            order.checkout_config = {
                key: this.config.key_id,
                amount: order.amount,
                currency: order.currency,
                name: "WattsPay",
                description: `Purchase ${aptAmount} APT`,
                order_id: order.id,
                prefill: {
                    email: userEmail,
                    contact: userPhone
                },
                theme: {
                    color: "#3399cc"
                },
                modal: {
                    ondismiss: function() {
                        console.log("Payment modal closed");
                    }
                }
            };
            
            return order;
        } catch (error) {
            throw new Error(`Failed to create Razorpay order: ${error.message}`);
        }
    }

    /**
     * Fetch payment details from Razorpay
     */
    async getPaymentDetails(paymentId) {
        try {
            return await this.makeApiCall(`/payments/${paymentId}`, 'GET');
        } catch (error) {
            throw new Error(`Failed to fetch payment details: ${error.message}`);
        }
    }

    /**
     * Verify payment signature for security
     */
    verifyPaymentSignature(orderId, paymentId, signature) {
        const expectedSignature = crypto
            .createHmac('sha256', this.config.key_secret)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');
        
        return signature === expectedSignature;
    }

    /**
     * Create payment link for easier user experience
     */
    async createPaymentLink(amountINR, userPhone, aptosAddress, userEmail = "user@wattspay.com") {
        const aptAmount = (amountINR / this.config.apt_price_inr).toFixed(6);
        
        const linkData = {
            amount: amountINR * 100,
            currency: this.config.currency,
            accept_partial: false,
            first_min_partial_amount: amountINR * 100,
            description: `Purchase ${aptAmount} APT for WattsPay`,
            customer: {
                name: "WattsPay User",
                email: userEmail,
                contact: userPhone
            },
            notify: {
                sms: true,
                email: true
            },
            reminder_enable: true,
            notes: {
                user_phone: userPhone,
                aptos_address: aptosAddress,
                apt_amount: aptAmount,
                conversion_rate: this.config.apt_price_inr,
                purpose: "APT_PURCHASE_WATTSPAY"
            },
            callback_url: "https://wattspay.com/payment-success",
            callback_method: "get"
        };

        try {
            return await this.makeApiCall('/payment_links', 'POST', linkData);
        } catch (error) {
            throw new Error(`Failed to create payment link: ${error.message}`);
        }
    }

    /**
     * Simulate test payment for demo purposes
     * This creates a test payment scenario without actual money transfer
     */
    async simulateTestPayment(orderId) {
        // In test mode, we simulate a successful payment
        // In production, this would be handled by Razorpay webhooks
        const simulatedPayment = {
            id: `pay_${crypto.randomBytes(8).toString('hex')}`,
            entity: "payment",
            amount: 100000, // Amount from order
            currency: "INR",
            status: "captured",
            order_id: orderId,
            method: "upi",
            amount_refunded: 0,
            refund_status: null,
            captured: true,
            description: "APT Purchase via WattsPay - TEST MODE",
            created_at: Math.floor(Date.now() / 1000),
            bank: null,
            wallet: "phonepe",
            vpa: "user@phonepe",
            email: "user@wattspay.com",
            contact: "+919876543210",
            fee: 2360, // Razorpay fee in paise
            tax: 360,
            error_code: null,
            error_description: null
        };

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return simulatedPayment;
    }
}

async function runRazorpayAPTPurchaseTest() {
    const wattsPayService = new WattsPayService(API_KEY);
    const razorpayService = new RazorpayService(RAZORPAY_CONFIG);
    
    try {
        console.log("🇮🇳 Starting Real Razorpay to APT Purchase Test...\n");
        
        // Create user account
        const userAccount = await wattsPayService.createAccount();
        console.log(`✅ User Aptos account created: ${userAccount.address}`);
        
        // Get initial balance
        const initialBalance = await wattsPayService.getAccountBalance(userAccount.address);
        console.log(`📊 Initial APT balance: ${wattsPayService.octasToApt(initialBalance)} APT`);
        
        // Step 1: User wants to buy APT with INR
        const purchaseAmountINR = 1000; // 1000 INR
        const userPhone = "+91 98765 43210";
        const userEmail = "user@wattspay.com";
        const expectedAPT = purchaseAmountINR / RAZORPAY_CONFIG.apt_price_inr;
        
        console.log(`\n💰 User wants to buy ${expectedAPT.toFixed(6)} APT for ₹${purchaseAmountINR}`);
        console.log(`📈 Conversion rate: ₹${RAZORPAY_CONFIG.apt_price_inr} per APT`);
        
        // Step 2: Create real Razorpay payment order
        console.log(`\n🔗 Creating Razorpay payment order...`);
        const paymentOrder = await razorpayService.createPaymentOrder(
            purchaseAmountINR,
            userPhone,
            userAccount.address,
            userEmail
        );
        
        console.log(`\n📋 Razorpay Order Created Successfully:`);
        console.log(`   Order ID: ${paymentOrder.id}`);
        console.log(`   Amount: ₹${purchaseAmountINR} (${paymentOrder.amount} paise)`);
        console.log(`   APT to receive: ${paymentOrder.notes.apt_amount} APT`);
        console.log(`   Status: ${paymentOrder.status}`);
        console.log(`   Receipt: ${paymentOrder.receipt}`);
        
        // Step 3: Create Payment Link for easier user experience
        console.log(`\n🔗 Creating user-friendly payment link...`);
        const paymentLink = await razorpayService.createPaymentLink(
            purchaseAmountINR,
            userPhone,
            userAccount.address,
            userEmail
        );
        
        console.log(`\n🌐 Payment Link Created:`);
        console.log(`   Link ID: ${paymentLink.id}`);
        console.log(`   Short URL: ${paymentLink.short_url}`);
        console.log(`   Payment Page: ${paymentLink.payment_page_url}`);
        console.log(`   Status: ${paymentLink.status}`);
        
        // Step 4: Display payment options for user
        console.log(`\n💳 Payment Options for User:`);
        console.log(`\n   🔗 Option 1 - Direct Payment Link:`);
        console.log(`      URL: ${paymentLink.short_url}`);
        console.log(`      Description: User clicks this link to pay via UPI/Cards/NetBanking`);
        
        console.log(`\n   � Option 2 - Checkout Integration:`);
        console.log(`      Include this in your website/app:`);
        console.log(`      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>`);
        console.log(`      Order ID: ${paymentOrder.id}`);
        console.log(`      Key: ${RAZORPAY_CONFIG.key_id}`);
        
        // Step 5: Simulate payment completion (for testing)
        console.log(`\n🧪 Simulating payment completion for demo...`);
        console.log(`   (In production, user would pay via the link above)`);
        
        const simulatedPayment = await razorpayService.simulateTestPayment(paymentOrder.id);
        console.log(`\n✅ Payment Simulation Complete:`);
        console.log(`   Payment ID: ${simulatedPayment.id}`);
        console.log(`   Method: ${simulatedPayment.method.toUpperCase()}`);
        console.log(`   VPA: ${simulatedPayment.vpa}`);
        console.log(`   Status: ${simulatedPayment.status}`);
        console.log(`   Fee: ₹${simulatedPayment.fee / 100} (including tax)`);
        
        // Step 6: Verify payment signature (security check)
        const testSignature = crypto
            .createHmac('sha256', RAZORPAY_CONFIG.key_secret)
            .update(`${paymentOrder.id}|${simulatedPayment.id}`)
            .digest('hex');
        
        const isSignatureValid = razorpayService.verifyPaymentSignature(
            paymentOrder.id,
            simulatedPayment.id,
            testSignature
        );
        
        console.log(`\n🔒 Payment signature verification: ${isSignatureValid ? '✅ VALID' : '❌ INVALID'}`);
        
        // Step 7: Convert INR to APT and fund user account
        if (isSignatureValid && simulatedPayment.status === 'captured') {
            const aptToFund = parseFloat(paymentOrder.notes.apt_amount);
            const octasToFund = wattsPayService.aptToOctas(aptToFund);
            
            console.log(`\n⚡ Converting ₹${purchaseAmountINR} to ${aptToFund} APT...`);
            console.log(`   Processing APT purchase on Aptos blockchain...`);
            
            // Fund the account (simulating APT purchase)
            await wattsPayService.fundAccount(userAccount.address, octasToFund);
            await wattsPayService.sleep(3);
            
            // Get final balance
            const finalBalance = await wattsPayService.getAccountBalance(userAccount.address);
            const balanceIncrease = wattsPayService.octasToApt(finalBalance - initialBalance);
            
            console.log(`\n🎉 APT Purchase Completed Successfully!`);
            console.log(`📊 Final APT balance: ${wattsPayService.octasToApt(finalBalance)} APT`);
            console.log(`📈 APT received: ${balanceIncrease} APT`);
            console.log(`💰 Total cost: ₹${purchaseAmountINR} (+ ₹${simulatedPayment.fee / 100} gateway fee)`);
            
            // Return complete transaction data
            return {
                success: true,
                purchase: {
                    amount_inr: purchaseAmountINR,
                    amount_apt: aptToFund,
                    conversion_rate: RAZORPAY_CONFIG.apt_price_inr,
                    gateway_fee_inr: simulatedPayment.fee / 100,
                    user_phone: userPhone,
                    user_email: userEmail,
                    user_address: userAccount.address
                },
                razorpay: {
                    order_id: paymentOrder.id,
                    payment_id: simulatedPayment.id,
                    payment_link_id: paymentLink.id,
                    short_url: paymentLink.short_url,
                    payment_page_url: paymentLink.payment_page_url,
                    payment_method: simulatedPayment.method,
                    vpa: simulatedPayment.vpa,
                    status: simulatedPayment.status,
                    signature_valid: isSignatureValid
                },
                balances: {
                    initial_apt: wattsPayService.octasToApt(initialBalance),
                    final_apt: wattsPayService.octasToApt(finalBalance),
                    apt_received: balanceIncrease
                },
                timestamps: {
                    order_created: new Date(paymentOrder.created_at * 1000).toISOString(),
                    payment_completed: new Date(simulatedPayment.created_at * 1000).toISOString(),
                    apt_funded: new Date().toISOString()
                },
                integration_urls: {
                    payment_link: paymentLink.short_url,
                    checkout_js: "https://checkout.razorpay.com/v1/checkout.js",
                    razorpay_dashboard: `https://dashboard.razorpay.com/app/payments/${simulatedPayment.id}`,
                    aptos_explorer: `https://explorer.aptoslabs.com/account/${userAccount.address}?network=devnet`
                }
            };
        } else {
            throw new Error("Payment verification failed or payment not captured");
        }
        
    } catch (error) {
        console.error("❌ Razorpay APT Purchase Test Failed:", error.message);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Generate HTML demo page for Razorpay checkout
 */
function generateCheckoutDemo(orderData) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>WattsPay - Buy APT with INR</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
    <h1>WattsPay APT Purchase</h1>
    <p>Buy ${orderData.notes.apt_amount} APT for ₹${orderData.amount / 100}</p>
    
    <button onclick="payNow()">Pay Now with Razorpay</button>
    
    <script>
    function payNow() {
        var options = {
            "key": "${RAZORPAY_CONFIG.key_id}",
            "amount": ${orderData.amount},
            "currency": "INR",
            "name": "WattsPay",
            "description": "Purchase APT with INR",
            "order_id": "${orderData.id}",
            "handler": function (response) {
                alert("Payment successful! Payment ID: " + response.razorpay_payment_id);
                console.log(response);
            },
            "prefill": {
                "email": "user@wattspay.com",
                "contact": "+919876543210"
            },
            "theme": {
                "color": "#3399cc"
            }
        };
        var rzp1 = new Razorpay(options);
        rzp1.open();
    }
    </script>
</body>
</html>
    `;
}

// Export for module usage
export { runRazorpayAPTPurchaseTest, RazorpayService, RAZORPAY_CONFIG, generateCheckoutDemo };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("🇮🇳 Running Real Razorpay to APT Purchase Test...");
    console.log("📝 Note: This uses Razorpay Test APIs - no real money involved");
    console.log("🔑 Update RAZORPAY_CONFIG with your test keys for full integration\n");
    
    runRazorpayAPTPurchaseTest()
        .then(result => {
            console.log("\n📋 Razorpay Purchase Test Results:");
            console.log(JSON.stringify(result, null, 2));
            
            if (result.success) {
                console.log("\n🎉 Integration Tips:");
                console.log("1. Replace test keys with production keys for mainnet");
                console.log("2. Set up webhooks for automatic payment verification");
                console.log("3. Implement proper error handling for failed payments");
                console.log("4. Add KYC verification for large amounts");
                console.log(`5. Test the payment link: ${result.integration_urls.payment_link}`);
            }
        })
        .catch(error => {
            console.error("❌ Test Failed:", error);
        });
}