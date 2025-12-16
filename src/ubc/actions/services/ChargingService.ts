import PaymentTxnDbService from "../../../db-services/PaymentTxnDbService";
import { ChargingSessionStatus } from "../../schema/v2.0.0/enums/ChargingSessionStatus";
import { Session } from "@prisma/client";
import AdminCommandsModule from "../../../admin/modules/AdminCommandsModule";
import { Request } from 'express';
import OnUpdateActionHandler from "../handlers/OnUpdateActionHandler";
import { logger } from "../../../services/logger.service";


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

            if(requested_energy_units === 0 || requested_energy_units < (session?.kwh?.toNumber() ?? 0)) {
                const req = {
                    body: {
                        partner_id: session?.partner_id,
                        session_id: session?.cpo_session_id,
                    },
                } as Request;

                logger.debug(`🟡 ${authorization_reference} Sending stop charging request in autoCutOffChargingSession`, {
                    data: { req },
                });


                const response = await AdminCommandsModule.stopCharging(req);
                logger.debug(`🟢 ${authorization_reference} Sent stop charging request in autoCutOffChargingSession`, {
                    data: { req, response },
                });
                await OnUpdateActionHandler.handleEVChargingUBCBppOnUpdateAction({
                    beckn_transaction_id: session?.authorization_reference ?? '',
                    beckn_order_id: session?.authorization_reference ?? '',
                    session_status: ChargingSessionStatus.COMPLETED,
                });
                logger.debug(`🟢 ${authorization_reference} Sent on_update request in autoCutOffChargingSession`, {
                    data: { req },
                });
            }
        }
        
        catch (error: any) {
            logger.error(`🔴 Error in autoCutOffChargingSession`, error, {
                data: { message: 'Something went wrong' },
            });
        }
    }
}