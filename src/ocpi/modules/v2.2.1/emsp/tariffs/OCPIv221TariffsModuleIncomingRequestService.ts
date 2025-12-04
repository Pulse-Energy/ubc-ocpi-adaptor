import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPITariffResponse, OCPITariffsResponse } from "../../../../schema/modules/tariffs/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";
import { TariffDbService } from "../../../../../db-services/TariffDbService";
import { OCPITariff } from "../../../../schema/modules/tariffs/types";
import { logger } from "../../../../../services/logger.service";
import { OCPIResponseStatusCode } from "../../../../schema/general/enum";

/**
 * Handle all incoming requests for the Tariffs module from the CPO
 */
export default class OCPIv221TariffsModuleIncomingRequestService {

    // get requests

    public static async handleGetTariffs(req: Request): Promise<HttpResponse<OCPITariffsResponse>> {
        try {
            const limit = req.query.limit ? Number(req.query.limit) : undefined;
            const offset = req.query.offset ? Number(req.query.offset) : undefined;
            const countryCode = req.query.country_code as string | undefined;
            const partyId = req.query.party_id as string | undefined;
            const dateFrom = req.query.date_from as string | undefined;
            const dateTo = req.query.date_to as string | undefined;

            // Date filtering will be applied after fetching from DB
            // (TariffDbService.findAll doesn't support date filtering yet)

            // Get tariffs with pagination
            const tariffs = await TariffDbService.findAll(
                countryCode,
                partyId,
                limit,
                offset
            );

            // Apply date filtering if needed
            let filteredTariffs = tariffs;
            if (dateFrom || dateTo) {
                filteredTariffs = tariffs.filter(tariff => {
                    const lastUpdated = tariff.last_updated;
                    if (dateFrom && lastUpdated < new Date(dateFrom)) {
                        return false;
                    }
                    if (dateTo && lastUpdated > new Date(dateTo)) {
                        return false;
                    }
                    return true;
                });
            }

            const ocpiTariffs: OCPITariff[] = filteredTariffs.map((tariff) =>
                TariffDbService.mapPrismaTariffToOcpi(tariff)
            );

            // Build pagination Link header if limit is specified
            const headers: Record<string, string> = {};
            if (limit && limit > 0) {
                const baseUrl = `${req.protocol}://${req.get('host')}${req.path}`;
                const queryParams = new globalThis.URLSearchParams();
                if (countryCode) queryParams.append('country_code', countryCode);
                if (partyId) queryParams.append('party_id', partyId);
                if (dateFrom) queryParams.append('date_from', dateFrom);
                if (dateTo) queryParams.append('date_to', dateTo);
                queryParams.append('limit', limit.toString());

                const links: string[] = [];
                if (offset && offset > 0) {
                    const prevOffset = Math.max(0, offset - limit);
                    queryParams.set('offset', prevOffset.toString());
                    links.push(`<${baseUrl}?${queryParams.toString()}>; rel="previous"`);
                }
                if (ocpiTariffs.length === limit) {
                    const nextOffset = (offset || 0) + limit;
                    queryParams.set('offset', nextOffset.toString());
                    links.push(`<${baseUrl}?${queryParams.toString()}>; rel="next"`);
                }
                if (links.length > 0) {
                    headers.Link = links.join(', ');
                }
            }

            return {
                httpStatus: 200,
                payload: OCPIResponseService.success(ocpiTariffs).payload,
                headers,
            };
        } 
        catch (error) {
            logger.error('Error fetching tariffs', error as Error, {
                query: req.query,
            });
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch tariffs',
                error: error instanceof Error ? error.message : String(error),
            }) as HttpResponse<OCPITariffsResponse>;
        }
    }

    public static async handleGetTariff(req: Request): Promise<HttpResponse<OCPITariffResponse>> {
        try {
            const tariffId = req.params.tariff_id;
            const countryCode = (req.query.country_code as string) || (req.params.country_code as string);
            const partyId = (req.query.party_id as string) || (req.params.party_id as string);

            if (!tariffId) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'tariff_id parameter is required',
                }) as HttpResponse<OCPITariffResponse>;
            }

            // If country_code and party_id are provided, use them for precise lookup
            if (countryCode && partyId) {
                const tariff = await TariffDbService.findByOcpiTariffId(
                    countryCode,
                    partyId,
                    tariffId
                );

                if (!tariff) {
                    return OCPIResponseService.clientError<unknown>({
                        message: 'Tariff not found',
                    }, OCPIResponseStatusCode.status_2003) as HttpResponse<OCPITariffResponse>;
                }

                const ocpiTariff = TariffDbService.mapPrismaTariffToOcpi(tariff);
                return OCPIResponseService.success(ocpiTariff);
            }

            // If country_code and party_id are not provided, try to find by tariff_id only
            // This is less ideal but works if there's only one tariff with that ID
            const tariffs = await TariffDbService.findAll(undefined, undefined, undefined, undefined);
            const matchingTariffs = tariffs.filter(t => t.ocpi_tariff_id === tariffId);

            if (matchingTariffs.length === 0) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Tariff not found',
                }, OCPIResponseStatusCode.status_2003) as HttpResponse<OCPITariffResponse>;
            }

            if (matchingTariffs.length > 1) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Multiple tariffs found with the same ID. Please provide country_code and party_id',
                }) as HttpResponse<OCPITariffResponse>;
            }

            const ocpiTariff = TariffDbService.mapPrismaTariffToOcpi(matchingTariffs[0]);
            return OCPIResponseService.success(ocpiTariff);
        } 
        catch (error) {
            logger.error('Error fetching tariff', error as Error, {
                params: req.params,
                query: req.query,
            });
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch tariff',
                error: error instanceof Error ? error.message : String(error),
            }) as HttpResponse<OCPITariffResponse>;
        }
    }

    // put requests

    public static async handlePutTariff(req: Request): Promise<HttpResponse<OCPITariffResponse>> {
        try {
            const tariffId = req.params.tariff_id;
            const countryCode = (req.params.country_code as string) || (req.query.country_code as string);
            const partyId = (req.params.party_id as string) || (req.query.party_id as string);
            const ocpiTariff = req.body as OCPITariff;

            if (!ocpiTariff) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Tariff data is required',
                }) as HttpResponse<OCPITariffResponse>;
            }

            // Validate that the tariff ID in the URL matches the one in the body
            if (ocpiTariff.id !== tariffId) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Tariff ID in URL does not match the ID in the request body',
                }) as HttpResponse<OCPITariffResponse>;
            }

            // Validate country_code and party_id match if provided in URL
            if (countryCode && ocpiTariff.country_code !== countryCode) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Country code in URL does not match the country code in the request body',
                }) as HttpResponse<OCPITariffResponse>;
            }
            if (partyId && ocpiTariff.party_id !== partyId) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Party ID in URL does not match the party ID in the request body',
                }) as HttpResponse<OCPITariffResponse>;
            }

            // Validate required fields
            if (!ocpiTariff.country_code || !ocpiTariff.party_id || !ocpiTariff.currency) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Missing required fields: country_code, party_id, or currency',
                }) as HttpResponse<OCPITariffResponse>;
            }

            // Validate elements array is present and not empty
            if (!ocpiTariff.elements || !Array.isArray(ocpiTariff.elements) || ocpiTariff.elements.length === 0) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Tariff must have at least one element',
                }) as HttpResponse<OCPITariffResponse>;
            }

            // Check if tariff already exists to determine HTTP status code
            const existingTariff = await TariffDbService.findByOcpiTariffId(
                ocpiTariff.country_code,
                ocpiTariff.party_id,
                ocpiTariff.id
            );

            // Store or update the tariff in the database
            const storedTariff = await TariffDbService.upsertFromOcpiTariff(ocpiTariff);
            const responseTariff = TariffDbService.mapPrismaTariffToOcpi(storedTariff);

            logger.info('Tariff stored/updated', {
                tariffId: ocpiTariff.id,
                countryCode: ocpiTariff.country_code,
                partyId: ocpiTariff.party_id,
                isNew: !existingTariff,
            });

            // Return 201 for new tariffs, 200 for updates (OCPI 2.2.1 spec)
            return {
                httpStatus: existingTariff ? 200 : 201,
                payload: OCPIResponseService.success(responseTariff).payload,
            };
        } 
        catch (error) {
            logger.error('Error storing tariff', error as Error, {
                params: req.params,
                body: req.body,
            });
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to store tariff',
                error: error instanceof Error ? error.message : String(error),
            }) as HttpResponse<OCPITariffResponse>;
        }
    }

}

