import GLOBAL_VARS from "../../constants/global-vars";


export const OCPI_HOST = GLOBAL_VARS.OCPI_HOST || 'http://localhost:8082';

export const PUBLIC_OCPI_HOST = GLOBAL_VARS.PUBLIC_OCPI_HOST || 'http://localhost:8082';

export const OCPI_PLATFORM_AUTH_SESSION_EXPIRY = 365;

// eslint-disable-next-line prefer-destructuring
export const SELF_OCPI_PLATFORM_ID = GLOBAL_VARS.SELF_OCPI_PLATFORM_ID;

export const SELF_OCPI_EMSP_PARTY_ID = GLOBAL_VARS.SELF_OCPI_EMSP_PARTY_ID ?? 'INS';

export const SELF_OCPI_EMSP_COUNTRY_CODE = GLOBAL_VARS.SELF_OCPI_EMSP_COUNTRY_CODE ?? 'IN';

export const OCPI_TOKEN_ISSUER = '';

export const OCPI_GET_ALL_LIMIT = 20;
