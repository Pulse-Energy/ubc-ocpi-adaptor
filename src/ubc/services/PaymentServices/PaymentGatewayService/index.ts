/**
 * Payment Gateway Service
 * Handles payment gateway order creation, refunds, and status management
 */
import { OCPIPartner, PaymentTxn } from "@prisma/client";
import { logger } from "../../../../services/logger.service";
import PaymentTxnDbService from "../../../../db-services/PaymentTxnDbService";
import BillDeskPaymentService from "../Billdesk/BillDeskPaymentService";
import RazorpayPaymentService from "../Razorpay/RazorpayPaymentService";
import {
    BillDeskPaymentServiceProps,
    BillDeskObject,
    BillDeskRetrieveTransactionResponse,
    GenericPaymentTxnStatus,
    PaymentSDK,
} from "../../../../types/BillDesk";
import {
    RazorpayObject,
    RazorpayPaymentResponse,
} from "../../../../types/Razorpay";
import { OCPIPartnerAdditionalProps } from "../../../../types/OCPIPartner";
import { PaymentTxnAdditionalProps } from "../../../../types/PaymentTxn";
import OnStatusActionHandler from "../../../actions/handlers/OnStatusActionHandler";

// Types for payment gateway
interface CreatePaymentGatewayOrderResponseType {
    success: boolean;
    payment_sdk: PaymentSDK;
    amount: number;
    error?: string;
    orderId?: string;
    bill_desk?: BillDeskObject;
    razorpay?: RazorpayObject;
}

// Refund types
interface RefundRequestPayload {
    payment_txn_id: string;
    refund_amount: number;
    reason?: string;
}

interface RefundResponsePayload {
    success: boolean;
    refund_id?: string;
    refund_status?: string;
    error?: string;
}

interface RefundStatusResponsePayload {
    success: boolean;
    refund_status?: string;
    refund_details?: any;
    error?: string;
}

interface VerifyPaymentResponsePayload {
    success: boolean;
    payment_status?: GenericPaymentTxnStatus;
    transaction_details?: BillDeskRetrieveTransactionResponse | RazorpayPaymentResponse;
    error?: string;
}

export default class PaymentGatewayService {
    /**
     * Create a payment gateway order
     * Validates the payment transaction and creates an order with the appropriate payment SDK
     * 
     * @param paymentTxn - Payment transaction object
     * @param billDeskPaymentServiceProps - BillDesk payment service properties (optional)
     * @returns Order creation response
     */
    public static async createPaymentGatewayOrder(
        paymentTxn: PaymentTxn,
        partner: OCPIPartner
    ): Promise<CreatePaymentGatewayOrderResponseType> {
        const amount = paymentTxn.amount;
        const status = paymentTxn.status;
        const additionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
        const paymentSdk = additionalProps?.payment_sdk || PaymentSDK.BillDesk;

        const response: CreatePaymentGatewayOrderResponseType = {
            success: false,
            payment_sdk: paymentSdk,
            amount: Number(amount),
            error: '',
        };

        // Validate payment transaction status
        if (status !== GenericPaymentTxnStatus.Pending && status !== 'PENDING') {
            logger.error('Invalid payment txn status', undefined, { paymentTxn });
            response.error = 'Invalid payment txn status';
            return response;
        }

        // Validate amount
        if (!amount || Number(amount) <= 0) {
            logger.error('Invalid payment amount', undefined, { paymentTxn });
            response.error = 'Invalid payment amount';
            return response;
        }

        // Create order based on payment SDK
        if (paymentSdk === PaymentSDK.BillDesk) {
            // Build default BillDesk props using authorization_reference for order tracking
            const authRef = paymentTxn.authorization_reference;
            if (!authRef) {
                logger.error('Invalid authorization_reference', undefined, { paymentTxn });
                response.error = 'Invalid authorization_reference';
                return response;
            }
            const props = this.getDefaultBillDeskProps(partner);
            
            const createOrderResponse = await BillDeskPaymentService.createOrderWithBillDeskPaymentGateway(
                paymentTxn,
                props
            );

            if (createOrderResponse.success && createOrderResponse.billDeskOrder) {
                response.success = true;
                response.orderId = createOrderResponse.billDeskOrder.orderid;
                response.bill_desk = createOrderResponse.billDeskObject;
                return response;
            }

            logger.error('Failed to create BillDesk order', undefined, { 
                paymentTxn, 
                createOrderResponse 
            });
            response.error = createOrderResponse.error || 'Failed to create BillDesk order';
            return response;
        }

        if (paymentSdk === PaymentSDK.Razorpay) {
            const createOrderResponse = await RazorpayPaymentService.createOrderWithRazorpayPaymentGateway(
                paymentTxn
            );

            if (createOrderResponse.success && createOrderResponse.razorpayOrder) {
                response.success = true;
                response.orderId = createOrderResponse.razorpayOrder.id;
                response.razorpay = createOrderResponse.razorpayObject;
                return response;
            }

            logger.error('Failed to create Razorpay order', undefined, { 
                paymentTxn, 
                createOrderResponse 
            });
            response.error = createOrderResponse.error || 'Failed to create Razorpay order';
            return response;
        }

        logger.error('Invalid payment sdk', undefined, { paymentTxn, paymentSdk });
        response.error = 'Invalid payment sdk';
        return response;
    }

