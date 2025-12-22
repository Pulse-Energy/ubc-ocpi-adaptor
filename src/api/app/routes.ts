import { Router, Request, Response } from 'express';
import { BillDeskCallbackPayload, BillDeskPaymentServiceProps, BillDeskCredentials } from '../../types/BillDesk';
import BillDeskPaymentService from '../../ubc/services/PaymentServices/Billdesk/BillDeskPaymentService';
import BillDeskInitializerService from '../../ubc/services/PaymentServices/Billdesk/BillDeskInitializerService';
import PaymentTxnDbService from '../../db-services/PaymentTxnDbService';
import OCPIPartnerDbService from '../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps } from '../../types/OCPIPartner';

const router = Router();

/**
 * BillDesk Webhook/Redirect Callback Endpoint
 * Handles both:
 * 1. Server-to-server webhook callbacks (POST with msg parameter)
 * 2. Customer redirect callbacks (POST with transaction_response parameter)
 */
router.post('/callback/billdesk', async (req: Request, res: Response) => {
    try {
        const billDeskCallbackPayload = req.body as BillDeskCallbackPayload;
        const response = await BillDeskPaymentService.billDeskCallBack(billDeskCallbackPayload);

        res.status(response.httpStatus || 200).json(response.payload);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Callback processing failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * BillDesk Redirect Callback Endpoint (GET)
 * Some payment gateways redirect via GET with query parameters
 */
router.get('/callback/billdesk', async (req: Request, res: Response) => {
    try {
        // Convert query params to body format
        const billDeskCallbackPayload: BillDeskCallbackPayload = {
            transaction_response: req.query.transaction_response as string,
            terminal_state: req.query.terminal_state as string,
            mercid: req.query.mercid as string,
            orderid: req.query.orderid as string,
        };
        
        const response = await BillDeskPaymentService.billDeskCallBack(billDeskCallbackPayload);

        res.status(response.httpStatus || 200).json(response.payload);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Callback processing failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Create BillDesk Order from existing PaymentTxn
 * POST /api/app/billdesk/create-order/:paymentTxnId
 * 
 * Optional body:
 * {
 *   "returnUrl": "https://custom-return-url.com/callback" (optional, defaults to partner config),
 *   "newOrderId": true (optional, generates a new unique order ID)
 * }
 */
router.post('/billdesk/create-order/:paymentTxnId', async (req: Request, res: Response) => {
    try {
        const { paymentTxnId } = req.params;
        const { returnUrl, newOrderId } = req.body;

        if (!paymentTxnId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameter: paymentTxnId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Fetch PaymentTxn from DB
        const paymentTxn = await PaymentTxnDbService.getById(paymentTxnId);

        if (!paymentTxn) {
            res.status(404).json({
                success: false,
                message: 'PaymentTxn not found',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (!paymentTxn.partner_id) {
            res.status(400).json({
                success: false,
                message: 'PaymentTxn does not have a partner_id',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Get partner to fetch return URL from config if not provided
        const partner = await OCPIPartnerDbService.getById(paymentTxn.partner_id);
        const partnerAdditionalProps = partner?.additional_props as OCPIPartnerAdditionalProps | null;
        
        const callbackUrl = returnUrl || 
            partnerAdditionalProps?.communication_urls?.webhook_callback?.url ||
            `${req.protocol}://${req.get('host')}/api/app/callback/billdesk`;

        // Generate new unique order ID if requested (to avoid 409 conflict on retries)
        if (newOrderId) {
            const uniqueOrderId = `ORD${Date.now()}`;
            await PaymentTxnDbService.update(paymentTxnId, {
                authorization_reference: uniqueOrderId,
            });
            // Refetch the updated payment txn
            const updatedPaymentTxn = await PaymentTxnDbService.getById(paymentTxnId);
            if (updatedPaymentTxn) {
                Object.assign(paymentTxn, updatedPaymentTxn);
            }
        }

        // Build device props
        const billDeskPaymentServiceProps: BillDeskPaymentServiceProps = {
            return_url: callbackUrl,
            bill_desk_device: {
                init_channel: "APP",
                ip: "192.168.1.1",
                user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                accept_header: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                fingerprintid: "abc123xy123123123123z",
                browser_tz: "GMT+0530",
                browser_color_depth: "24",
                browser_java_enabled: "false",
                browser_screen_height: "1080",
                browser_screen_width: "1920",
                browser_language: "en-US",
                browser_javascript_enabled: "true"
            },
        };

        // Create order with BillDesk
        const result = await BillDeskPaymentService.createOrderWithBillDeskPaymentGateway(
            paymentTxn,
            billDeskPaymentServiceProps
        );

        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'BillDesk order created successfully',
                data: {
                    paymentTxnId: paymentTxn.id,
                    paymentUrl: result.billDeskObject?.payment_url,
                    bdOrderId: result.billDeskOrder?.bdorderid,
                    orderId: result.billDeskOrder?.orderid,
                    authorizationReference: result.billDeskObject?.authorization_reference,
                    billDeskOrder: result.billDeskOrder,
                    billDeskObject: result.billDeskObject,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.error || 'Create order request failed',
                error: result.error,
                error_details: (result as any).error_details,
                paymentTxnId: paymentTxn.id,
                partnerId: paymentTxn.partner_id,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'BillDesk order creation failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});


export default router;
