import { Router, Request, Response } from 'express';
import { BillDeskCallbackPayload } from '../../types/BillDesk';
import BillDeskPaymentService from '../../ubc/services/PaymentServices/Billdesk/BillDeskPaymentService';

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

export default router;
