/**
 * Returns the OCPI CPO auth token from environment variables.
 * Expects OCPI_CPO_AUTH_TOKEN to be set.
 */
export function getOcpiCpoAuthToken(): string {
    const token = process.env.OCPI_CPO_AUTH_TOKEN;

    if (!token) {
        throw new Error('OCPI_CPO_AUTH_TOKEN environment variable is not configured');
    }

    return token;
}


