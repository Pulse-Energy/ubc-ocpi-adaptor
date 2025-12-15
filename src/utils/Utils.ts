/* eslint-disable @typescript-eslint/no-unused-vars */
import { randomUUID } from "crypto";
import { BecknDomain } from "../ubc/schema/v2.0.0/enums/BecknDomain";
import GLOBAL_VARS from "../constants/global-vars";
import { BecknAction } from "../ubc/schema/v2.0.0/enums/BecknAction";
import { Context } from "../ubc/schema/v2.0.0/types/Context";
import { Request } from "express";
import { OCPICredentialsRoleClass } from "../ocpi/schema/modules/credentials/types";
import { databaseService } from "../services/database.service";
import { OCPIPartner, OCPIPartnerCredentials } from "@prisma/client";

export default class Utils {
    public static upperCaseFirstLetter(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Generic helper to fetch an OCPI endpoint URL by module identifier and role.
     * Optionally filter by partner_id when known.
     * Example: getOcpiEndpoint('locations', 'SENDER', partnerId)
     */
    public static async getOcpiEndpoint(
        identifier: string,
        role: 'SENDER' | 'RECEIVER',
        partnerId?: string,
    ): Promise<string> {
        const prisma = databaseService.prisma;
        const endpoint = await prisma.oCPIPartnerEndpoint.findFirst({
            where: {
                module: identifier,
                role,
                ...(partnerId ? { partner_id: partnerId } : {}),
                deleted: false,
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        if (!endpoint || !endpoint.url) {
            throw new Error(
                `OCPI endpoint with identifier=${identifier} and role=${role} not configured in oCPIPartnerEndpoint`,
            );
        }

        return endpoint.url.replace(/\/+$/, '');
    }

    public static async getEMSPEndpoint(identifier: string, role: 'SENDER' | 'RECEIVER'): Promise<string> {
        const prisma = databaseService.prisma;
        const endpoint = await prisma.oCPIPartnerEndpoint.findFirst({
            where: {
                module: identifier,
                role,
                partner: {
                    role: 'EMSP',
                },
                deleted: false,
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        if (!endpoint || !endpoint.url) {
            throw new Error(
                `EMSP endpoint with identifier=${identifier} and role=${role} not configured in oCPIPartnerEndpoint`,
            );
        }

        return endpoint.url.replace(/\/+$/, '');
    }

    public static generateRandomString(len = 15): string {
        // ref: https://gist.github.com/6174/6062387
        const base = 8;
        const count = Math.ceil(len / base) + (len % base);
        let randomStrings = '';
        // TODO: optimize this
        for (let index = 0; index < count; index++) {
            randomStrings += Math.random().toString(36).substring(2);
        }
        return randomStrings.substring(0, len);
    }

    public static isUBCDomain(reqDetails: Request): boolean {
        return (reqDetails?.body?.metadata?.domain === BecknDomain.EVChargingUBC || reqDetails?.body?.context?.domain === BecknDomain.EVChargingUBC);
    }

    public static generateUUID(): string {
        return randomUUID();
    }




    // BPP */

    // BPP /*

    /**
     * The URL to which the request is made
     */
    public static getBPPClientHost(): string {
        return `${GLOBAL_VARS.EV_CHARGING_UBC_BPP_CLIENT_HOST}/bpp/caller`;
    }

    public static getSubscriberId(domain?: BecknDomain): string {
        return GLOBAL_VARS.EV_CHARGING_UBC_BPP_ID;
    }

    public static getUniqueId(domain?: BecknDomain): string {
        return GLOBAL_VARS.EV_CHARGING_UBC_UNIQUE_ID;
    }


    public static getBPPContext(params: {
        action: BecknAction,
        version: string,
        domain: BecknDomain,
        bap_id?: string,
        bap_uri?: string,
        bpp_id: string,
        bpp_uri: string,
        transaction_id: string,
        message_id: string,
        timestamp?: string,
    }): Context {
        const { action, version, domain, bap_id, bap_uri, bpp_id, bpp_uri, transaction_id, message_id, timestamp } = params;

        const context: Context = {
            domain: domain,
            action: action,
            version: version,
            bpp_id: bpp_id,
            bpp_uri: bpp_uri,
            transaction_id: transaction_id,
            message_id: message_id,
            timestamp: timestamp ?? new Date().toISOString(),
        };

        // Only include bap_id and bap_uri if they are provided
        if (bap_id) {
            context.bap_id = bap_id;
        }
        if (bap_uri) {
            context.bap_uri = bap_uri;
        }

        return context;
    }

    static async executeAsync(fn: any): Promise<void> {
        return fn();
    }

    public static async findPartnerCredentialsUsingCPOAuthToken(cpoAuthToken: string): Promise<OCPIPartnerCredentials | null> {
        const partnerCredentials =
            await databaseService.prisma.oCPIPartnerCredentials.findFirst({
                where: { cpo_auth_token: cpoAuthToken },
            });

        return partnerCredentials;
    }

    /**
     * Find OCPI partner credentials using the EMSP auth token.
     * emsp_auth_token is the token the CPO uses to call this EMSP.
     */
    public static async findPartnerCredentialsUsingEMSPAuthToken(
        emspAuthToken: string,
    ): Promise<OCPIPartnerCredentials | null> {
        const partnerCredentials =
            await databaseService.prisma.oCPIPartnerCredentials.findFirst({
                where: { emsp_auth_token: emspAuthToken },
            });

        return partnerCredentials;
    }

    /**
     * Find the single EMSP partner configured in the system.
     * Assumes there is exactly one partner row with role = 'EMSP'.
     */
    public static async findEmspPartner(): Promise<OCPIPartner | null> {
        return databaseService.prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });
    }

    
}