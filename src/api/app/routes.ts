import { Router, Request, Response } from 'express';
import { BillDeskCallbackPayload, BillDeskPaymentServiceProps, BillDeskCredentials, BillDeskCreateLinkRequest } from '../../types/BillDesk';
import BillDeskPaymentService from '../../ubc/services/PaymentServices/Billdesk/BillDeskPaymentService';
import BillDeskPaymentGatewayService from '../../ubc/services/PaymentServices/Billdesk/index';
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
/**
 * Configure BillDesk credentials for a partner
 * POST /api/app/billdesk/configure/:partnerId
 */
router.post('/billdesk/configure/:partnerId', async (req: Request, res: Response) => {
    try {
        const { partnerId } = req.params;
        const credentials: BillDeskCredentials = req.body;

        if (!partnerId) {
            res.status(400).json({ success: false, error: 'Missing partnerId' });
            return;
        }

        // Get existing partner
        const partner = await OCPIPartnerDbService.getById(partnerId);
        if (!partner) {
            res.status(404).json({ success: false, error: 'Partner not found' });
            return;
        }

        // Update additional_props with BillDesk credentials
        const existingProps = partner.additional_props as OCPIPartnerAdditionalProps || {};
        const updatedProps: OCPIPartnerAdditionalProps = {
            ...existingProps,
            payment_services: {
                ...existingProps.payment_services,
                BillDesk: {
                    API_URL: credentials.API_URL,
                    CLIENT_ID: credentials.CLIENT_ID,
                    KEY_ID: credentials.KEY_ID,
                    SECRET_KEY: credentials.SECRET_KEY,
                    ENCRYPTION_KEY: credentials.ENCRYPTION_KEY,
                    MERCHANT_ID: credentials.MERCHANT_ID,
                    PROXY_HOST: credentials.PROXY_HOST,
                    PROXY_PORT: credentials.PROXY_PORT,
                },
            },
        };

        await OCPIPartnerDbService.update(partnerId, {
            additional_props: updatedProps as any,
        });

        // Clear credentials cache
        BillDeskInitializerService.clearCache(partnerId);

        res.status(200).json({
            success: true,
            message: 'BillDesk credentials updated successfully',
            partnerId,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

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
            // Clear existing order and set new authorization_reference
            const existingAdditionalProps = paymentTxn.additional_props as Record<string, unknown> || {};
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { payment_gateway_create_object: _, ...restAdditionalProps } = existingAdditionalProps;
            
            await PaymentTxnDbService.update(paymentTxnId, {
                authorization_reference: uniqueOrderId,
                additional_props: restAdditionalProps as any, // Clear the existing order
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

/**
 * Create Payment Link
 * POST /api/app/billdesk/create-link/:partnerId
 * Reference: https://docs.billdesk.io/reference/create-link
 * 
 * Body:
 * {
 *   "linkrefno": "unique-link-ref-123",
 *   "amount": "100.00",
 *   "link_expiry_date": "2025-12-31T23:59:59+05:30",
 *   "customer_name": "John Doe",
 *   "customer_email": "john@example.com",
 *   "customer_mobile": "9876543210",
 *   "link_description": "Payment for Order #123",
 *   "dissemination_mode": "EMAIL" // or "SMS" or "BOTH"
 * }
 */
router.post('/billdesk/create-link/:partnerId', async (req: Request, res: Response) => {
    try {
        const { partnerId } = req.params;
        const linkRequest = req.body as Partial<BillDeskCreateLinkRequest>;

        if (!partnerId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameter: partnerId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (!linkRequest.linkrefno || !linkRequest.amount) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields: linkrefno and amount are required',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Set default expiry if not provided (24 hours from now)
        if (!linkRequest.link_expiry_date) {
            const expiryDate = new Date();
            expiryDate.setHours(expiryDate.getHours() + 24);
            const tzOffset = -expiryDate.getTimezoneOffset();
            const tzSign = tzOffset >= 0 ? '+' : '-';
            const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
            const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');
            linkRequest.link_expiry_date = expiryDate.toISOString().slice(0, 19) + tzSign + tzHours + ':' + tzMinutes;
        }

        const createLinkRequest: BillDeskCreateLinkRequest = {
            mercid: '', // Will be set by the service
            linkrefno: linkRequest.linkrefno,
            amount: linkRequest.amount,
            currency: linkRequest.currency || '356',
            link_expiry_date: linkRequest.link_expiry_date,
            customer_name: linkRequest.customer_name,
            customer_email: linkRequest.customer_email,
            customer_mobile: linkRequest.customer_mobile,
            link_description: linkRequest.link_description,
            dissemination_mode: linkRequest.dissemination_mode,
            additional_info: linkRequest.additional_info,
        };

        const result = await BillDeskPaymentGatewayService.createLink(createLinkRequest, partnerId);

        if (result.success && result.link) {
            res.status(200).json({
                success: true,
                message: 'Payment link created successfully',
                data: {
                    bdlinkid: result.link.bdlinkid,
                    linkrefno: result.link.linkrefno,
                    link_url: result.link.link_url,
                    short_link_url: result.link.short_link_url,
                    amount: result.link.amount,
                    status: result.link.status,
                    link_expiry_date: result.link.link_expiry_date,
                    createdon: result.link.createdon,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.error || 'Failed to create payment link',
                error: result.error,
                error_details: result.error_details,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create payment link',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Retrieve Payment Link Status
 * GET /api/app/billdesk/link/:partnerId/:linkrefno
 * Reference: https://docs.billdesk.io/reference/retrieve-link
 */
router.get('/billdesk/link/:partnerId/:linkrefno', async (req: Request, res: Response) => {
    try {
        const { partnerId, linkrefno } = req.params;
        const { bdlinkid } = req.query;

        if (!partnerId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameter: partnerId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (!linkrefno && !bdlinkid) {
            res.status(400).json({
                success: false,
                message: 'Either linkrefno or bdlinkid is required',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        const result = await BillDeskPaymentGatewayService.retrieveLink(
            linkrefno,
            partnerId,
            bdlinkid as string | undefined
        );

        if (result.success && result.link) {
            res.status(200).json({
                success: true,
                message: 'Payment link retrieved successfully',
                data: {
                    bdlinkid: result.link.bdlinkid,
                    linkrefno: result.link.linkrefno,
                    link_url: result.link.link_url,
                    short_link_url: result.link.short_link_url,
                    amount: result.link.amount,
                    status: result.link.status,
                    link_expiry_date: result.link.link_expiry_date,
                    createdon: result.link.createdon,
                    transactionid: result.link.transactionid,
                    orderid: result.link.orderid,
                    payment_status: result.link.payment_status,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(404).json({
                success: false,
                message: result.error || 'Payment link not found',
                error: result.error,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve payment link',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
