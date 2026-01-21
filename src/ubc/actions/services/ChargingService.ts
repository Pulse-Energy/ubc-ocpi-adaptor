import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { CDR, Session } from '@prisma/client';
import AdminCommandsModule from '../../../admin/modules/AdminCommandsModule';
import { Request } from 'express';
import OnUpdateActionHandler from '../handlers/OnUpdateActionHandler';
import { logger } from '../../../services/logger.service';
import InvoiceGenerationService from '../../services/invoice/InvoiceGeneration';
import { CdrDbService } from '../../../db-services/CdrDbService';
import { SessionDbService } from '../../../db-services/SessionDbService';
import PaymentGatewayService from '../../services/PaymentServices/PaymentGatewayService';
import { databaseService } from '../../../services/database.service';
import { OCPIPrice } from '../../../ocpi/schema/general/types';
import { ServiceCharge } from '../../types/ServiceCharge';
import { FinalAmount } from '../../types/FinalAmount';
import { calculateFinalAmountFromCDR } from '../../utils/OrderValueCalculator';
import OnStatusActionHandler from '../handlers/OnStatusActionHandler';
import { GenericPaymentTxnStatus } from '../../../types/BillDesk';

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
        sessionId: string
    ): Promise<void> {
        try {
            // Get session by cpo_session_id (OCPI session_id)
            const session = await SessionDbService.findFirstByFilters({
                cpo_session_id: sessionId,
                deleted: false,
            });

            if (!session) {
                logger.warn(
                    `🟡 Session not found for sessionId: ${sessionId} in handleActionOnChargingCompleted`,
                    {
                        data: { sessionId },
                    }
                );
                return;
            }

            const authorization_reference = session.authorization_reference;
            if (!authorization_reference) {
                logger.warn(
                    `🟡 Authorization reference not found for sessionId: ${sessionId} in handleActionOnChargingCompleted`,
                    {
                        data: { sessionId, session_id: session.id },
                    }
                );
                return;
            }

            // Get payment txn from session's authorization_reference
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: authorization_reference,
                },
            });

            const invoiceResponse = await InvoiceGenerationService.generateInvoice(
                authorization_reference,
                paymentTxn?.partner_id ?? ''
            );

            // Get CDR by session_id (CDR.session_id maps to Session.cpo_session_id)
            const storedCdr = await databaseService.prisma.cDR.findFirst({
                where: {
                    session_id: sessionId,
                    deleted: false,
                },
            });

            // Store invoice response in CDR table if invoice was generated successfully
            if (invoiceResponse.success && invoiceResponse) {
                try {
                    if (storedCdr) {
                        // Update CDR with invoice details
                        await CdrDbService.update(storedCdr.id, {
                            invoice_details: invoiceResponse.invoice_data
                        });
                        
                        logger.info(
                            `🟢 ${authorization_reference} Stored invoice details in CDR`,
                            {
                                data: {
                                    cdr_id: storedCdr.id,
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

            const becknTransactionId = paymentTxn?.beckn_transaction_id ?? '';
            
            // Use CDR-based on_update if CDR is available (includes order_value from CDR)
            // Otherwise fall back to the old method
            if (storedCdr) {
                logger.debug(
                    `🟡 ${authorization_reference} Sending on_update from CDR in handleActionOnChargingCompleted`,
                    {
                        data: {
                            authorization_reference,
                            cdr_id: storedCdr.id,
                        },
                    }
                );
                await OnUpdateActionHandler.handleOnUpdateFromCDR(authorization_reference, storedCdr)
                    .then(() => {
                        logger.debug(
                            `🟢 ${authorization_reference} Successfully sent on_update from CDR in handleActionOnChargingCompleted`,
                            {
                                data: {
                                    authorization_reference,
                                    cdr_id: storedCdr?.id,
                                },
                            }
                        );
                    })
                    .catch((e: any) => {
                        logger.error(
                            `🔴 ${authorization_reference} Error sending on_update from CDR in handleActionOnChargingCompleted: ${e?.toString()}`,
                            e,
                            {
                                data: { authorization_reference, cdr_id: storedCdr?.id },
                            }
                        );
                    });
            }
            else {
                // Fallback to old method if CDR is not available
                logger.debug(
                    `🟡 ${authorization_reference} CDR not available, using fallback on_update method in handleActionOnChargingCompleted`,
                    {
                        data: { authorization_reference },
                    }
                );
                await OnUpdateActionHandler.handleEVChargingUBCBppOnUpdateAction({
                    beckn_transaction_id: becknTransactionId,
                    beckn_order_id: paymentTxn?.authorization_reference ?? '',
                    session_status: ChargingSessionStatus.COMPLETED,
                    invoice_url: invoiceResponse.invoice_url,
                });
                logger.debug(
                    `🟢 ${authorization_reference} Sent on_update request (fallback) in handleActionOnChargingCompleted`,
                    {
                        data: {
                            beckn_transaction_id: becknTransactionId,
                            beckn_order_id: paymentTxn?.authorization_reference ?? '',
                            session_status: ChargingSessionStatus.COMPLETED,
                        },
                    }
                );
            }

            // Process refund if there's excess payment
            // Refund amount = payment_txn.amount - session.total_cost
            if (paymentTxn && session && storedCdr) {
                await ChargingService.processRefundIfRequired(storedCdr, paymentTxn.id, session, authorization_reference);
            }
        } 
        catch (error: any) {
            logger.error(
                `🔴 ${sessionId} Error in handleActionOnChargingCompleted`,
                error,
                {
                    data: { sessionId, message: 'Something went wrong' },
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
        cdr: CDR,
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

            // Get the final amount from session (FinalAmount format)
            let finalAmount = session.final_amount as FinalAmount;
            
            if (!finalAmount || finalAmount.total === undefined) {
                const totalCost = cdr.total_cost as unknown as OCPIPrice;

                // Get service charge from payment_txn if available
                const serviceCharge = paymentTxn?.service_charge as ServiceCharge | null | undefined;

                // Calculate final amount using shared logic with service charge percentages
                finalAmount = calculateFinalAmountFromCDR(totalCost, serviceCharge);

                // Add this to DB
                if (cdr.session_id) {
                    const session = await SessionDbService.getByCpoSessionId(cdr.session_id);
                    if (session) {
                        await SessionDbService.update(session.id, {
                            final_amount: finalAmount,
                        });
                    }
                }

                logger.warn(
                    `🟡 ${authorization_reference} Refund: Session final_amount not available`,
                    { data: { authorization_reference, sessionId: session.id } }
                );
                return;
            }

            // Calculate refund amount = payment_txn.amount - session.final_amount.total
            const paidAmount = Number(paymentTxn.amount);
            const chargedAmount = finalAmount.total;
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
                    status: GenericPaymentTxnStatus.Refunded,
                });

                logger.info(
                    `🟢 ${authorization_reference} Refund: Updated payment transaction status to REFUNDED`,
                    {
                        data: {
                            paymentTxnId: paymentTxn.id,
                            old_status: paymentTxn.status,
                            new_status: GenericPaymentTxnStatus.Refunded,
                        },
                    }
                );

                // Send on_status request to BAP
                try {
                    await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                        authorization_reference: paymentTxn.authorization_reference,
                        payment_status: GenericPaymentTxnStatus.Refunded,
                        oldPaymentStatus: GenericPaymentTxnStatus.Success,
                    });
                    logger.info(
                        `🟢 ${authorization_reference} Refund: Successfully sent on_status to BAP`,
                        {
                            data: {
                                paymentTxnId: paymentTxn.id,
                                authorization_reference: paymentTxn.authorization_reference,
                                payment_status: GenericPaymentTxnStatus.Refunded,
                            },
                        }
                    );
                }
                catch (statusError: unknown) {
                    // Log error but don't fail - refund was already processed
                    const err = statusError instanceof Error ? statusError : new Error(String(statusError));
                    logger.error(
                        `🔴 ${authorization_reference} Refund: Failed to send on_status to BAP`,
                        err,
                        {
                            data: {
                                paymentTxnId: paymentTxn.id,
                                authorization_reference: paymentTxn.authorization_reference,
                            },
                        }
                    );
                }
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
