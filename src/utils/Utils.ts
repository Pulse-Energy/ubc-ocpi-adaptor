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
    
        // BAP /*
    
        public static getBapId(): string {
            return GLOBAL_VARS.EV_CHARGING_UBC_BAP_ID;
        }
    
        /**
         * The URL to which the request is made
         */
        public static getBAPClientHost(): string {
            return `${GLOBAL_VARS.EV_CHARGING_UBC_BAP_CLIENT_HOST}/bap/caller`;
        }
    
        /**
         * The URL to which the request is made
         */
        public static getBAPNetworkHost(): string {
            return `${GLOBAL_VARS.EV_CHARGING_UBC_BAP_NETWORK_HOST}/bap/receiver`;
        }
    
        /**
         * This is the URL that goes in `context.bap_uri`
         * Since its `context.bap_uri`, it will always end with receiver as its facing the network side
         */
        public static getBAPContextURI(): string {
            return `${GLOBAL_VARS.EV_CHARGING_UBC_CONTEXT_BAP_URI}/bap/receiver`;
        }
    
        // BPP */
    
        // BPP /*
    
        public static getBppId(): string {
            return GLOBAL_VARS.EV_CHARGING_UBC_BPP_ID;
        }
    
        /**
         * The URL to which the request is made
         */
        public static getBPPClientHost(): string {
            return `${GLOBAL_VARS.EV_CHARGING_UBC_BPP_CLIENT_HOST}/bpp/caller`;
        }
    
        /**
         * The URL to which the request is made
         */
        public static getBPPNetworkHost(): string {
            return `${GLOBAL_VARS.EV_CHARGING_UBC_BPP_NETWORK_HOST}/bpp/receiver`;
        }
    
        /**
         * This is the URL that goes in `context.bpp_uri`
         * Since its `context.bpp_uri`, it will always end with receiver as its facing the network side
         */
        public static getBPPContextURI(): string {
            return `${GLOBAL_VARS.EV_CHARGING_UBC_CONTEXT_BPP_URI}/bpp/receiver`;
        }
    
        /**
         * This should be the url of the backend server of the CPO i.e. pulse-central
         */
        public static getCPOBackendHost(): string {
            return GLOBAL_VARS.EV_CHARGING_UBC_CPO_BACKEND_HOST;
        }
    
        /**
         * This should be the url of the backend server of the app i.e. pulse-central
         */
         public static getAppBackendHost(): string {
            return GLOBAL_VARS.EV_CHARGING_UBC_APP_BACKEND_HOST;
        }
    
        public static getSubscriberId(domain?: BecknDomain): string {
            return GLOBAL_VARS.EV_CHARGING_UBC_SUBSCRIBER_ID;
        }
    
        public static getUniqueId(domain?: BecknDomain): string {
            return GLOBAL_VARS.EV_CHARGING_UBC_UNIQUE_ID;
        }
    
        public static getBAPContext(params: {
            action: BecknAction,
            version: string,
            domain: BecknDomain,
            bap_id?: string,
            bap_uri?: string,
            bpp_id: string,
            bpp_uri: string,
            transaction_id: string,
            message_id?: string,
            timestamp?: string,
        }): Context {
            const { action, version, domain, bap_id, bap_uri, bpp_id, bpp_uri, transaction_id, message_id, timestamp } = params;
    
            return {
                domain: domain,
                action: action,
                version: version,
                bap_id: bap_id ?? this.getBapId(),
                bap_uri: bap_uri ?? this.getBAPNetworkHost(),
                bpp_id: bpp_id,
                bpp_uri: bpp_uri,
                transaction_id: transaction_id,
                message_id: message_id ?? this.generateUUID(),
                timestamp: timestamp ?? new Date().toISOString(),
            };
        }
    
        public static getBPPContext(params: {
            action: BecknAction,
            version: string,
            domain: BecknDomain,
            bap_id?: string,
            bap_uri?: string,
            bpp_id?: string,
            bpp_uri?: string,
            transaction_id: string,
            message_id: string,
            timestamp?: string,
        }): Context {
            const { action, version, domain, bap_id, bap_uri, bpp_id, bpp_uri, transaction_id, message_id, timestamp } = params;
    
            const context: Context = {
                domain: domain,
                action: action,
                version: version,
                bpp_id: bpp_id ?? this.getBppId(),
                bpp_uri: bpp_uri ?? this.getBPPNetworkHost(),
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
            const partnerCredentials = await databaseService.prisma.oCPIPartnerCredentials.findFirst({
                where: { cpo_auth_token: cpoAuthToken },
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

        /**
         * Find or create a CPO partner for the given (country_code, party_id).
         * Used for associating OCPI data (locations, tariffs, sessions, etc.) to the correct CPO.
         */
        public static async findOrCreateCpoPartner(countryCode: string, partyId: string): Promise<OCPIPartner> {
            const prisma = databaseService.prisma;

            let partner = await prisma.oCPIPartner.findFirst({
                where: {
                    country_code: countryCode,
                    party_id: partyId,
                    role: 'CPO',
                },
            });

            if (!partner) {
                partner = await prisma.oCPIPartner.create({
                    data: {
                        name: null,
                        country_code: countryCode,
                        party_id: partyId,
                        role: 'CPO',
                        versions_url: '',
                        status: 'INIT',
                    },
                });
            }

            return partner;
        }
    
}