    /**
     * Process a refund for a payment transaction
     * 
     * @param payload - Refund request payload
     * @returns Refund response with refund ID and status
     */
    public static async processRefund(payload: RefundRequestPayload): Promise<RefundResponsePayload> {
        try {
            const { payment_txn_id, refund_amount } = payload;
            // reason can be used for logging or storing in DB if needed

            // Get the payment transaction
            const paymentTxn = await PaymentTxnDbService.getById(payment_txn_id);
            
            if (!paymentTxn) {
                logger.error('Refund: Payment transaction not found', undefined, { payment_txn_id });
                return {
                    success: false,
                    error: `Payment transaction not found: ${payment_txn_id}`,
                };
            }

            // Validate payment status - can only refund successful payments
            if (paymentTxn.status !== GenericPaymentTxnStatus.Success && paymentTxn.status !== 'SUCCESS') {
                logger.error('Refund: Payment is not in successful status', undefined, { 
                    payment_txn_id, 
                    status: paymentTxn.status 
                });
                return {
                    success: false,
                    error: 'Can only refund successful payments',
                };
            }

            // Get payment gateway details
            const additionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
            const paymentSdk = additionalProps?.payment_sdk || PaymentSDK.BillDesk;
            const partnerId = paymentTxn.partner_id;

            // Get transaction ID from details or additional props
            const paymentDetails = paymentTxn?.details as unknown as BillDeskRetrieveTransactionResponse;
            const transactionId = paymentDetails?.transactionid || 
                                  paymentTxn?.payment_gateway_payment_id;

            if (!transactionId) {
                logger.error('Refund: Transaction ID not found', undefined, { payment_txn_id });
                return {
                    success: false,
                    error: 'Transaction ID not found for refund',
                };
            }

            // Generate unique refund reference number using authorization_reference
            const authRef = paymentTxn.authorization_reference;
            const refundRefNo = `REF-${authRef}-${Date.now()}`;

            // Process refund based on payment SDK
            if (paymentSdk === PaymentSDK.BillDesk) {
                const refundResult = await BillDeskPaymentService.processRefund(
                    transactionId,
                    refund_amount.toFixed(2),
                    refundRefNo,
                    partnerId
                );

                if (refundResult.success) {
                    logger.info('Refund: Successfully initiated', {
                        payment_txn_id,
                        refund_id: refundResult.refundId,
                        refund_status: refundResult.refundStatus,
                    });

                    // Update payment transaction status to REFUNDED
                    const newRefundStatus = GenericPaymentTxnStatus.Refunded;

                    // Update payment transaction status
                    await PaymentTxnDbService.update(paymentTxn.id, {
                        status: newRefundStatus,
                    } as any);

                    logger.info('Refund: Updated payment transaction status', {
                        payment_txn_id,
                        old_status: paymentTxn.status,
                        new_status: newRefundStatus,
                        refund_amount: refund_amount,
                        paid_amount: Number(paymentTxn.amount),
                    });

                    // Send on_status request to BAP
                    try {
                        await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                            authorization_reference: paymentTxn.authorization_reference,
                            payment_status: newRefundStatus,
                            oldPaymentStatus: GenericPaymentTxnStatus.Success,
                        });
                        logger.info('Refund: Successfully sent on_status to BAP', {
                            payment_txn_id,
                            authorization_reference: paymentTxn.authorization_reference,
                            payment_status: newRefundStatus,
                        });
                    }
                    catch (statusError: unknown) {
                        // Log error but don't fail - refund was already processed
                        const err = statusError instanceof Error ? statusError : new Error(String(statusError));
                        logger.error('Refund: Failed to send on_status to BAP', err, {
                            payment_txn_id,
                            authorization_reference: paymentTxn.authorization_reference,
                        });
                    }

                    return {
                        success: true,
                        refund_id: refundResult.refundId,
                        refund_status: refundResult.refundStatus,
                    };
                }

                logger.error('Refund: Failed to process', undefined, { 
                    payment_txn_id, 
                    error: refundResult.error 
                });
                return {
                    success: false,
                    error: refundResult.error || 'Failed to process refund',
                };
            }

