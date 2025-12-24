import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { Session } from '@prisma/client';
import AdminCommandsModule from '../../../admin/modules/AdminCommandsModule';
import { Request } from 'express';
import OnUpdateActionHandler from '../handlers/OnUpdateActionHandler';
import { logger } from '../../../services/logger.service';
import InvoiceGenerationService from '../../services/invoice/InvoiceGeneration';
import { CdrDbService } from '../../../db-services/CdrDbService';

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

            const becknTransactionId = paymentTxn?.beckn_transaction_id ?? '';
            await OnUpdateActionHandler.handleEVChargingUBCBppOnUpdateAction({
                beckn_transaction_id: becknTransactionId,
                beckn_order_id: paymentTxn?.authorization_reference ?? '',
                session_status: ChargingSessionStatus.COMPLETED,
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
}
