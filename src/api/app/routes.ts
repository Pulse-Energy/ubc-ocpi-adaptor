import { Router, Request, Response, response } from 'express';
import { BillDeskCallbackPayload, BillDeskPaymentServiceProps, BillDeskCredentials, BillDeskCreateLinkRequest } from '../../types/BillDesk';
import BillDeskPaymentService from '../../ubc/services/PaymentServices/Billdesk/BillDeskPaymentService';
import BillDeskPaymentGatewayService from '../../ubc/services/PaymentServices/Billdesk/index';
import BillDeskInitializerService from '../../ubc/services/PaymentServices/Billdesk/BillDeskInitializerService';
import PaymentTxnDbService from '../../db-services/PaymentTxnDbService';
import OCPIPartnerDbService from '../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps } from '../../types/OCPIPartner';
import { logger } from '../../services/logger.service';

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

router.get('/check-payment-status/billdesk/:paymentTxnId', async (req: Request, res: Response) => {
    try {
        // Convert query params to body format

        const paymentTxn = await PaymentTxnDbService.getById(req.params.paymentTxnId);

        
        const paymentStatusResponse = await BillDeskPaymentGatewayService.retrieveTransaction(paymentTxn?.payment_gateway_order_id ?? '', paymentTxn?.partner_id ?? '');

        res.status(paymentStatusResponse.status || 200).json(paymentStatusResponse.response);
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
 * BillDesk Redirect Callback Endpoint (POST)
 * Shows a redirect page after payment completion
 * 
 * BillDesk sends these fields:
 * - error_type: Type of error (e.g., 'duplicate_request_error')
 * - error_code: Error code (e.g., 'TRDRE0001')
 * - encrypted_response: JWT encrypted transaction response
 * - message: Human readable message
 * - status: HTTP status code (e.g., '409')
 * - txnResponse: Transaction response object (may be '[object Object]')
 */
router.post('/redirect/billdesk', async (req: Request, res: Response) => {
    try {
        const { 
            error_type, 
            error_code, 
            encrypted_response, 
            message, 
            status,
            txnResponse 
        } = req.body;
        
        logger.info('BillDesk redirect callback received', {
            error_type,
            error_code,
            message,
            status,
            hasEncryptedResponse: !!encrypted_response,
            txnResponse,
        });
        
        // Determine if it's an error or success
        const isError = !!error_type || !!error_code || (status && status !== '200' && status !== 200);
        
        // Log encrypted_response if present (for debugging)
        if (encrypted_response) {
            logger.info('BillDesk encrypted_response received', { 
                length: encrypted_response.length,
            });
        }
        
        // Generate display message
        let displayMessage: string;
        if (isError) {
            // Map common error types to user-friendly messages
            if (error_type === 'duplicate_request_error') {
                displayMessage = 'This transaction has already been processed';
            }
            else {
                displayMessage = message || 'Payment could not be completed';
            }
        }
        else {
            displayMessage = 'Payment Complete';
        }

        const billDeskCallbackPayload = req.body as BillDeskCallbackPayload;
        await BillDeskPaymentService.billDeskCallBack(billDeskCallbackPayload);
        
        const html = BillDeskPaymentService.generateRedirectPage({
            message: displayMessage,
            isError,
            errorType: error_type,
            errorCode: error_code,
            statusCode: status,
        });

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
    }
    catch (error) {
        logger.error('BillDesk redirect callback error', error instanceof Error ? error : new Error(String(error)));
        
        const html = BillDeskPaymentService.generateRedirectPage({
            message: 'Something went wrong',
            isError: true,
        });
        
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
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
            `${req.protocol}://${req.get('host')}/api/app/redirect/billdesk`;

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

/**
 * Launch BillDesk Payment Page (Neo Full Redirect - Step 2)
 * GET /api/app/billdesk/pay/:paymentTxnId
 * 
 * This endpoint generates an HTML form that auto-submits to BillDesk's payment page.
 * The form uses the order data from Step 1 (Create Order API).
 * 
 * Reference: https://docs.billdesk.io/docs/neo-full-redirect
 */
router.get('/billdesk/pay/:paymentTxnId', async (req: Request, res: Response) => {
    try {
        const { paymentTxnId } = req.params;
        const { autoSubmit } = req.query; // Set to 'false' to show a button instead of auto-submit

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
            res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Payment Not Found</title></head>
                <body>
                    <h1>Payment Not Found</h1>
                    <p>The payment transaction was not found.</p>
                </body>
                </html>
            `);
            return;
        }

        // Get the BillDesk order from additional_props
        const additionalProps = paymentTxn.additional_props as Record<string, unknown> | null;
        const billDeskOrder = additionalProps?.payment_gateway_create_object as any;

        if (!billDeskOrder || !billDeskOrder.bdorderid) {
            res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Order Not Created</title></head>
                <body>
                    <h1>Order Not Created</h1>
                    <p>No BillDesk order found for this payment. Please create an order first.</p>
                </body>
                </html>
            `);
            return;
        }

        // Find the redirect link in the order response
        const redirectLink = billDeskOrder.links?.find((link: any) => link.rel === 'redirect');

        if (!redirectLink || !redirectLink.href || !redirectLink.parameters) {
            res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Invalid Order</title></head>
                <body>
                    <h1>Invalid Order</h1>
                    <p>The order does not contain a valid redirect link.</p>
                </body>
                </html>
            `);
            return;
        }

        // Check if order has expired
        if (redirectLink.valid_date) {
            const validUntil = new Date(redirectLink.valid_date);
            if (validUntil < new Date()) {
                res.status(410).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Order Expired</title></head>
                    <body>
                        <h1>Order Expired</h1>
                        <p>This payment order has expired. Please create a new order.</p>
                        <p>Expired at: ${redirectLink.valid_date}</p>
                    </body>
                    </html>
                `);
                return;
            }
        }

        // Extract form data
        const formAction = redirectLink.href;
        const merchantId = redirectLink.parameters.mercid || billDeskOrder.mercid;
        const bdOrderId = redirectLink.parameters.bdorderid || billDeskOrder.bdorderid;
        const rdata = redirectLink.parameters.rdata;

        // Generate the HTML form
        const shouldAutoSubmit = autoSubmit !== 'false';
        const html = generateBillDeskPaymentForm({
            formAction,
            merchantId,
            bdOrderId,
            rdata,
            amount: billDeskOrder.amount,
            orderId: billDeskOrder.orderid,
            autoSubmit: shouldAutoSubmit,
        });

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    }
    catch (error) {
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>Error</h1>
                <p>Failed to load payment page: ${error instanceof Error ? error.message : 'Unknown error'}</p>
            </body>
            </html>
        `);
    }
});

/**
 * Generate BillDesk Payment Form HTML
 * Reference: https://docs.billdesk.io/docs/neo-full-redirect
 */
function generateBillDeskPaymentForm(params: {
    formAction: string;
    merchantId: string;
    bdOrderId: string;
    rdata: string;
    amount?: string;
    orderId?: string;
    autoSubmit?: boolean;
}): string {
    const { formAction, merchantId, bdOrderId, rdata, amount, orderId, autoSubmit = true } = params;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting to Payment...</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .logo {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .logo svg {
            width: 40px;
            height: 40px;
            fill: white;
        }
        h1 {
            color: #333;
            font-size: 24px;
            margin-bottom: 10px;
        }
        .amount {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            margin: 20px 0;
        }
        .order-id {
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        p {
            color: #666;
            margin-top: 15px;
        }
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 40px;
            font-size: 16px;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }
        .secure-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 20px;
            color: #28a745;
            font-size: 14px;
        }
        .secure-badge svg {
            width: 16px;
            height: 16px;
            fill: #28a745;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
            </svg>
        </div>
        <h1>Secure Payment</h1>
        ${amount ? `<div class="amount">₹${amount}</div>` : ''}
        ${orderId ? `<div class="order-id">Order ID: ${orderId}</div>` : ''}
        
        <form name="sdklaunch" id="sdklaunch" action="${formAction}" method="POST">
            <input type="hidden" id="merchantid" name="merchantid" value="${merchantId}" />
            <input type="hidden" id="bdorderid" name="bdorderid" value="${bdOrderId}" />
            <input type="hidden" id="rdata" name="rdata" value="${rdata}" />
            ${autoSubmit 
                ? `<div class="spinner"></div><p>Redirecting to secure payment gateway...</p>`
                : `<button type="submit" class="btn">Proceed to Pay</button>`
            }
        </form>
        
        <div class="secure-badge">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
            </svg>
            <span>Secured by BillDesk</span>
        </div>
    </div>
    
    ${autoSubmit ? `
    <script>
        // Auto-submit the form after a brief delay for better UX
        setTimeout(function() {
            document.getElementById('sdklaunch').submit();
        }, 1500);
    </script>
    ` : ''}
</body>
</html>
    `.trim();
}

export default router;
