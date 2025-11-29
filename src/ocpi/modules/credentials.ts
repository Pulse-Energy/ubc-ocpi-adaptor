import axios from 'axios';
import { databaseService } from '../../services/database.service';
import { logger } from '../../services/logger.service';
import { ValidationError } from '../../utils/errors';
import { OCPICredentials, OCPIResponse } from '../types';
import { credentialsSchema } from '../validators';

export class CredentialsModule {
    async register(
        registrationToken: string,
        cpoUrl: string
    ): Promise<OCPIResponse<OCPICredentials>> {
        try {
            // Validate input
            if (!registrationToken || !cpoUrl) {
                throw new ValidationError('Registration token and CPO URL are required');
            }

            // Call CPO's credentials endpoint with registration token
            const response = await axios.post(
                `${cpoUrl}/ocpi/v2.2.1/credentials`,
                {},
                {
                    headers: {
                        Authorization: `Token ${registrationToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const credentials = response.data.data as OCPICredentials;

            // Validate credentials structure
            credentialsSchema.parse(credentials);

            // Store credentials in database
            await databaseService.prisma.cpoConnection.upsert({
                where: { cpo_id: credentials.party_id },
                create: {
                    cpo_id: credentials.party_id,
                    token: credentials.token,
                    party_id: credentials.party_id,
                    country_code: credentials.country_code,
                    endpoints: credentials as any,
                    status: 'registered',
                    registered_at: new Date(),
                },
                update: {
                    token: credentials.token,
                    endpoints: credentials as any,
                    status: 'registered',
                    registered_at: new Date(),
                },
            });

            logger.info('OCPI credentials registered successfully', {
                party_id: credentials.party_id,
                country_code: credentials.country_code,
            });

            return {
                status_code: 1000,
                data: credentials,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error: any) {
            logger.error('Error registering OCPI credentials', error);
            throw error;
        }
    }

    async getCredentials(cpoId: string): Promise<OCPICredentials | null> {
        try {
            const connection = await databaseService.prisma.cpoConnection.findUnique({
                where: { cpo_id: cpoId },
            });

            if (!connection) {
                return null;
            }

            return {
                token: connection.token,
                url: (connection.endpoints as any).url || '',
                business_details: {
                    name: (connection.endpoints as any).business_details?.name || '',
                },
                party_id: connection.party_id,
                country_code: connection.country_code,
            };
        }
        catch (error: any) {
            logger.error('Error getting OCPI credentials', error);
            throw error;
        }
    }

    async updateCredentials(cpoId: string, credentials: OCPICredentials): Promise<void> {
        try {
            credentialsSchema.parse(credentials);

            await databaseService.prisma.cpoConnection.update({
                where: { cpo_id: cpoId },
                data: {
                    token: credentials.token,
                    endpoints: credentials as any,
                    status: 'active',
                    updated_at: new Date(),
                },
            });

            logger.info('OCPI credentials updated', { cpoId });
        }
        catch (error: any) {
            logger.error('Error updating OCPI credentials', error);
            throw error;
        }
    }
}

export const credentialsModule = new CredentialsModule();
