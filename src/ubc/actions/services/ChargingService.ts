import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { Session } from '@prisma/client';
import AdminCommandsModule from '../../../admin/modules/AdminCommandsModule';
import { Request } from 'express';
import OnUpdateActionHandler from '../handlers/OnUpdateActionHandler';
import { logger } from '../../../services/logger.service';
import InvoiceGenerationService from '../../services/invoice/InvoiceGeneration';
import { CdrDbService } from '../../../db-services/CdrDbService';
import { SessionDbService } from '../../../db-services/SessionDbService';
import PaymentGatewayService from '../../services/PaymentServices/PaymentGatewayService';

// OCPIPrice type for total_cost field
interface OCPIPrice {
    excl_vat: number;
    incl_vat?: number;
}

export default class ChargingService {
    public static async autoCutOffChargingSession(session: Session): Promise<void> {
        try {
            if (session.status !== ChargingSessionStatus.ACTIVE) {
                return;
            }

            const authorization_reference = session.authorization_reference ?? '';

            let requested_energy_units = session.requested_energy_units?.toNumber();
            if (requested_energy_units === undefined || requested_energy_units === null) {
                const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                    where: {
                        authorization_reference: session.authorization_reference ?? '',
                    },
                });

                requested_energy_units = paymentTxn?.requested_energy_units?.toNumber() ?? 0;
            }

