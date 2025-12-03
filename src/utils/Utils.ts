export default class Utils {
    public static upperCaseFirstLetter(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    public static getAllEndpoints() {
        return {
            data: {
                version: '2.2.1',
                endpoints: [
                    {
                        identifier: 'credentials',
                        role: 'SENDER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/2.2.1/credentials'
                    },
                    {
                        identifier: 'credentials',
                        role: 'RECEIVER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/2.2.1/credentials'
                    },
                    {
                        identifier: 'locations',
                        role: 'RECEIVER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/emsp/2.2.1/locations'
                    },
                    {
                        identifier: 'sessions',
                        role: 'RECEIVER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/emsp/2.2.1/sessions'
                    },
                    {
                        identifier: 'cdrs',
                        role: 'RECEIVER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/emsp/2.2.1/cdrs'
                    },
                    {
                        identifier: 'tariffs',
                        role: 'RECEIVER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/emsp/2.2.1/tariffs'
                    },
                    {
                        identifier: 'tokens',
                        role: 'SENDER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/emsp/2.2.1/tokens'
                    },
                    {
                        identifier: 'commands',
                        role: 'SENDER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/emsp/2.2.1/commands'
                    },
                    {
                        identifier: 'locations',
                        role: 'SENDER',
                        url: 'https://dev-api.chargecloud.net/ocpi/cpo/2.2/locations'
                    },
                    {
                        identifier: 'sessions',
                        role: 'SENDER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/cpo/2.2.1/sessions'
                    },
                    {
                        identifier: 'cdrs',
                        role: 'SENDER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/cpo/2.2.1/cdrs'
                    },
                    {
                        identifier: 'tariffs',
                        role: 'SENDER',
                        url: 'https://dev-api.chargecloud.net/ocpi/cpo/2.2.1/tariffs'
                    },
                    {
                        identifier: 'tokens',
                        role: 'RECEIVER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/cpo/2.2.1/tokens'
                    },
                    {
                        identifier: 'commands',
                        role: 'RECEIVER',
                        url: 'https://ubc-local-cpo-ocpi.pulseenergy.io/ocpi/cpo/2.2.1/commands'
                    }
                ]
            },
            status_code: 1000,
            status_message: 'Success',
            timestamp: '2025-12-03T09:09:35.794Z'
        };
    }
}