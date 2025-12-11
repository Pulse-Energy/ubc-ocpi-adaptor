import { Request } from 'express';
import { OCPILogDbService } from '../../db-services/OCPILogDbService';
import { OCPIPartnerCredentials } from '@prisma/client';

type Direction = 'INCOMING' | 'OUTGOING';

export class OCPIRequestLogService {
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

    public static async logIncoming(params: {
        req: Request;
        direction?: Direction;
        partnerId?: string;
        command?: string;
        responsePayload?: any;
        statusCode?: number;
    }): Promise<void> {
        const {
            req,
            direction = 'INCOMING',
            partnerId,
            command,
            responsePayload,
            statusCode,
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
            direction,
            method: req.method,
            path: req.path,
            query: req.query,
            headers: req.headers,
            body: req.body,
            statusCode,
            response: responsePayload,
        });

        await OCPILogDbService.createLog({
            command: command ?? `${direction} ${req.method} ${req.path}`,
            payload,
            partner: {
                connect: { id: resolvedPartnerId },
            },
        });
    }

    public static async logOutgoing(params: {
        url: string;
        method: string;
        headers: Record<string, string | number | boolean | undefined>;
        requestBody?: any;
        responseBody?: any;
        statusCode?: number;
        partnerId?: string;
        command?: string;
        error?: any;
    }): Promise<void> {
        const {
            url,
            method,
            headers,
            requestBody,
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

        const payload = this.toSafeJson({
            direction: 'OUTGOING' as Direction,
            method,
            url,
            headers,
            requestBody,
            responseBody,
            statusCode,
            error,
        });

        await OCPILogDbService.createLog({
            command: command ?? `OUTGOING ${method} ${url}`,
            payload,
            partner: {
                connect: { id: partnerId },
            },
        });
    }
}