            if (paymentSdk === PaymentSDK.Razorpay) {
                // For Razorpay, transactionId is the payment_id
                const paymentId = transactionId;
                // Convert refund amount to paise
                const refundAmountInPaise = Math.round(refund_amount * 100);

                const refundResult = await RazorpayPaymentService.processRefund(
                    paymentId,
                    refundAmountInPaise,
                );

                if (refundResult.success) {
                    logger.info('Refund: Successfully initiated', {
                        payment_txn_id,
                        refund_id: refundResult.refundId,
                        refund_status: refundResult.refundStatus,
                    });

                    // Update payment transaction status to REFUNDED
                    const newRefundStatus = GenericPaymentTxnStatus.Refunded;

                    // Update payment transaction status
                    await PaymentTxnDbService.update(paymentTxn.id, {
                        status: newRefundStatus,
                    } as any);

                    logger.info('Refund: Updated payment transaction status', {
                        payment_txn_id,
                        old_status: paymentTxn.status,
                        new_status: newRefundStatus,
                        refund_amount: refund_amount,
                        paid_amount: Number(paymentTxn.amount),
                    });

                    // Send on_status request to BAP
                    try {
                        await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                            authorization_reference: paymentTxn.authorization_reference,
                            payment_status: newRefundStatus,
                            oldPaymentStatus: GenericPaymentTxnStatus.Success,
                        });
                        logger.info('Refund: Successfully sent on_status to BAP', {
                            payment_txn_id,
                            authorization_reference: paymentTxn.authorization_reference,
                            payment_status: newRefundStatus,
                        });
                    }
                    catch (statusError: unknown) {
                        // Log error but don't fail - refund was already processed
                        const err = statusError instanceof Error ? statusError : new Error(String(statusError));
                        logger.error('Refund: Failed to send on_status to BAP', err, {
                            payment_txn_id,
                            authorization_reference: paymentTxn.authorization_reference,
                        });
                    }

