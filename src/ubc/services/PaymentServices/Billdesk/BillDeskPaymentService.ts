/**
 * BillDesk Payment Service
 * Handles webhook callbacks, order creation, and payment processing for BillDesk integration
 * Documentation: https://docs.billdesk.io/docs/neo-full-redirect
 */
import { PaymentTxn } from "@prisma/client";
import { logger } from "../../../../services/logger.service";
import PaymentTxnDbService from "../../../../db-services/PaymentTxnDbService";
import ResponsesService from "../../../../services/Responses.service";
import BillDeskPaymentGatewayService from "./index";
import {
    BillDeskCallbackPayload,
    BillDeskCallbackDecodedResponse,
    BillDeskRetrieveTransactionResponse,
    BillDeskCreateOrderRequest,
    BillDeskCreateOrderResponse,
    BillDeskObject,
    BillDeskPaymentServiceProps,
    BillDeskTransactionAuthStatus,
    GenericPaymentTxnStatus,
    PaymentSDK,
    mapBillDeskStatusToGeneric,
    CreateOrderWithBillDeskResponse,
} from "../../../../types/BillDesk";
import { HttpResponse } from "../../../../types/responses";
import OnStatusActionHandler from "../../../actions/handlers/OnStatusActionHandler";
import { BecknPaymentStatus } from "../../../schema/v2.0.0/enums/PaymentStatus";
import { PaymentTxnAdditionalProps } from "../../../../types/PaymentTxn";
import Utils from "../../../../utils/Utils";

// Helper function to extract error message
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
};

// Helper function to map GenericPaymentTxnStatus to BecknPaymentStatus
const mapGenericToBecknStatus = (status: string): BecknPaymentStatus | null => {
    switch (status) {
        case GenericPaymentTxnStatus.Success:
            return BecknPaymentStatus.COMPLETED;
        case GenericPaymentTxnStatus.Failed:
            return BecknPaymentStatus.FAILED;
        case GenericPaymentTxnStatus.Pending:
            return BecknPaymentStatus.PENDING;
        case GenericPaymentTxnStatus.Refunded:
            return BecknPaymentStatus.REFUNDED;
        default:
            return null;
    }
};

export default class BillDeskPaymentService {
    /**
     * Handle BillDesk webhook callback
     * This method processes both redirect callbacks and webhook notifications
     * 
     * Callback types:
     * 1. Webhook (msg parameter) - Server-to-server notification with pipe-separated data
     * 2. Redirect (transaction_response parameter) - Customer redirect with JWT encoded response
     * 3. Page closure (terminal_state=111) - User closed payment page
     * 
     * @param reqPayload - The callback payload from BillDesk
     * @returns Response indicating success/failure
     */
    public static async billDeskCallBack(reqPayload: BillDeskCallbackPayload): Promise<HttpResponse<any>> {
        try {
            logger.info('BillDesk Callback Request Payload', { reqPayload });

            let paymentTxn: PaymentTxn | null = null;
            let decodedResponse: BillDeskCallbackDecodedResponse | null = null;

            // Handle different callback types
            if (reqPayload.msg) {
                // Webhook callback (pipe-separated format)
                const orderId = reqPayload.msg.split("|")[1];
                logger.info('BillDesk Webhook Callback - extracting orderId', {
                    msg: reqPayload.msg,
                    orderId,
                });
                paymentTxn = await PaymentTxnDbService.getByOrderId(orderId);
            }
            else if (reqPayload.transaction_response) {
                // Redirect callback (JWT encoded transaction response)
                const response = reqPayload.transaction_response;
                decodedResponse = await BillDeskPaymentGatewayService.decodeString(response);

                logger.info('BillDesk Redirect Callback - decoded response', { decodedResponse });

                if (!decodedResponse) {
                    logger.error('BillDesk: Failed to decode transaction response', undefined, { reqPayload });
                    return ResponsesService.success({
                        success: true,
                        message: 'success',
                        data: {}
                    });
                }

                const orderId = decodedResponse.orderid;
                paymentTxn = await PaymentTxnDbService.getByOrderId(orderId);
            }
            else if (reqPayload.terminal_state === '111') {
                // User cancelled/closed the payment page
                logger.info('BillDesk: User closed payment page (terminal_state=111)', { reqPayload });
                return ResponsesService.success({
                    success: true,
                    message: 'Payment cancelled by user',
                    data: {}
                });
            }
            else {
                // Unknown callback format
                logger.error('BillDesk Callback: Unknown payload format', undefined, { reqPayload });
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: {}
                });
            }

