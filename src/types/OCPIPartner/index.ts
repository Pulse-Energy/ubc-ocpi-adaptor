export type OCPIPartnerAdditionalProps = {
    communication_urls: {
        generate_payment_link: {
            url: string,
            auth_token: string,
        },
        submit_rating: {
            url: string,
            auth_token: string,
        }
    }
};