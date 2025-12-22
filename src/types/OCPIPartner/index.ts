import { BillDeskCredentials } from '../BillDesk';

export enum PaymentServiceProvider {
    BillDesk = 'BILLDESK',
    CPO = 'CPO',
}

export enum InvoiceServiceProvider {
    TataPower = 'TATA_POWER',
}

export interface TataPowerInvoiceConfig {
    API_URL: string;
    AUTH_TOKEN: string;
}

export type OCPIPartnerAdditionalProps = {
    communication_urls?: {
        generate_payment_link?: {
            url: string;
            auth_token: string;
        };
        submit_rating?: {
            url: string;
            auth_token: string;
        };
        webhook_callback?: {
            url: string;
        };
    };
    support?: {
        name: string;
        phone: string;
        email: string;
        url: string;
        hours: string;
        channels: string[];
    };
    payment_service_provider?: PaymentServiceProvider;
    payment_services?: {
        BillDesk?: BillDeskCredentials;
    };
    invoice_service_provider?: InvoiceServiceProvider;
    invoice_services?: {
        TataPower?: TataPowerInvoiceConfig;
    };
};