            if (!paymentTxn) {
                logger.error('BillDesk Callback: PaymentTxn not found', undefined, { reqPayload });
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: {}
                });
            }

            // Log successful payment txn lookup
            logger.info('BillDesk Callback: PaymentTxn found', {
                paymentTxnId: paymentTxn.id,
                paymentTxnStatus: paymentTxn.status,
            });

            // Process the callback - update payment status
            const oldPaymentStatus = paymentTxn.status;
            const statusResult = await this.getPaymentStatusOfBillDeskPayment(paymentTxn);

            // Log status update
            logger.info('BillDesk Callback: Payment status updated', {
                paymentTxnId: paymentTxn.id,
                oldStatus: oldPaymentStatus,
                newStatus: statusResult.status,
            });

            // If payment status changed, forward to BPP ONIX
            if (statusResult.success && statusResult.status !== oldPaymentStatus) {
                const becknPaymentStatus = mapGenericToBecknStatus(statusResult.status);
                
                if (becknPaymentStatus) {
                    try {
                        logger.info('BillDesk Callback: Forwarding status to BPP ONIX', {
                            paymentTxnId: paymentTxn.id,
                            authorizationReference: paymentTxn.authorization_reference,
                            paymentStatus: becknPaymentStatus,
                        });

                        await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                            authorization_reference: paymentTxn.authorization_reference,
                            payment_status: becknPaymentStatus,
                        });

                        logger.info('BillDesk Callback: Status forwarded to BPP ONIX successfully', {
                            paymentTxnId: paymentTxn.id,
                        });
                    }
                    catch (statusError: unknown) {
                        // Log error but don't fail the callback - status update was already done
                        const err = statusError instanceof Error ? statusError : new Error(String(statusError));
                        logger.error('BillDesk Callback: Failed to forward status to BPP ONIX', err, {
                            paymentTxnId: paymentTxn.id,
                            authorizationReference: paymentTxn.authorization_reference,
                        });
                    }
                }
            }

            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {},
            });
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('BillDesk: Callback processing failed', err, { reqPayload });

            // Always return success to BillDesk to prevent retries
            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {}
            });
        }
    }

    /**
     * Verify and process a transaction by retrieving its status from BillDesk
     * @param orderId - The merchant order ID
     * @param partnerId - The partner ID for credentials
     * @returns Transaction status and details
     */
    public static async verifyTransaction(
        orderId: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        status?: GenericPaymentTxnStatus;
        transactionDetails?: BillDeskRetrieveTransactionResponse;
        error?: string;
    }> {
        try {
            const result = await BillDeskPaymentGatewayService.retrieveTransaction(orderId, partnerId);

            if (!result.success || !result.response) {
                return {
                    success: false,
                    error: 'Failed to retrieve transaction from BillDesk',
                };
            }

            const status = mapBillDeskStatusToGeneric(result.response.auth_status);

            return {
                success: true,
                status,
                transactionDetails: result.response,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`BillDesk: Failed to verify transaction - ${errorMessage}`, err, { orderId, partnerId });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Process a refund for a transaction
     * @param transactionId - The BillDesk transaction ID
     * @param refundAmount - The amount to refund
     * @param refundRefNo - Merchant's unique refund reference number
     * @param partnerId - The partner ID for credentials
     * @returns Refund result
     */
    public static async processRefund(
        transactionId: string,
        refundAmount: string,
        refundRefNo: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        refundId?: string;
        refundStatus?: string;
        error?: string;
    }> {
        try {
            const result = await BillDeskPaymentGatewayService.createRefund(
                {
                    mercid: '', // Will be populated by createRefund
                    transactionid: transactionId,
                    merc_refund_ref_no: refundRefNo,
                    refund_amount: refundAmount,
                    currency: '356',
                },
                partnerId,
            );

            if (!result.success || !result.data) {
                return {
                    success: false,
                    error: 'Failed to create refund with BillDesk',
                };
            }

            return {
                success: true,
                refundId: result.data.refundid,
                refundStatus: result.data.refund_status,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`BillDesk: Failed to process refund - ${errorMessage}`, err, {
                transactionId,
                refundAmount,
                refundRefNo,
                partnerId,
            });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Check refund status
     * @param refundRefNo - Merchant's refund reference number
     * @param partnerId - The partner ID for credentials
     * @returns Refund status details
     */
    public static async checkRefundStatus(
        refundRefNo: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        refundStatus?: string;
        refundDetails?: any;
        error?: string;
    }> {
        try {
            const result = await BillDeskPaymentGatewayService.retrieveRefund(refundRefNo, partnerId);

            if (!result.success || !result.response) {
                return {
                    success: false,
                    error: 'Failed to retrieve refund from BillDesk',
                };
            }

            return {
                success: true,
                refundStatus: result.response.refund_status,
                refundDetails: result.response,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`BillDesk: Failed to check refund status - ${errorMessage}`, err, {
                refundRefNo,
                partnerId,
            });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Get payment status of a BillDesk payment and update the payment txn
     */
    private static async getPaymentStatusOfBillDeskPayment(paymentTxn: PaymentTxn): Promise<{
        success: boolean;
        status: string;
        error?: string;
    }> {
        try {
            const paymentTxnAdditionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
            const paymentSDK = paymentTxnAdditionalProps?.payment_sdk;
            const paymentStatus = paymentTxn.status;

            if (!paymentSDK || paymentSDK !== PaymentSDK.BillDesk) {
                logger.error('Invalid payment sdk for billdesk payment', undefined, { paymentTxn });
                return {
                    success: false,
                    status: paymentStatus,
                    error: 'Invalid payment sdk for billdesk payment',
                };
            }

            if (paymentStatus === GenericPaymentTxnStatus.Pending) {
                // Cast to access payment_gateway_order_id (run `npx prisma generate` after schema update)
                const orderId = paymentTxn?.payment_gateway_order_id;
                const partnerId = paymentTxn.partner_id;

                if (!orderId || !partnerId) {
                    logger.error('Missing orderId or partnerId for payment status check', undefined, { paymentTxn });
                    return {
                        success: false,
                        status: paymentStatus,
                        error: 'Missing orderId or partnerId',
                    };
                }

                const paymentStatusResponse = await BillDeskPaymentGatewayService.retrieveTransaction(orderId, partnerId);

                if (paymentStatusResponse.success && paymentStatusResponse.response) {
                    const { auth_status: authStatus, transactionid } = paymentStatusResponse.response;
                    
                    let newStatus: string = paymentStatus;
                    if (authStatus === BillDeskTransactionAuthStatus.SUCCESS) {
                        newStatus = GenericPaymentTxnStatus.Success;
                    }
                    else if (authStatus === BillDeskTransactionAuthStatus.FAILED) {
                        newStatus = GenericPaymentTxnStatus.Failed;
                    }

                    // Note: Run `npx prisma generate` after schema update to get proper types
                    await PaymentTxnDbService.update(paymentTxn.id, {
                        status: newStatus,
                        payment_gateway_payment_id: transactionid,
                        details: JSON.parse(JSON.stringify(paymentStatusResponse.response)),
                    } as any);

                    return {
                        success: true,
                        status: newStatus,
                    };
                }

                if (paymentStatusResponse?.status === 404) {
                    logger.error('BillDesk: Transaction not found (404)', undefined, { paymentTxn, paymentStatusResponse });
                }
                else {
                    logger.error('Failed to get payment status of billdesk payment', undefined, { paymentTxn, paymentStatusResponse });
                }

                return {
                    success: false,
                    status: paymentStatus,
                    error: 'Failed to get payment status of billdesk payment',
                };
            }

            logger.warn('Invalid payment status to update payment status of billdesk payment', { paymentTxn });

            return {
                success: true,
                status: paymentStatus,
            };
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(getErrorMessage(error));
            logger.error('Failed to get payment status of billdesk payment', err, { paymentTxnId: paymentTxn.id });

            return {
                success: false,
                status: paymentTxn.status,
                error: 'Failed to get payment status of billdesk payment',
            };
        }
    }

    /**
     * Create order with BillDesk Payment Gateway
     * @param paymentTxn - Payment transaction object
     * @param billDeskPaymentServiceProps - BillDesk payment service properties (device info, return URL)
     * @returns Created order details
     */
    public static async createOrderWithBillDeskPaymentGateway(
        paymentTxn: PaymentTxn,
        billDeskPaymentServiceProps: BillDeskPaymentServiceProps
    ): Promise<CreateOrderWithBillDeskResponse> {
        try {
            const amount = paymentTxn.amount;
            const partnerId = paymentTxn.partner_id;

            if (!partnerId) {
                logger.error('BillDesk: Partner ID not found in payment txn', undefined, { paymentTxn });
                return {
                    success: false,
                    error: 'Partner ID not found',
                };
            }

            // Check if an order was already created and is still active
            const existingProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const existingOrder = existingProps?.payment_gateway_create_object as BillDeskCreateOrderResponse | undefined;
            
            if (existingOrder && existingOrder.bdorderid && existingOrder.status === 'ACTIVE') {
                logger.info('BillDesk: Returning existing active order', { 
                    paymentTxnId: paymentTxn.id, 
                    bdorderid: existingOrder.bdorderid,
                    orderid: existingOrder.orderid,
                });

                // Extract redirect link from existing order
                const redirectLink = existingOrder.links?.find(link => link.rel === 'redirect');
                const billDeskObject: BillDeskObject | undefined = redirectLink ? {
                    ...redirectLink,
                    payment_url: redirectLink.href,
                    authorization_reference: existingOrder.orderid,
                } : undefined;

                return {
                    success: true,
                    billDeskOrder: existingOrder,
                    billDeskObject: billDeskObject,
                };
            }

            // Build additional info
            const additionalInfo = {
                additional_info1: partnerId || "NA",
                additional_info2: paymentTxn.id || "NA",
                additional_info3: new Date().toISOString(),
                additional_info4: "UBC-OCPI-ADAPTOR",
                additional_info5: paymentTxn.beckn_transaction_id || "NA",
                additional_info6: "NA",
            };

            // Convert Decimal to string for amount
            const amountStr = amount.toString();

            // Use authorization_reference as the order_id for BillDesk
            const orderId = paymentTxn.authorization_reference + Utils.generateRandomString(5);
            
            if (!orderId) {
                logger.error('BillDesk: Authorization reference not found in payment txn', undefined, { paymentTxn });
                return {
                    success: false,
                    error: 'Authorization reference not found',
                };
            }

            // Format date as ISO 8601 with timezone offset (e.g., "2023-07-16T10:59:15+05:30")
            const now = new Date();
            const tzOffset = -now.getTimezoneOffset();
            const tzSign = tzOffset >= 0 ? '+' : '-';
            const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
            const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');
            const orderDate = now.toISOString().slice(0, 19) + tzSign + tzHours + ':' + tzMinutes;

            const createOrderRequest: BillDeskCreateOrderRequest = {
                mercid: '', // Will be populated by createOrder
                orderid: orderId,
                amount: amountStr.includes('.') ? amountStr : `${amountStr}.00`,
                order_date: orderDate,
                currency: '356',
                ru: billDeskPaymentServiceProps.return_url,
                itemcode: 'DIRECT',
                additional_info: additionalInfo,
                device: {
                    ip: billDeskPaymentServiceProps.bill_desk_device.ip,
                    user_agent: billDeskPaymentServiceProps.bill_desk_device.user_agent,
                    accept_header: billDeskPaymentServiceProps.bill_desk_device.accept_header,
                    init_channel: billDeskPaymentServiceProps.bill_desk_device.init_channel,
                },
            };

            const createOrderResult = await BillDeskPaymentGatewayService.createOrder(createOrderRequest, partnerId);

            if (!createOrderResult.success || !createOrderResult.bill_desk_order) {
                logger.error('BillDesk: Create order request failed', undefined, { paymentTxn, createOrderResult });
                return {
                    success: false,
                    error: createOrderResult.error || 'Create order request failed',
                };
            }

            const billDeskOrder = createOrderResult.bill_desk_order;

            logger.info('BillDesk order created', { paymentTxnId: paymentTxn.id, billDeskOrderId: billDeskOrder.orderid });

            // Prepare additional props update - use JSON parse/stringify for deep clone and type safety
            const currentProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const updatedAdditionalProps = JSON.parse(JSON.stringify({
                ...(currentProps || {}),
                payment_sdk: PaymentSDK.BillDesk,
                payment_gateway_create_object: billDeskOrder,
            }));

            // Update payment txn with order details
            // Note: Run `npx prisma generate` after schema update to get proper types
            // payment_gateway_order_id stores the authorization_reference which is used as order_id with BillDesk
            await PaymentTxnDbService.update(paymentTxn.id, {
                payment_gateway_order_id: billDeskOrder.orderid,
                status: GenericPaymentTxnStatus.Pending,
                additional_props: updatedAdditionalProps,
            } as any);

            // Extract redirect link
            const redirectLink = billDeskOrder.links?.find(link => link.rel === 'redirect');

            const billDeskObject: BillDeskObject | undefined = redirectLink ? {
                ...redirectLink,
                payment_url: redirectLink.href,
                authorization_reference: paymentTxn.authorization_reference || paymentTxn.id,
            } : undefined;

            return {
                success: true,
                billDeskOrder: billDeskOrder,
                billDeskObject: billDeskObject,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`BillDesk: Failed to create order - ${errorMessage}`, err, { paymentTxnId: paymentTxn.id });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Dummy/Test API for creating a BillDesk order
     * Use this for testing purposes without needing a full PaymentTxn from database
     * 
     * @param params - Test parameters for creating an order
     * @returns BillDesk order creation response
     */
    public static async createTestOrder(params: {
        partnerId: string;
        amount: number;
        authorizationReference: string;
        returnUrl: string;
        becknTransactionId?: string;
        device?: {
            ip?: string;
            userAgent?: string;
            initChannel?: string;
        };
    }): Promise<CreateOrderWithBillDeskResponse> {
        try {
            const { partnerId, amount, authorizationReference, returnUrl, becknTransactionId, device } = params;

            // Create a mock PaymentTxn object with required fields
            const mockPaymentTxn = {
                id: `test-${Date.now()}`,
                partner_id: partnerId,
                amount: { toString: () => amount.toFixed(2) } as any, // Mock Decimal
                authorization_reference: authorizationReference,
                beckn_transaction_id: becknTransactionId || `beckn-test-${Date.now()}`,
                additional_props: null,
            } as PaymentTxn;

            // Create mock device props
            const billDeskPaymentServiceProps: BillDeskPaymentServiceProps = {
                return_url: returnUrl,
                bill_desk_device: {
                    init_channel: device?.initChannel || 'internet',
                    ip: device?.ip || '127.0.0.1',
                    user_agent: device?.userAgent || 'Mozilla/5.0 (Test)',
                    accept_header: 'application/json',
                    fingerprintid: `fp-${Date.now()}`,
                    browser_tz: '+05:30',
                    browser_color_depth: '24',
                    browser_java_enabled: 'false',
                    browser_screen_height: '1080',
                    browser_screen_width: '1920',
                    browser_language: 'en-US',
                    browser_javascript_enabled: 'true',
                },
            };

            logger.info('BillDesk: Creating test order', {
                partnerId,
                amount,
                authorizationReference,
                returnUrl,
            });

            // Call the actual create order method
            const result = await this.createOrderWithBillDeskPaymentGateway(
                mockPaymentTxn,
                billDeskPaymentServiceProps
            );

            return result;
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`BillDesk: Test order creation failed - ${errorMessage}`, err, { params });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }
}
