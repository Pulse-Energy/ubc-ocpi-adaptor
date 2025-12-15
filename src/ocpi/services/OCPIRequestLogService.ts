import { Request, Response } from 'express';
import { OCPILogDbService } from '../../db-services/OCPILogDbService';
import { OCPIPartnerCredentials } from '@prisma/client';
import { OCPILogCommand } from '../types';
import { logger } from '../../services/logger.service';

export class OCPIRequestLogService {
    /**
     * Safely execute a logging function without blocking or throwing errors
     * This ensures logging failures never affect the main request/response flow
     */
    private static safeLog(logFn: () => Promise<void>): void {
        // Execute asynchronously without blocking
        Promise.resolve().then(() => {
            return logFn();
        }).catch((error) => {
            // Double safety: catch any unhandled promise rejections
            // The logging functions already have try-catch, but this is extra protection
            logger.error('Unhandled error in logging function', error as Error);
        });
    }

    private static toSafeJson<T>(value: T): T {
        // Ensure payload is JSON-serializable (strip functions, undefined, etc.)
        return JSON.parse(
            JSON.stringify(value, (_key, v) => {
                if (typeof v === 'bigint') {
                    return Number(v);
                }
                if (v instanceof Error) {
                    return {
                        name: v.name,
                        message: v.message,
                        stack: v.stack,
                    };
                }
                return v;
            }),
        );
    }

    /**
     * Extract relevant IDs from request for logging
     */
    private static extractIdsFromRequest(
        req: Request,
        command: OCPILogCommand,
    ): {
        location_id?: string;
        evse_id?: string;
        connector_id?: string;
        session_id?: string;
        authorization_reference?: string;
        cpo_session_id?: string;
        additional_props?: Record<string, any>;
    } {
        const params = req.params || {};
        const body = req.body || {};

        const result: {
            location_id?: string;
            evse_id?: string;
            connector_id?: string;
            session_id?: string;
            authorization_reference?: string;
            cpo_session_id?: string;
            additional_props?: Record<string, any>;
        } = {};

        // Extract location_id (from params or body)
        // For EVSE and Connector requests, location_id is also in the path
        if (params.location_id) {
            result.location_id = params.location_id;
        }
        else if (body.id && (command.toString().includes('Location') || req.path.includes('/locations'))) {
            result.location_id = body.id;
        }

        // Extract evse_id (from params or body)
        // For EVSE and Connector requests, evse_uid is in the path
        if (params.evse_uid) {
            result.evse_id = params.evse_uid;
        }
        else if (body.uid && (command.toString().includes('EVSE') || req.path.includes('/evses'))) {
            result.evse_id = body.uid;
        }
        // Also check for evse_id in body (some CPOs might send it)
        else if ((body as any).evse_id) {
            result.evse_id = (body as any).evse_id;
        }

        // Extract connector_id (from params or body)
        // For Connector requests, connector_id is in the path
        if (params.connector_id) {
            result.connector_id = params.connector_id;
        }
        else if (body.id && (command.toString().includes('Connector') || req.path.includes('/connectors'))) {
            result.connector_id = body.id;
        }
        // Also check for connector_id in body (some CPOs might send it)
        else if ((body as any).connector_id) {
            result.connector_id = (body as any).connector_id;
        }

        // Extract session_id (from params)
        if (params.session_id) {
            result.session_id = params.session_id;
        }

        // Extract authorization_reference (from body for sessions/tokens)
        if (body.authorization_reference) {
            result.authorization_reference = body.authorization_reference;
        }

        // Extract cpo_session_id (from body for sessions - this is the CPO's session ID)
        if (body.id && (command.toString().includes('Session') || req.path.includes('/sessions'))) {
            result.cpo_session_id = body.id;
        }

        // Additional props for other IDs
        const additional: Record<string, any> = {};

        // Tariff IDs
        if (params.tariff_id) {
            additional.tariff_id = params.tariff_id;
        }
        else if (body.id && (command.toString().includes('Tariff') || req.path.includes('/tariffs'))) {
            additional.tariff_id = body.id;
        }

        // CDR IDs
        if (params.cdr_id) {
            additional.cdr_id = params.cdr_id;
        }
        else if (body.id && (command.toString().includes('Cdr') || req.path.includes('/cdrs'))) {
            additional.cdr_id = body.id;
        }

        // Token UIDs
        if (params.token_uid) {
            additional.token_uid = params.token_uid;
        }
        else if (body.uid && (command.toString().includes('Token') || req.path.includes('/tokens'))) {
            additional.token_uid = body.uid;
        }

        // Command IDs
        if (params.command_id) {
            additional.command_id = params.command_id;
        }

        // Country code and party ID (always useful for debugging)
        if (params.country_code) {
            additional.country_code = params.country_code;
        }
        if (params.party_id) {
            additional.party_id = params.party_id;
        }

        if (Object.keys(additional).length > 0) {
            result.additional_props = additional;
        }

        return result;
    }

