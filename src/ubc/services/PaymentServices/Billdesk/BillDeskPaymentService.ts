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
    BillDeskCreateTransactionRequest,
    BillDeskCreateTransactionResponse,
    BillDeskUpdateTransactionRequest,
    CreateTransactionWithBillDeskResponse,
    UpdateTransactionWithBillDeskResponse,
} from "../../../../types/BillDesk";
import { HttpResponse } from "../../../../types/responses";
import OnStatusActionHandler from "../../../actions/handlers/OnStatusActionHandler";
import { BecknPaymentStatus } from "../../../schema/v2.0.0/enums/PaymentStatus";
import { PaymentTxnAdditionalProps } from "../../../../types/PaymentTxn";
import Utils from "../../../../utils/Utils";
import GLOBAL_VARS from "../../../../constants/global-vars";

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
                const orderId = reqPayload?.orderid ?? '';
                paymentTxn = await PaymentTxnDbService.getByOrderId(orderId);
                decodedResponse = await BillDeskPaymentGatewayService.decodeString(response, paymentTxn?.partner_id);

                logger.info('BillDesk Redirect Callback - decoded response', { decodedResponse });

                if (!decodedResponse) {
                    logger.error('BillDesk: Failed to decode transaction response', undefined, { reqPayload });
                    return ResponsesService.success({
                        success: true,
                        message: 'success',
                        data: {}
                    });
                }

            }
            else if (reqPayload.encrypted_response) {
                // Redirect callback (JWT encoded transaction response)
                const response = reqPayload.encrypted_response;
                const orderId = reqPayload?.orderid ?? '';
                paymentTxn = await PaymentTxnDbService.getByOrderId(orderId);
                decodedResponse = await BillDeskPaymentGatewayService.decodeString(response, paymentTxn?.partner_id);

                logger.info('BillDesk Redirect Callback - decoded response', { decodedResponse });

                if (!decodedResponse) {
                    logger.error('BillDesk: Failed to decode transaction response', undefined, { reqPayload });
                    return ResponsesService.success({
                        success: true,
                        message: 'success',
                        data: {}
                    });
                }

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

            if (paymentTxn.status !== GenericPaymentTxnStatus.Pending) {
                logger.info('BillDesk Callback: PaymentTxn not in pending status', {
                    paymentTxnId: paymentTxn.id,
                    paymentTxnStatus: paymentTxn.status,
                });
                return ResponsesService.success({
                    success: true,
                    message: 'PaymentTxn not in pending status',
                    data: {}
                });
            }

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
                            oldPaymentStatus: oldPaymentStatus as GenericPaymentTxnStatus,
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

            // if (paymentStatus === GenericPaymentTxnStatus.Pending) {
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
            // }

            // logger.warn('Invalid payment status to update payment status of billdesk payment', { paymentTxn });

            // return {
            //     success: true,
            //     status: paymentStatus,
            // };
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
            const orderId = 'ORD' + Utils.generateRandomString(10);
            
           
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

            const paymentUrl = `${GLOBAL_VARS.INTERNAL_PAYMENT_LINK_HOST}/api/app/billdesk/pay/${paymentTxn.id}?autoSubmit=true`;
            const billDeskObject: BillDeskObject | undefined = redirectLink ? {
                ...redirectLink,
                payment_url: paymentUrl,
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
     * Create transaction with BillDesk Payment Gateway
     * This initiates a charge using a specific payment method
     * 
     * @param paymentTxn - Payment transaction object
     * @param transactionProps - Transaction properties including payment method, device, etc.
     * @returns Created transaction details
     */
    public static async createTransactionWithBillDeskPaymentGateway(
        paymentTxn: PaymentTxn,
        transactionProps: {
            payment_method_type: 'card' | 'netbanking' | 'upi' | 'wallet' | string;
            authentication_type?: '3ds2' | 'otp' | string;
            '3ds_parameter'?: 'merchant' | 'issuer' | string;
            txn_process_type?: 'intent' | 'collect' | string;
            payment_method?: BillDeskCreateTransactionRequest['payment_method'];
            device?: BillDeskCreateTransactionRequest['device'];
            return_url?: string;
        }
    ): Promise<CreateTransactionWithBillDeskResponse> {
        try {
            const partnerId = paymentTxn.partner_id;

            if (!partnerId) {
                logger.error('BillDesk: Partner ID not found in payment txn', undefined, { paymentTxn });
                return {
                    success: false,
                    error: 'Partner ID not found',
                };
            }

            // Get the BillDesk order from additional_props (optional - transaction can be created without order)
            const existingProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const existingOrder = existingProps?.payment_gateway_create_object as BillDeskCreateOrderResponse | undefined;
            
            // Use order ID from existing order or generate one
            const orderId = existingOrder?.orderid || paymentTxn.payment_gateway_order_id || `TXN${Date.now()}`;
            const amountStr = paymentTxn.amount.toString();

            const createTransactionRequest: BillDeskCreateTransactionRequest = {
                mercid: '', // Will be populated by createTransaction
                orderid: orderId,
                amount: amountStr.includes('.') ? amountStr : `${amountStr}.00`,
                currency: '356',
                itemcode: 'DIRECT',
                ru: transactionProps.return_url || existingOrder?.ru || GLOBAL_VARS.INTERNAL_PAYMENT_LINK_HOST + '/api/app/redirect/billdesk',
                payment_method_type: transactionProps.payment_method_type,
                authentication_type: transactionProps.authentication_type,
                '3ds_parameter': transactionProps['3ds_parameter'],
                txn_process_type: transactionProps.txn_process_type,
                bdorderid: existingOrder?.bdorderid,
                payment_method: transactionProps.payment_method,
                device: transactionProps.device,
            };

            const createTransactionResult = await BillDeskPaymentGatewayService.createTransaction(
                createTransactionRequest,
                partnerId
            );

            if (!createTransactionResult.success || !createTransactionResult.transaction) {
                logger.error('BillDesk: Create transaction request failed', undefined, { paymentTxn, createTransactionResult });
                return {
                    success: false,
                    error: createTransactionResult.error || 'Create transaction request failed',
                    error_details: createTransactionResult.error_details,
                };
            }

            const billDeskTransaction = createTransactionResult.transaction;

            logger.info('BillDesk transaction created', { 
                paymentTxnId: paymentTxn.id, 
                transactionid: billDeskTransaction.transactionid,
                auth_status: billDeskTransaction.auth_status,
            });

            // Update payment txn with transaction details
            const currentProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const updatedAdditionalProps = JSON.parse(JSON.stringify({
                ...(currentProps || {}),
                payment_sdk: PaymentSDK.BillDesk,
                payment_gateway_transaction_object: billDeskTransaction,
            }));

            // Determine status based on auth_status
            let newStatus = paymentTxn.status;
            if (billDeskTransaction.auth_status === BillDeskTransactionAuthStatus.SUCCESS) {
                newStatus = GenericPaymentTxnStatus.Success;
            }
            else if (billDeskTransaction.auth_status === BillDeskTransactionAuthStatus.FAILED) {
                newStatus = GenericPaymentTxnStatus.Failed;
            }

            await PaymentTxnDbService.update(paymentTxn.id, {
                payment_gateway_payment_id: billDeskTransaction.transactionid,
                payment_gateway_order_id: orderId,
                status: newStatus,
                additional_props: updatedAdditionalProps,
            } as any);

            return {
                success: true,
                transaction: billDeskTransaction,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`BillDesk: Failed to create transaction - ${errorMessage}`, err, { paymentTxnId: paymentTxn.id });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Update/Authorize transaction with BillDesk Payment Gateway
     * This is used to complete 2FA (OTP), 3DS authentication, etc.
     * 
     * @param paymentTxn - Payment transaction object (must have an existing transaction)
     * @param authData - Authentication data (OTP, 3DS data, etc.)
     * @param device - Device information
     * @returns Updated transaction details
     */
    public static async updateTransactionWithBillDeskPaymentGateway(
        paymentTxn: PaymentTxn,
        authData?: BillDeskUpdateTransactionRequest['auth_data'],
        device?: BillDeskUpdateTransactionRequest['device']
    ): Promise<UpdateTransactionWithBillDeskResponse> {
        try {
            const partnerId = paymentTxn.partner_id;

            if (!partnerId) {
                logger.error('BillDesk: Partner ID not found in payment txn', undefined, { paymentTxn });
                return {
                    success: false,
                    error: 'Partner ID not found',
                };
            }

            // Get the BillDesk order and transaction from additional_props
            const existingProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const existingOrder = existingProps?.payment_gateway_create_object as BillDeskCreateOrderResponse | undefined;
            const existingTransaction = existingProps?.payment_gateway_transaction_object as BillDeskCreateTransactionResponse | undefined;
            
            if (!existingOrder || !existingOrder.bdorderid) {
                logger.error('BillDesk: No existing order found for payment txn', undefined, { paymentTxnId: paymentTxn.id });
                return {
                    success: false,
                    error: 'No existing BillDesk order found. Create an order first.',
                };
            }

            // Transaction ID can come from existing transaction or payment_gateway_payment_id
            const transactionId = existingTransaction?.transactionid || paymentTxn.payment_gateway_payment_id;
            
            if (!transactionId) {
                logger.error('BillDesk: No existing transaction found for payment txn', undefined, { paymentTxnId: paymentTxn.id });
                return {
                    success: false,
                    error: 'No existing BillDesk transaction found. Create a transaction first.',
                };
            }

            const updateTransactionRequest: BillDeskUpdateTransactionRequest = {
                mercid: '', // Will be populated by updateTransaction
                bdorderid: existingOrder.bdorderid,
                transactionid: transactionId,
                auth_data: authData,
                device: device,
            };

            const updateTransactionResult = await BillDeskPaymentGatewayService.updateTransaction(
                updateTransactionRequest,
                partnerId
            );

            if (!updateTransactionResult.success || !updateTransactionResult.transaction) {
                logger.error('BillDesk: Update transaction request failed', undefined, { paymentTxn, updateTransactionResult });
                return {
                    success: false,
                    error: updateTransactionResult.error || 'Update transaction request failed',
                    error_details: updateTransactionResult.error_details,
                };
            }

            const billDeskTransaction = updateTransactionResult.transaction;

            logger.info('BillDesk transaction updated', { 
                paymentTxnId: paymentTxn.id, 
                transactionid: billDeskTransaction.transactionid,
                auth_status: billDeskTransaction.auth_status,
            });

            // Update payment txn with transaction details
            const currentProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const updatedAdditionalProps = JSON.parse(JSON.stringify({
                ...(currentProps || {}),
                payment_sdk: PaymentSDK.BillDesk,
                payment_gateway_transaction_object: billDeskTransaction,
            }));

            // Determine status based on auth_status
            let newStatus = paymentTxn.status;
            if (billDeskTransaction.auth_status === BillDeskTransactionAuthStatus.SUCCESS) {
                newStatus = GenericPaymentTxnStatus.Success;
            }
            else if (billDeskTransaction.auth_status === BillDeskTransactionAuthStatus.FAILED) {
                newStatus = GenericPaymentTxnStatus.Failed;
            }

            await PaymentTxnDbService.update(paymentTxn.id, {
                payment_gateway_payment_id: billDeskTransaction.transactionid,
                status: newStatus,
                additional_props: updatedAdditionalProps,
            } as any);

            return {
                success: true,
                transaction: billDeskTransaction,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`BillDesk: Failed to update transaction - ${errorMessage}`, err, { paymentTxnId: paymentTxn.id });

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

    /**
     * Generate redirect HTML page after payment
     * Shows a styled page with payment status and auto-redirect back to app
     */
    public static generateRedirectPage(params: {
        message: string;
        isError?: boolean;
        errorType?: string;
        errorCode?: string;
        statusCode?: string;
        orderId?: string;
        transactionId?: string;
    }): string {
        const { message, isError, errorType, errorCode, statusCode, orderId, transactionId } = params;
        
        // Icon based on status
        const iconColor = isError ? '#ef4444' : '#667eea';
        const iconPath = isError 
            ? 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' // X mark
            : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'; // Checkmark

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${message}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 100%;
        }
        .icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 24px;
        }
        .icon svg {
            width: 100%;
            height: 100%;
            stroke: ${iconColor};
            stroke-width: 1.5;
            fill: none;
        }
        h1 {
            color: #1f2937;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        .subtitle {
            color: #6b7280;
            font-size: 16px;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        .details {
            background: #f9fafb;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            color: #6b7280;
            font-size: 14px;
        }
        .detail-value {
            color: #1f2937;
            font-size: 14px;
            font-weight: 500;
        }
        .close-hint {
            color: #6b7280;
            font-size: 14px;
            margin-top: 12px;
            font-style: italic;
        }
        .error-text {
            color: #ef4444;
            font-size: 14px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}"/>
            </svg>
        </div>
        
        <h1>${message}</h1>
        <p class="subtitle">
            Please go back to the app to check your payment status.
        </p>
        
        ${(errorType || errorCode || statusCode || orderId || transactionId) ? `
        <div class="details">
            ${errorType ? `
            <div class="detail-row">
                <span class="detail-label">Error Type</span>
                <span class="detail-value">${errorType.replace(/_/g, ' ')}</span>
            </div>
            ` : ''}
            ${errorCode ? `
            <div class="detail-row">
                <span class="detail-label">Error Code</span>
                <span class="detail-value">${errorCode}</span>
            </div>
            ` : ''}
            ${statusCode ? `
            <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="detail-value">${statusCode}</span>
            </div>
            ` : ''}
            ${orderId ? `
            <div class="detail-row">
                <span class="detail-label">Order ID</span>
                <span class="detail-value">${orderId}</span>
            </div>
            ` : ''}
            ${transactionId ? `
            <div class="detail-row">
                <span class="detail-label">Transaction ID</span>
                <span class="detail-value">${transactionId}</span>
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        <p class="close-hint">You may close this page</p>
    </div>
</body>
</html>
        `.trim();
    }
}
