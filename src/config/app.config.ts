import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '6001', 10),
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    ocpi: {
        version: process.env.OCPI_VERSION || '2.2.1',
        partyId: process.env.OCPI_PARTY_ID || '',
        countryCode: process.env.OCPI_COUNTRY_CODE || 'IN',
    },
    cds: {
        baseUrl: process.env.CDS_BASE_URL || '',
        apiKey: process.env.CDS_API_KEY || '',
    },
};
