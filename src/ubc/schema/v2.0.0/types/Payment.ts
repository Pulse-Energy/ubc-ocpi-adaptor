import { AcceptedPaymentMethod } from "../enums/AcceptedPaymentMethod";
import { ObjectType } from "../enums/ObjectType";
import { BecknPaymentStatus } from "../enums/PaymentStatus";
import { BecknAmount } from "./Amount";

export type BecknPayment = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld"
    "@type": ObjectType.payment;
    "beckn:id": string;
    "beckn:amount": BecknAmount;
    "beckn:paymentURL": string; // e.g. "https://payments.bluechargenet-aggregator.io/pay?transaction_id=$transaction_id&amount=$amount"
    "beckn:txnRef": string; // PSP/gateway/bank transaction reference
    "beckn:beneficiary": string; // e.g. "BPP"
    "beckn:acceptedPaymentMethod": AcceptedPaymentMethod[]; // e.g. ["BANK_TRANSFER", "UPI", "WALLET"]
    "beckn:paymentStatus": BecknPaymentStatus; // e.g. "INITIATED"
    "beckn:paidAt"?: string; // e.g. "2025-01-27T10:05:00Z"
    "beckn:status"?: string; // e.g. "PAID"
};