            if (
                requested_energy_units === 0 ||
                requested_energy_units < (session?.kwh?.toNumber() ?? 0)
            ) {
                const req = {
                    body: {
                        partner_id: session?.partner_id,
                        session_id: session?.cpo_session_id,
                    },
                } as Request;

                logger.debug(
                    `🟡 ${authorization_reference} Sending stop charging request in autoCutOffChargingSession`,
                    {
                        data: { req },
                    }
                );

                const response = await AdminCommandsModule.stopCharging(req);
                logger.debug(
                    `🟢 ${authorization_reference} Sent stop charging request in autoCutOffChargingSession`,
                    {
                        data: { req, response },
                    }
                );
                const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                    where: {
                        authorization_reference: session.authorization_reference ?? '',
                    },
                });

                const becknTransactionId = paymentTxn?.beckn_transaction_id ?? '';

                await OnUpdateActionHandler.handleEVChargingUBCBppOnUpdateAction({
                    beckn_transaction_id: becknTransactionId,
                    beckn_order_id: paymentTxn?.authorization_reference ?? '',
                    session_status: ChargingSessionStatus.COMPLETED,
                });
                logger.debug(
                    `🟢 ${authorization_reference} Sent on_update request in autoCutOffChargingSession`,
                    {
                        data: {
                            beckn_transaction_id: becknTransactionId,
                            beckn_order_id: paymentTxn?.authorization_reference ?? '',
                            session_status: ChargingSessionStatus.COMPLETED,
                        },
                    }
                );
            }
        } 
        catch (error: any) {
            logger.error(`🔴 Error in autoCutOffChargingSession`, error, {
                data: { message: 'Something went wrong' },
            });
        }
    }

    public static async handleActionOnChargingCompleted(
        authorization_reference: string
    ): Promise<void> {
        try {
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: authorization_reference,
                },
            });

            const invoiceResponse = await InvoiceGenerationService.generateInvoice(
                authorization_reference,
                paymentTxn?.partner_id ?? ''
            );

            // Store invoice response in CDR table if invoice was generated successfully
            if (invoiceResponse.success && invoiceResponse.invoice_data) {
                try {
                    
                    // Find CDR by authorization_reference
                    const cdr = await CdrDbService.getByAuthorizationReference(authorization_reference);

                    if (cdr) {
                        // Update CDR with invoice details
                        await CdrDbService.update(cdr.id, {
                            invoice_details: invoiceResponse.invoice_data
                        });
                        
                        logger.info(
                            `🟢 ${authorization_reference} Stored invoice details in CDR`,
                            {
                                data: {
                                    cdr_id: cdr.id,
                                    invoice_url: invoiceResponse.invoice_url,
                                },
                            }
                        );
                    }
                    else {
                        logger.warn(
                            `🟡 ${authorization_reference} CDR not found to store invoice details`,
                            {
                                data: { authorization_reference },
                            }
                        );
                    }
                }
                catch (cdrError: any) {
                    logger.error(
                        `🔴 ${authorization_reference} Failed to store invoice in CDR`,
                        cdrError,
                        {
                            data: { authorization_reference },
                        }
                    );
                }
            }

            const session = await SessionDbService.getByAuthorizationReference(authorization_reference);

            // Process refund if there's excess payment
            // Refund amount = payment_txn.amount - session.total_cost
            if (paymentTxn && session) {
                await ChargingService.processRefundIfRequired(paymentTxn.id, session, authorization_reference);
            }

            const becknTransactionId = paymentTxn?.beckn_transaction_id ?? '';
            await OnUpdateActionHandler.handleEVChargingUBCBppOnUpdateAction({
                beckn_transaction_id: becknTransactionId,
                beckn_order_id: paymentTxn?.authorization_reference ?? '',
                session_status: ChargingSessionStatus.COMPLETED,
                invoice_url: invoiceResponse.invoice_url,
            });
            logger.debug(
                `🟢 ${authorization_reference} Sent on_update request in handleActionOnChargingCompleted`,
                {
                    data: {
                        beckn_transaction_id: becknTransactionId,
                        beckn_order_id: paymentTxn?.authorization_reference ?? '',
                        session_status: ChargingSessionStatus.COMPLETED,
                    },
                }
            );
        } 
        catch (error: any) {
            logger.error(
                `🔴 ${authorization_reference} Error in handleActionOnChargingCompleted`,
                error,
                {
                    data: { message: 'Something went wrong' },
                }
            );
        }
    }

    /**
     * Calculate and process refund if the payment amount exceeds the session total cost
     * Refund amount = payment_txn.amount - session.total_cost.excl_vat
     * 
     * @param paymentTxnId - Payment transaction ID
     * @param session - Session object with total_cost
     * @param authorization_reference - Authorization reference for logging
     */
    public static async processRefundIfRequired(
        paymentTxnId: string,
        session: Session,
        authorization_reference: string
    ): Promise<void> {
        try {
            // Get the payment transaction
            const paymentTxn = await PaymentTxnDbService.getById(paymentTxnId);
            
            if (!paymentTxn) {
                logger.warn(
                    `🟡 ${authorization_reference} Refund: Payment transaction not found`,
                    { data: { paymentTxnId } }
                );
                return;
            }

            // Get the total cost from session (OCPIPrice format)
            const totalCost = session.total_cost as unknown as OCPIPrice | null;
            
            if (!totalCost || totalCost.excl_vat === undefined) {
                logger.warn(
                    `🟡 ${authorization_reference} Refund: Session total_cost not available`,
                    { data: { authorization_reference, sessionId: session.id } }
                );
                return;
            }

            // Calculate refund amount = payment_txn.amount - session.total_cost.excl_vat
            const paidAmount = Number(paymentTxn.amount);
            const chargedAmount = totalCost.excl_vat;
            const refundAmount = paidAmount - chargedAmount;

            logger.info(
                `🟡 ${authorization_reference} Refund calculation`,
                {
                    data: {
                        paidAmount,
                        chargedAmount,
                        refundAmount,
                        sessionId: session.id,
                        paymentTxnId: paymentTxn.id,
                    },
                }
            );

            // Only process refund if amount is positive and above minimum threshold (e.g., ₹1)
            const MINIMUM_REFUND_AMOUNT = 1;
            if (refundAmount <= MINIMUM_REFUND_AMOUNT) {
                logger.info(
                    `🟢 ${authorization_reference} Refund: No refund required (refund amount: ₹${refundAmount.toFixed(2)})`,
                    {
                        data: {
                            paidAmount,
                            chargedAmount,
                            refundAmount,
                        },
                    }
                );
                return;
            }

            // Process the refund
            logger.info(
                `🟡 ${authorization_reference} Refund: Processing refund of ₹${refundAmount.toFixed(2)}`,
                {
                    data: {
                        paidAmount,
                        chargedAmount,
                        refundAmount,
                        paymentTxnId: paymentTxn.id,
                    },
                }
            );

            const refundResult = await PaymentGatewayService.processRefund({
                payment_txn_id: paymentTxn.id,
                refund_amount: refundAmount,
                reason: `Charging session completed. Charged: ₹${chargedAmount.toFixed(2)}, Paid: ₹${paidAmount.toFixed(2)}`,
            });

            if (refundResult.success) {
                logger.info(
                    `🟢 ${authorization_reference} Refund: Successfully initiated`,
                    {
                        data: {
                            refund_id: refundResult.refund_id,
                            refund_status: refundResult.refund_status,
                            refundAmount,
                            paymentTxnId: paymentTxn.id,
                        },
                    }
                );

                // Update payment txn with refund details
                const currentAdditionalProps = paymentTxn.additional_props as Record<string, unknown> | null;
                const updatedAdditionalProps = {
                    ...(currentAdditionalProps || {}),
                    refund: {
                        refund_id: refundResult.refund_id,
                        refund_status: refundResult.refund_status,
                        refund_amount: refundAmount,
                        charged_amount: chargedAmount,
                        paid_amount: paidAmount,
                        initiated_at: new Date().toISOString(),
                    },
                };

                await PaymentTxnDbService.update(paymentTxn.id, {
                    additional_props: updatedAdditionalProps as any,
                });
            }
            else {
                logger.error(
                    `🔴 ${authorization_reference} Refund: Failed to process`,
                    undefined,
                    {
                        data: {
                            error: refundResult.error,
                            refundAmount,
                            paymentTxnId: paymentTxn.id,
                        },
                    }
                );
            }
        }
        catch (error: any) {
            logger.error(
                `🔴 ${authorization_reference} Refund: Error processing refund`,
                error,
                {
                    data: {
                        paymentTxnId,
                        sessionId: session.id,
                    },
                }
            );
        }
    }
}
