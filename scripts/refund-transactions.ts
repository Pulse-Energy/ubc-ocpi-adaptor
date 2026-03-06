/**
 * One-off script to manually refund two failed transactions.
 *
 * Transaction 1: f18d2ea0-1e1b-42c3-aaa1-ccd6f9a8d968 (full charging / undercharge)
 *   - Paid: ₹42.18, Charged: ₹10.97, Refund: ₹31.23
 *   - Failed because RazorpayPaymentGatewayService.createRefund received Razorpay payment ID
 *     instead of internal UUID for DB lookup.
 *
 * Transaction 2: 1a89b42a-ea0c-4db7-9f40-e01338dffb2a (cancel)
 *   - Full refund of ₹42.18 (no charging occurred)
 *   - Failed due to TypeError accessing cdr.total_cost.excl_vat when cdr was null.
 *
 * Usage:
 *   DATABASE_URL=<prod-db-url> npx ts-node scripts/refund-transactions.ts [--dry-run]
 */

import { databaseService } from '../src/services/database.service';
import PaymentTxnDbService from '../src/db-services/PaymentTxnDbService';
import RazorpayPaymentGatewayService from '../src/ubc/services/PaymentServices/Razorpay/index';
import { GenericPaymentTxnStatus } from '../src/types/BillDesk';

const TRANSACTIONS_TO_REFUND = [
    {
        beckn_transaction_id: 'f18d2ea0-1e1b-42c3-aaa1-ccd6f9a8d968',
        description: 'Full charging (undercharge) - partial refund',
    },
    {
        beckn_transaction_id: '1a89b42a-ea0c-4db7-9f40-e01338dffb2a',
        description: 'Cancel - full refund',
    },
];

const isDryRun = process.argv.includes('--dry-run');

async function refundTransaction(becknTransactionId: string, description: string): Promise<void> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Processing: ${description}`);
    console.log(`Beckn Transaction ID: ${becknTransactionId}`);
    console.log('='.repeat(80));

    // 1. Find payment transaction by beckn_transaction_id
    const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
        where: { beckn_transaction_id: becknTransactionId },
    });

    if (!paymentTxn) {
        console.error(`  ERROR: Payment transaction not found for beckn_transaction_id: ${becknTransactionId}`);
        return;
    }

    console.log(`  Payment Txn ID:       ${paymentTxn.id}`);
    console.log(`  Auth Reference:       ${paymentTxn.authorization_reference}`);
    console.log(`  Amount Paid:          ₹${paymentTxn.amount}`);
    console.log(`  Status:               ${paymentTxn.status}`);
    console.log(`  Gateway Payment ID:   ${paymentTxn.payment_gateway_payment_id}`);
    console.log(`  Partner ID:           ${paymentTxn.partner_id}`);

    // 2. Validate current status
    const successStatuses = [GenericPaymentTxnStatus.Success, 'SUCCESS', 'COMPLETED'];
    if (!successStatuses.includes(paymentTxn.status)) {
        console.error(`  ERROR: Payment is not in successful status (current: ${paymentTxn.status}). Cannot refund.`);
        return;
    }

    if (!paymentTxn.payment_gateway_payment_id) {
        console.error(`  ERROR: No payment_gateway_payment_id found. Cannot process Razorpay refund.`);
        return;
    }

    // 3. Calculate refund amount
    // For cancel: full refund (charged = 0)
    // For undercharge: refund = paid - charged (charged amount from session.final_amount)
    const paidAmount = Number(paymentTxn.amount);
    let chargedAmount = 0;

    // Try to get session's final_amount if it exists
    const session = await databaseService.prisma.session.findFirst({
        where: { authorization_reference: paymentTxn.authorization_reference },
    });

    if (session?.final_amount && typeof session.final_amount === 'object') {
        const finalAmount = session.final_amount as Record<string, unknown>;
        if (finalAmount.total !== undefined && finalAmount.total !== null) {
            chargedAmount = Number(finalAmount.total);
        }
    }

    const refundAmount = paidAmount - chargedAmount;
    const refundAmountInPaise = Math.round(refundAmount * 100);

    console.log(`  Charged Amount:       ₹${chargedAmount.toFixed(2)}`);
    console.log(`  Refund Amount:        ₹${refundAmount.toFixed(2)} (${refundAmountInPaise} paise)`);

    if (refundAmount <= 0) {
        console.error(`  ERROR: Refund amount is ₹${refundAmount.toFixed(2)}. Nothing to refund.`);
        return;
    }

    if (isDryRun) {
        console.log(`  [DRY RUN] Would refund ₹${refundAmount.toFixed(2)} via Razorpay for payment ${paymentTxn.payment_gateway_payment_id}`);
        return;
    }

    // 4. Process refund via Razorpay
    // NOTE: We call createRefund with the INTERNAL payment_txn_id (UUID), not the Razorpay payment ID.
    // This is the correct usage - createRefund does getById() then uses payment_gateway_payment_id for the API call.
    console.log(`  Processing Razorpay refund...`);
    const refundResult = await RazorpayPaymentGatewayService.createRefund(
        paymentTxn.id,  // internal UUID - createRefund does getById() then uses payment_gateway_payment_id
        { amount: refundAmountInPaise },
    );

    if (!refundResult.success || !refundResult.refund) {
        console.error(`  ERROR: Refund failed - ${refundResult.error}`);
        if (refundResult.error_details) {
            console.error(`  Details:`, JSON.stringify(refundResult.error_details, null, 2));
        }
        return;
    }

    console.log(`  Refund ID:            ${refundResult.refund.id}`);
    console.log(`  Refund Status:        ${refundResult.refund.status}`);

    // 5. Update payment_txn status and store refund details
    const currentAdditionalProps = paymentTxn.additional_props as Record<string, unknown> | null;
    const updatedAdditionalProps = {
        ...(currentAdditionalProps || {}),
        refund: {
            refund_id: refundResult.refund.id,
            refund_status: refundResult.refund.status,
            refund_amount: refundAmount,
            charged_amount: chargedAmount,
            paid_amount: paidAmount,
            initiated_at: new Date().toISOString(),
            source: 'manual_script',
        },
    };

    await PaymentTxnDbService.update(paymentTxn.id, {
        additional_props: updatedAdditionalProps as any,
        status: GenericPaymentTxnStatus.Refunded,
    });

    console.log(`  Payment txn status updated to REFUNDED`);
    console.log(`  DONE`);
}

async function main(): Promise<void> {
    console.log(`Refund Script - ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Date: ${new Date().toISOString()}`);

    try {
        // Connect to DB
        await databaseService.connect();
        console.log('Database connected.');

        for (const txn of TRANSACTIONS_TO_REFUND) {
            await refundTransaction(txn.beckn_transaction_id, txn.description);
        }
    }
    catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
    finally {
        await databaseService.disconnect();
        console.log('\nDatabase disconnected. Script complete.');
    }
}

main();