    public static async logRequest(params: {
        req: Request;
        partnerId?: string;
        command: OCPILogCommand;
    }): Promise<void> {
        try {
            const {
                req,
                partnerId,
                command,
            } = params;

            const authReq = req as Request & {
                ocpiPartnerCredentials?: OCPIPartnerCredentials;
            };

            const resolvedPartnerId = partnerId ?? authReq.ocpiPartnerCredentials?.partner_id;
            if (!resolvedPartnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            const payload = this.toSafeJson({
                method: req.method,
                path: req.path,
                query: req.query,
                headers: req.headers,
                body: req.body,
            });

            const url = (req as any).originalUrl ?? req.url;

            let senderType: 'CPO' | 'EMSP' = 'CPO';
            // Special case for Location PUT/PATCH from CPO (EMSP is the sender of the data)
            if (command === OCPILogCommand.PutLocationReq || command === OCPILogCommand.PatchLocationReq) {
                senderType = 'EMSP';
            }

            // Extract IDs from request (these are OCPI IDs, not internal DB IDs)
            const ids = this.extractIdsFromRequest(req, command);

            // Build additional_props with OCPI IDs for easy debugging
            const additionalProps: Record<string, any> = {
                ...(ids.additional_props || {}),
            };

            // Store OCPI IDs in additional_props
            if (ids.location_id) {
                additionalProps.ocpi_location_id = ids.location_id;
            }
            if (ids.evse_id) {
                additionalProps.ocpi_evse_uid = ids.evse_id;
            }
            if (ids.connector_id) {
                additionalProps.ocpi_connector_id = ids.connector_id;
            }
            if (ids.authorization_reference) {
                additionalProps.ocpi_authorization_reference = ids.authorization_reference;
            }
            if (ids.cpo_session_id) {
                additionalProps.ocpi_cpo_session_id = ids.cpo_session_id;
            }

            // Build log data with relations
            const logData: any = {
                command,
                sender_type: senderType,
                url,
                payload,
                additional_props: Object.keys(additionalProps).length > 0 ? additionalProps : undefined,
                partner: {
                    connect: { id: resolvedPartnerId },
                },
            }

            // Resolve internal database IDs from OCPI IDs for relations
            // Only resolve if we have the necessary OCPI IDs and partner ID
            if (resolvedPartnerId) {
                const { databaseService } = await import('../../services/database.service');

                // Resolve location internal ID
                if (ids.location_id) {
                    const location = await databaseService.prisma.location.findFirst({
                        where: {
                            ocpi_location_id: ids.location_id,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (location) {
                        logData.location = { connect: { id: location.id } };
                    }
                }

                // Resolve EVSE internal ID (need location_id first)
                if (ids.evse_id && ids.location_id) {
                    const location = await databaseService.prisma.location.findFirst({
                        where: {
                            ocpi_location_id: ids.location_id,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (location) {
                        const evse = await databaseService.prisma.eVSE.findFirst({
                            where: {
                                location_id: location.id,
                                uid: ids.evse_id,
                                partner_id: resolvedPartnerId,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (evse) {
                            logData.evse = { connect: { id: evse.id } };
                        }
                    }
                }

                // Resolve connector internal ID (need location_id and evse_id first)
                if (ids.connector_id && ids.evse_id && ids.location_id) {
                    const location = await databaseService.prisma.location.findFirst({
                        where: {
                            ocpi_location_id: ids.location_id,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (location) {
                        const evse = await databaseService.prisma.eVSE.findFirst({
                            where: {
                                location_id: location.id,
                                uid: ids.evse_id,
                                partner_id: resolvedPartnerId,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (evse) {
                            const connector = await databaseService.prisma.eVSEConnector.findFirst({
                                where: {
                                    evse_id: evse.id,
                                    connector_id: ids.connector_id,
                                    partner_id: resolvedPartnerId,
                                    deleted: false,
                                },
                                select: { id: true },
                            });
                            if (connector) {
                                logData.connector = { connect: { id: connector.id } };
                            }
                        }
                    }
                }

                // Resolve session internal ID
                if (ids.session_id) {
                    const session = await databaseService.prisma.session.findFirst({
                        where: {
                            id: ids.session_id,
                            partner_id: resolvedPartnerId,
                        },
                        select: { id: true },
                    });
                    if (session) {
                        logData.session = { connect: { id: session.id } };
                    }
                }

                // Resolve cpo_session internal ID (using cpo_session_id from OCPI)
                if (ids.cpo_session_id) {
                    const cpoSession = await databaseService.prisma.session.findFirst({
                        where: {
                            cpo_session_id: ids.cpo_session_id,
                            partner_id: resolvedPartnerId,
                        },
                        select: { id: true },
                    });
                    if (cpoSession) {
                        logData.cpo_session = { connect: { id: cpoSession.id } };
                    }
                }
            }

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            // Silently fail - logging errors should not break the request flow
            logger.error('Failed to persist OCPI request log', logError as Error, {
                path: params.req.path,
                method: params.req.method,
            });
        }
    }

    public static async logResponse(params: {
        req: Request;
        res: Response;
        responseBody: any;
        statusCode: number;
        partnerId?: string;
        command: OCPILogCommand;
    }): Promise<void> {
        try {
            const {
                req,
                res,
                responseBody,
                statusCode,
                partnerId,
                command,
            } = params;

            const authReq = req as Request & {
                ocpiPartnerCredentials?: OCPIPartnerCredentials;
            };

            const resolvedPartnerId = partnerId ?? authReq.ocpiPartnerCredentials?.partner_id;
            if (!resolvedPartnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            // Strip BigInt from payload so JSON.stringify does not fail
            const safePayload = JSON.parse(
                JSON.stringify(
                    responseBody,
                    (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
                ),
            );

            const payload = this.toSafeJson({
                method: req.method,
                headers: res.getHeaders(),
                responseBody: safePayload,
                statusCode,
            });

            const url = (req as any).originalUrl ?? req.url;

            // Extract IDs from request (these are OCPI IDs, not internal DB IDs)
            const ids = this.extractIdsFromRequest(req, command);

            // Build additional_props with OCPI IDs for easy debugging
            const additionalProps: Record<string, any> = {
                ...(ids.additional_props || {}),
            };

            // Store OCPI IDs in additional_props
            if (ids.location_id) {
                additionalProps.ocpi_location_id = ids.location_id;
            }
            if (ids.evse_id) {
                additionalProps.ocpi_evse_uid = ids.evse_id;
            }
            if (ids.connector_id) {
                additionalProps.ocpi_connector_id = ids.connector_id;
            }
            if (ids.authorization_reference) {
                additionalProps.ocpi_authorization_reference = ids.authorization_reference;
            }
            if (ids.cpo_session_id) {
                additionalProps.ocpi_cpo_session_id = ids.cpo_session_id;
            }

            // Build log data with relations
            const logData: any = {
                command,
                sender_type: 'EMSP',
                url,
                payload,
                additional_props: Object.keys(additionalProps).length > 0 ? additionalProps : undefined,
                partner: {
                    connect: { id: resolvedPartnerId },
                },
            };

            // Store OCPI cpo_session_id in additional_props for reference
            if (ids.cpo_session_id) {
                additionalProps.ocpi_cpo_session_id = ids.cpo_session_id;
                logData.additional_props = additionalProps;
            }

            // Resolve internal database IDs from OCPI IDs for relations
            // Only resolve if we have the necessary OCPI IDs and partner ID
            if (resolvedPartnerId) {
                const { databaseService } = await import('../../services/database.service');

                // Resolve location internal ID
                if (ids.location_id) {
                    const location = await databaseService.prisma.location.findFirst({
                        where: {
                            ocpi_location_id: ids.location_id,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (location) {
                        logData.location = { connect: { id: location.id } };
                    }
                }

                // Resolve EVSE internal ID (need location_id first)
                if (ids.evse_id && ids.location_id) {
                    const location = await databaseService.prisma.location.findFirst({
                        where: {
                            ocpi_location_id: ids.location_id,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (location) {
                        const evse = await databaseService.prisma.eVSE.findFirst({
                            where: {
                                location_id: location.id,
                                uid: ids.evse_id,
                                partner_id: resolvedPartnerId,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (evse) {
                            logData.evse = { connect: { id: evse.id } };
                        }
                    }
                }

                // Resolve connector internal ID (need location_id and evse_id first)
                if (ids.connector_id && ids.evse_id && ids.location_id) {
                    const location = await databaseService.prisma.location.findFirst({
                        where: {
                            ocpi_location_id: ids.location_id,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (location) {
                        const evse = await databaseService.prisma.eVSE.findFirst({
                            where: {
                                location_id: location.id,
                                uid: ids.evse_id,
                                partner_id: resolvedPartnerId,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (evse) {
                            const connector = await databaseService.prisma.eVSEConnector.findFirst({
                                where: {
                                    evse_id: evse.id,
                                    connector_id: ids.connector_id,
                                    partner_id: resolvedPartnerId,
                                    deleted: false,
                                },
                                select: { id: true },
                            });
                            if (connector) {
                                logData.connector = { connect: { id: connector.id } };
                            }
                        }
                    }
                }

                // Resolve session internal ID
                if (ids.session_id) {
                    const session = await databaseService.prisma.session.findFirst({
                        where: {
                            id: ids.session_id,
                            partner_id: resolvedPartnerId,
                        },
                        select: { id: true },
                    });
                    if (session) {
                        logData.session = { connect: { id: session.id } };
                    }
                }

                // Resolve cpo_session internal ID (using cpo_session_id from OCPI)
                if (ids.cpo_session_id) {
                    const cpoSession = await databaseService.prisma.session.findFirst({
                        where: {
                            cpo_session_id: ids.cpo_session_id,
                            partner_id: resolvedPartnerId,
                        },
                        select: { id: true },
                    });
                    if (cpoSession) {
                        logData.cpo_session = { connect: { id: cpoSession.id } };
                    }
                }
            }

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            // Silently fail - logging errors should not break the request flow
            logger.error('Failed to persist OCPI response log', logError as Error, {
                path: params.req.path,
                method: params.req.method,
            });
        }
    }

    /**
     * Extract IDs from outgoing request URL and body
     * OCPI URLs follow pattern: /{version}/{resource}/{country_code}/{party_id}/{id}
     * or /{version}/{resource}/{country_code}/{party_id}/{location_id}/{evse_uid}/{connector_id}
     */
    private static extractIdsFromOutgoingRequest(
        url: string,
        requestBody?: any,
        command?: OCPILogCommand,
    ): {
        location_id?: string;
        evse_id?: string;
        connector_id?: string;
        session_id?: string;
        authorization_reference?: string;
        cpo_session_id?: string;
        additional_props?: Record<string, any>;
    } {
        const result: {
            location_id?: string;
            evse_id?: string;
            connector_id?: string;
            session_id?: string;
            authorization_reference?: string;
            cpo_session_id?: string;
            additional_props?: Record<string, any>;
        } = {};

        // Extract from URL path - handle OCPI pattern: /{version}/{resource}/{country_code}/{party_id}/{id}
        // Locations: /locations/{country_code}/{party_id}/{location_id}
        const locationMatch = url.match(/\/locations\/[^/]+\/[^/]+\/([^/?]+)/);
        if (locationMatch) {
            result.location_id = locationMatch[1];
        }

        // EVSEs: /locations/{country_code}/{party_id}/{location_id}/{evse_uid}
        const evseMatch = url.match(/\/locations\/[^/]+\/[^/]+\/[^/]+\/([^/?]+)(?:\/|$)/);
        if (evseMatch && url.includes('/evses')) {
            result.evse_id = evseMatch[1];
        }
        else if (evseMatch && !url.includes('/connectors')) {
            // If it's not a connector path, it might be an evse_uid
            const pathParts = url.split('/');
            const evseIndex = pathParts.findIndex(p => p === 'evses' || p.includes('evse'));
            if (evseIndex > 0 && pathParts[evseIndex + 1]) {
                result.evse_id = pathParts[evseIndex + 1];
            }
        }

        // Connectors: /locations/{country_code}/{party_id}/{location_id}/{evse_uid}/{connector_id}
        const connectorMatch = url.match(/\/connectors\/([^/?]+)/);
        if (connectorMatch) {
            result.connector_id = connectorMatch[1];
        }

        // Sessions: /sessions/{country_code}/{party_id}/{session_id}
        const sessionMatch = url.match(/\/sessions\/[^/]+\/[^/]+\/([^/?]+)/);
        if (sessionMatch) {
            result.session_id = sessionMatch[1];
        }

        // Extract from request body
        if (requestBody) {
            // Location ID
            if (requestBody.id && (command?.toString().includes('Location') || url.includes('/locations'))) {
                result.location_id = requestBody.id;
            }

            // EVSE UID
            if (requestBody.uid && (command?.toString().includes('EVSE') || url.includes('/evses'))) {
                result.evse_id = requestBody.uid;
            }

            // Connector ID
            if (requestBody.id && (command?.toString().includes('Connector') || url.includes('/connectors'))) {
                result.connector_id = requestBody.id;
            }

            // Session ID (CPO's session ID)
            if (requestBody.id && (command?.toString().includes('Session') || url.includes('/sessions'))) {
                result.cpo_session_id = requestBody.id;
            }

            // Authorization reference
            if (requestBody.authorization_reference) {
                result.authorization_reference = requestBody.authorization_reference;
            }
        }

        // Additional props
        const additional: Record<string, any> = {};

        // Extract from URL for other resources
        // Tariffs: /tariffs/{country_code}/{party_id}/{tariff_id}
        const tariffMatch = url.match(/\/tariffs\/[^/]+\/[^/]+\/([^/?]+)/);
        if (tariffMatch) {
            additional.tariff_id = tariffMatch[1];
        }

        // CDRs: /cdrs/{country_code}/{party_id}/{cdr_id}
        const cdrMatch = url.match(/\/cdrs\/[^/]+\/[^/]+\/([^/?]+)/);
        if (cdrMatch) {
            additional.cdr_id = cdrMatch[1];
        }

        // Tokens: /tokens/{country_code}/{party_id}/{token_uid}
        const tokenMatch = url.match(/\/tokens\/[^/]+\/[^/]+\/([^/?]+)/);
        if (tokenMatch) {
            additional.token_uid = tokenMatch[1];
        }

        // Commands: /commands/{command_type}/{command_id}
        const commandMatch = url.match(/\/commands\/[^/]+\/([^/?]+)/);
        if (commandMatch) {
            additional.command_id = commandMatch[1];
        }

        // From request body
        if (requestBody) {
            if (requestBody.id && url.includes('/tariffs')) {
                additional.tariff_id = requestBody.id;
            }
            if (requestBody.id && url.includes('/cdrs')) {
                additional.cdr_id = requestBody.id;
            }
            if (requestBody.uid && url.includes('/tokens')) {
                additional.token_uid = requestBody.uid;
            }
        }

        if (Object.keys(additional).length > 0) {
            result.additional_props = additional;
        }

        return result;
    }

    /**
     * Helper method to resolve internal database IDs from OCPI IDs and add relations to logData
     */
    private static async resolveIdsAndAddRelations(
        logData: any,
        ids: {
            location_id?: string;
            evse_id?: string;
            connector_id?: string;
            session_id?: string;
            authorization_reference?: string;
            cpo_session_id?: string;
        },
        partnerId: string,
    ): Promise<void> {
        const { databaseService } = await import('../../services/database.service');

        // Cache location lookup to avoid multiple queries
        let locationInternalId: string | null = null;

        // Resolve location internal ID (needed for EVSE and connector lookups)
        if (ids.location_id) {
            const location = await databaseService.prisma.location.findFirst({
                where: {
                    ocpi_location_id: ids.location_id,
                    partner_id: partnerId,
                    deleted: false,
                },
                select: { id: true },
            });
            if (location) {
                locationInternalId = location.id;
                logData.location = { connect: { id: location.id } };
            }
        }

        // Resolve EVSE internal ID (requires location)
        if (ids.evse_id && locationInternalId) {
            const evse = await databaseService.prisma.eVSE.findFirst({
                where: {
                    location_id: locationInternalId,
                    uid: ids.evse_id,
                    partner_id: partnerId,
                    deleted: false,
                },
                select: { id: true },
            });
            if (evse) {
                logData.evse = { connect: { id: evse.id } };

                // Resolve connector internal ID (requires EVSE)
                if (ids.connector_id) {
                    const connector = await databaseService.prisma.eVSEConnector.findFirst({
                        where: {
                            evse_id: evse.id,
                            connector_id: ids.connector_id,
                            partner_id: partnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (connector) {
                        logData.connector = { connect: { id: connector.id } };
                    }
                }
            }
        }

        // Resolve session internal ID
        if (ids.session_id) {
            const session = await databaseService.prisma.session.findFirst({
                where: {
                    id: ids.session_id,
                    partner_id: partnerId,
                },
                select: { id: true },
            });
            if (session) {
                logData.session = { connect: { id: session.id } };
            }
        }

        // Resolve authorization_reference_session (find session by authorization_reference)
        if (ids.authorization_reference) {
            const authRefSession = await databaseService.prisma.session.findFirst({
                where: {
                    authorization_reference: ids.authorization_reference,
                    partner_id: partnerId,
                },
                select: { id: true },
            });
            if (authRefSession) {
                logData.authorization_reference_session = { connect: { id: authRefSession.id } };
            }
        }

        // Resolve cpo_session internal ID (using cpo_session_id from OCPI)
        if (ids.cpo_session_id) {
            const cpoSession = await databaseService.prisma.session.findFirst({
                where: {
                    cpo_session_id: ids.cpo_session_id,
                    partner_id: partnerId,
                },
                select: { id: true },
            });
            if (cpoSession) {
                logData.cpo_session = { connect: { id: cpoSession.id } };
            }
        }
    }

    /**
     * Log outgoing request (EMSP → CPO) - called before sending the request
     */
    public static async logOutgoingRequest(params: {
        url: string;
        method: string;
        headers: Record<string, string | number | boolean | undefined>;
        requestBody?: any;
        partnerId?: string;
        command?: OCPILogCommand;
    }): Promise<void> {
        try {
            const {
                url,
                method,
                headers,
                requestBody,
                partnerId,
                command,
            } = params;

            if (!partnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            const payload = this.toSafeJson({
                method,
                url,
                headers,
                requestBody,
            });

            // Extract IDs from outgoing request (these are OCPI IDs, not internal DB IDs)
            const ids = this.extractIdsFromOutgoingRequest(url, requestBody, command);

            // Build additional_props with OCPI IDs for easy debugging
            const additionalProps: Record<string, any> = {
                ...(ids.additional_props || {}),
            };

            // Store OCPI IDs in additional_props
            if (ids.location_id) {
                additionalProps.ocpi_location_id = ids.location_id;
            }
            if (ids.evse_id) {
                additionalProps.ocpi_evse_uid = ids.evse_id;
            }
            if (ids.connector_id) {
                additionalProps.ocpi_connector_id = ids.connector_id;
            }

            // Store OCPI IDs in additional_props
            if (ids.authorization_reference) {
                additionalProps.ocpi_authorization_reference = ids.authorization_reference;
            }
            if (ids.cpo_session_id) {
                additionalProps.ocpi_cpo_session_id = ids.cpo_session_id;
            }

            // Build log data with relations
            const logData: any = {
                command: command ?? (`OUTGOING ${method} ${url}` as any),
                sender_type: 'EMSP',
                url,
                payload,
                additional_props: Object.keys(additionalProps).length > 0 ? additionalProps : undefined,
                partner: {
                    connect: { id: partnerId },
                },
            };

            // Resolve internal database IDs from OCPI IDs for relations
            await this.resolveIdsAndAddRelations(logData, ids, partnerId);

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            logger.error('Failed to persist OCPI outgoing request log', logError as Error);
        }
    }

    /**
     * Log incoming response (CPO → EMSP) - called after receiving the response
     */
    public static async logOutgoingResponse(params: {
        url: string;
        method: string;
        headers: Record<string, string | number | boolean | undefined>;
        responseBody?: any;
        statusCode?: number;
        partnerId?: string;
        command?: OCPILogCommand;
        error?: any;
    }): Promise<void> {
        try {
            const {
                url,
                method,
                headers,
                responseBody,
                statusCode,
                partnerId,
                command,
                error,
            } = params;

            if (!partnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            // Convert Req command to Res command if applicable
            let responseCommand: OCPILogCommand | string | undefined = command;
            if (command && typeof command === 'string') {
                // Try to convert Req to Res
                if (command.endsWith('Req')) {
                    responseCommand = command.replace('Req', 'Res') as OCPILogCommand;
                }
            }

            const payload = this.toSafeJson({
                method,
                url,
                headers,
                responseBody: responseBody ?? (error ? { error } : undefined),
                statusCode,
                error,
            });

            // Extract IDs from outgoing request URL (same as request)
            // Also try to extract from response body if available
            const ids = this.extractIdsFromOutgoingRequest(url, responseBody?.data || responseBody, command);

            // Build additional_props with OCPI IDs for easy debugging
            const additionalProps: Record<string, any> = {
                ...(ids.additional_props || {}),
            };

            // Store OCPI IDs in additional_props
            if (ids.location_id) {
                additionalProps.ocpi_location_id = ids.location_id;
            }
            if (ids.evse_id) {
                additionalProps.ocpi_evse_uid = ids.evse_id;
            }
            if (ids.connector_id) {
                additionalProps.ocpi_connector_id = ids.connector_id;
            }
            if (ids.authorization_reference) {
                additionalProps.ocpi_authorization_reference = ids.authorization_reference;
            }
            if (ids.cpo_session_id) {
                additionalProps.ocpi_cpo_session_id = ids.cpo_session_id;
            }

            // Build log data with relations
            const logData: any = {
                command: (responseCommand ?? `OUTGOING ${method} ${url} RESPONSE`) as OCPILogCommand,
                sender_type: 'EMSP',
                url,
                payload,
                additional_props: Object.keys(additionalProps).length > 0 ? additionalProps : undefined,
                partner: {
                    connect: { id: partnerId },
                },
            };

            // Resolve internal database IDs from OCPI IDs for relations
            await this.resolveIdsAndAddRelations(logData, ids, partnerId);

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            logger.error('Failed to persist OCPI outgoing response log', logError as Error);
        }
    }
}


