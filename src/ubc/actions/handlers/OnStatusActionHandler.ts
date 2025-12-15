import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import Utils from "../../../utils/Utils";
import BppOnixRequestService from "../../services/BppOnixRequestService";
import { BecknDomain } from "../../schema/v2.0.0/enums/BecknDomain";
import { ExtractedOnStatusRequestBody } from "../../schema/v2.0.0/actions/status/types/ExtractedOnStatusRequestPayload";
import { UBCOnStatusRequestPayload } from "../../schema/v2.0.0/actions/status/types/OnStatusPayload";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import InitActionHandler from "./InitActionHandler";
import PaymentTxnDbService from "../../../db-services/PaymentTxnDbService";
import { BecknPaymentStatus } from "../../schema/v2.0.0/enums/PaymentStatus";

/**
 * Handler for status action
 */
export default class OnStatusActionHandler {
    public static async handleBppOnStatusRequest(reqDetails: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            logger.debug(`🟡 Received on_status request in handleBppOnStatusRequest`, { data: reqDetails });

            const body = reqDetails.body as ExtractedOnStatusRequestBody;
            
            // Forward on_status to BPP ONIX (no response needed as request comes from backend)
            await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction(body);
            

            logger.debug(`🟢 Sending on_status response in handleBppOnStatusRequest`, { data: {} });

            return UBCResponseService.ack();
        }
        catch (e: any) {
            logger.error(`🔴 Error in handleBppOnStatusRequest`, e, {
                data: { message: 'Something went wrong' },
            });

            return UBCResponseService.nack();
        }
    }

    public static async handleEVChargingUBCBppOnStatusAction(reqPayload: ExtractedOnStatusRequestBody): Promise<void> {
        const { authorization_reference } = reqPayload;
        const logData = { action: 'on_status', authorization_reference: authorization_reference };

        try {
            // Forward on_update to BPP ONIX
            logger.debug(`🟡 [${authorization_reference}] Forwarding on_update to BPP ONIX in handleEVChargingUBCBppOnUpdateAction`, { data: { logData, reqPayload } });
            const response = await OnStatusActionHandler.forwardOnStatusToBppOnix(reqPayload);
            logger.debug(`🟢 [${authorization_reference}] Forwarded on_update to BPP ONIX in handleEVChargingUBCBppOnUpdateAction`, { data: { response } });
        }
        catch (e: any) {
            logger.error(`🔴 [${authorization_reference}] Error in OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction: ${e?.toString()}`, e, {
                data: { logData },
            });
            throw e;
        }
    }

    
   public static translateBackendToUBC(existingBppOnStatusResponse: UBCOnStatusRequestPayload, backendOnStatusRequestPayload: ExtractedOnStatusRequestBody): UBCOnStatusRequestPayload {
       const ubcOnStatusPayload: UBCOnStatusRequestPayload = {
           context: {
               ...existingBppOnStatusResponse.context,
               action: BecknAction.on_status,
           },
           message: {
               order: {
                   ...existingBppOnStatusResponse.message.order,
                   "beckn:payment": {
                       ...existingBppOnStatusResponse.message.order['beckn:payment'],
                       "beckn:paymentStatus": backendOnStatusRequestPayload.payment_status,
                   },
               },
           },
       };

       return ubcOnStatusPayload;
   }

   /**
    * Receives on_status from backend and forwards to BPP ONIX
    * Backend → BPP Provider → BPP ONIX
    */
   public static async forwardOnStatusToBppOnix(payload: ExtractedOnStatusRequestBody): Promise<void> {
       const { authorization_reference, payment_status } = payload;

       const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
        where: {
            authorization_reference: authorization_reference,
        },
    });
        if (!paymentTxn) {
            throw new Error('No payment txn found');
        }
        const paymentStatus = paymentTxn.status;
        if (paymentStatus === BecknPaymentStatus.COMPLETED) {
            return;
        }

        if (paymentStatus !== BecknPaymentStatus.PENDING) {
            throw new Error('Payment txn is not pending');
        }


       const existingBppOnInitResponse = await InitActionHandler.fetchExistingBppOnInitResponse(paymentTxn.beckn_transaction_id);

       if (!existingBppOnInitResponse) {
           throw new Error('No existing on_init response found');
       }

       // Convert backend payload to UBC format
       PaymentTxnDbService.update(paymentTxn.id, {
        status: payment_status,
       });

       const ubcOnStatusPayload = this.translateBackendToUBC(existingBppOnInitResponse, payload);

       const bppHost = Utils.getBPPClientHost();

       return await BppOnixRequestService.sendPostRequest({
           url: `${bppHost}/${BecknAction.on_status}`,
           data: ubcOnStatusPayload,
       }, BecknDomain.EVChargingUBC);
   }
}