                    return {
                        success: true,
                        refund_id: refundResult.refundId,
                        refund_status: refundResult.refundStatus,
                    };
                }

                logger.error('Refund: Failed to process', undefined, { 
                    payment_txn_id, 
                    error: refundResult.error 
                });
                return {
                    success: false,
                    error: refundResult.error || 'Failed to process refund',
                };
            }

            logger.error('Refund: Invalid payment SDK', undefined, { payment_txn_id, paymentSdk });
            return {
                success: false,
                error: 'Invalid payment SDK for refund',
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Refund: Failed to process refund', err, { payload });
            return {
                success: false,
                error: err.message,
            };
        }
    }

    /**
     * Check refund status
     * 
     * @param refundRefNo - Merchant's refund reference number
     * @param partnerId - Partner ID for credentials
     * @returns Refund status details
     */
    public static async checkRefundStatus(
        refundRefNo: string,
        partnerId: string
    ): Promise<RefundStatusResponsePayload> {
        try {
            const result = await BillDeskPaymentService.checkRefundStatus(refundRefNo, partnerId);

            if (result.success) {
                logger.info('Refund Status: Retrieved successfully', {
                    refundRefNo,
                    refund_status: result.refundStatus,
                });

                return {
                    success: true,
                    refund_status: result.refundStatus,
                    refund_details: result.refundDetails,
                };
            }

            logger.error('Refund Status: Failed to retrieve', undefined, { 
                refundRefNo, 
                error: result.error 
            });
            return {
                success: false,
                error: result.error || 'Failed to retrieve refund status',
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Refund Status: Failed to check', err, { refundRefNo, partnerId });
            return {
                success: false,
                error: err.message,
            };
        }
    }

    /**
     * Check refund status by payment transaction ID
     * 
     * @param paymentTxnId - Payment transaction ID
     * @param refundId - Optional refund ID (if not provided, will use payment_txn_id based ref)
     * @returns Refund status details
     */
    public static async checkRefundStatusByPaymentTxnId(
        paymentTxnId: string,
        refundId?: string
    ): Promise<RefundStatusResponsePayload> {
        try {
            // Get the payment transaction
            const paymentTxn = await PaymentTxnDbService.getById(paymentTxnId);
            
            if (!paymentTxn) {
                logger.error('Refund Status: Payment transaction not found', undefined, { paymentTxnId });
                return {
                    success: false,
                    error: `Payment transaction not found: ${paymentTxnId}`,
                };
            }

            const partnerId = paymentTxn.partner_id;
            const authRef = paymentTxn.authorization_reference;
            const refundRefNo = refundId || `REF-${authRef}`;

            return await this.checkRefundStatus(refundRefNo, partnerId);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Refund Status: Failed to check by payment txn', err, { paymentTxnId });
            return {
                success: false,
                error: err.message,
            };
        }
    }

    /**
     * Verify payment status by retrieving transaction from payment gateway
     * 
     * @param paymentTxnId - Payment transaction ID
     * @returns Payment status and transaction details
     */
    public static async verifyPaymentStatus(paymentTxnId: string): Promise<VerifyPaymentResponsePayload> {
        try {
            // Get the payment transaction
            const paymentTxn = await PaymentTxnDbService.getById(paymentTxnId);
            
            if (!paymentTxn) {
                logger.error('Verify Payment: Payment transaction not found', undefined, { paymentTxnId });
                return {
                    success: false,
                    error: `Payment transaction not found: ${paymentTxnId}`,
                };
            }

            const partnerId = paymentTxn.partner_id;
            const additionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
            const paymentSdk = additionalProps?.payment_sdk || PaymentSDK.BillDesk;

            // Use payment_gateway_order_id for both BillDesk and Razorpay
            const orderId = paymentTxn.payment_gateway_order_id || paymentTxn.authorization_reference;

            if (!orderId) {
                logger.error('Verify Payment: Order ID not found', undefined, { paymentTxnId });
                return {
                    success: false,
                    error: 'Order ID not found',
                };
            }

            // Verify based on payment SDK
            if (paymentSdk === PaymentSDK.Razorpay) {
                const result = await RazorpayPaymentService.verifyPayment(orderId, partnerId);

                if (result.success) {
                    logger.info('Verify Payment: Razorpay status retrieved successfully', {
                        paymentTxnId,
                        payment_status: result.status,
                    });

                    // Update payment txn status if changed
                    if (result.status && result.status !== paymentTxn.status) {
                        await PaymentTxnDbService.update(paymentTxn.id, {
                            status: result.status,
                            details: JSON.parse(JSON.stringify(result.paymentDetails || {})),
                        } as any);
                    }

                    return {
                        success: true,
                        payment_status: result.status,
                        transaction_details: result.paymentDetails,
                    };
                }

                logger.error('Verify Payment: Failed to retrieve Razorpay status', undefined, { 
                    paymentTxnId, 
                    error: result.error 
                });
                return {
                    success: false,
                    error: result.error || 'Failed to verify payment status',
                };
            }

            // Default: Verify transaction with BillDesk
            const result = await BillDeskPaymentService.verifyTransaction(orderId, partnerId);

            if (result.success) {
                logger.info('Verify Payment: Status retrieved successfully', {
                    paymentTxnId,
                    payment_status: result.status,
                });

                // Update payment txn status if changed
                if (result.status && result.status !== paymentTxn.status) {
                    await PaymentTxnDbService.update(paymentTxn.id, {
                        status: result.status,
                        details: JSON.parse(JSON.stringify(result.transactionDetails || {})),
                    } as any);
                }

                return {
                    success: true,
                    payment_status: result.status,
                    transaction_details: result.transactionDetails,
                };
            }

            logger.error('Verify Payment: Failed to retrieve status', undefined, { 
                paymentTxnId, 
                error: result.error 
            });
            return {
                success: false,
                error: result.error || 'Failed to verify payment status',
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Verify Payment: Failed to verify', err, { paymentTxnId });
            return {
                success: false,
                error: err.message,
            };
        }
    }

    /**
     * Get default BillDesk payment service props
     * @param authorizationReference - Authorization reference for return URL (used as order_id)
     */
    private static getDefaultBillDeskProps(partner: OCPIPartner): BillDeskPaymentServiceProps {
        const additionalProps = partner?.additional_props as OCPIPartnerAdditionalProps | null;
        const returnUrl = additionalProps?.communication_urls?.webhook_callback?.url;
        if (!returnUrl) {
            throw new Error('Return URL not found');
        }
        return {
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
            return_url: `${returnUrl}/api/app/redirect/billdesk`
        };
    }
}
