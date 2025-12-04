import { logger } from "../../services/logger.service";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default class BecknLoggingService {
    public static async log(data: {
        reqId?: string,
        url?: string,
        method?: string,
        payload: any,
        headers?: any,
        action: string,
    }): Promise<void> {
        logger.debug(`🟡 Starting BecknLoggingService.log`, { data: data });
        // Logger.log(`Beckn Log`, {
        //     data: data,
        // });

        // log to db
        // const transactionId = data?.payload?.context?.transaction_id || data?.payload?.metadata?.beckn_transaction_id || '';
        // const messageId = data?.payload?.context?.message_id || '';
        // const domain = data?.payload?.context?.domain || data?.payload?.metadata?.domain || '';
        // const action = data?.payload?.context?.action ? `${data.action}.${data.payload.context.action}` : data.url?.split('/').pop() ? `${data.action}.${data.url.split('/').pop()}` : data.action;

        // BecknLogDbHelper.create({
        //     data: {
        //         action: action,
        //         domain: domain,
        //         transaction_id: transactionId,
        //         message_id: messageId,
        //         payload: data.payload,
        //         additional_props: {
        //             reqId: data?.reqId || '',
        //             url: data?.url || '',
        //             method: data?.method || '',
        //         }
        //     },
        // })
            // .catch((error) => {
            //     Logger.error('Error logging Beckn log', {
            //         error: error?.message,
            //         data: data,
            //     });
            // });

        return;
    }
}
