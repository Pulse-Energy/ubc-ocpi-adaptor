export type OCPIPartnerAdditionalProps = {
    communication_urls: {
        generate_payment_link: {
            url: string,
            auth_token: string,
        },
    }
    support: {
        name: string,
        phone: string,
        email: string,
        url: string,
        hours: string,
        channels: string[],
    },
};