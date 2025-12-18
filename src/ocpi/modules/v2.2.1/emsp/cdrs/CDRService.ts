import { Prisma, CDR } from '@prisma/client';
import {
    OCPICDR,
} from '../../../../schema/modules/cdrs/types';
import { isEqual } from 'lodash';

/**
 * Service for building create and update fields from OCPI CDR payloads
 * Only includes fields that are present in the payload
 */
export class CDRService {
    /**
     * Build CDR create fields from OCPI payload - only includes fields present in payload
     */
    public static buildCdrCreateFields(
        payload: OCPICDR,
        partnerId: string,
    ): Prisma.CDRUncheckedCreateInput {
        const cdrCreateFields: Partial<Prisma.CDRUncheckedCreateInput> = {
            partner_id: partnerId,
            deleted: false,
            deleted_at: null,
        };

        if (payload.country_code !== undefined) cdrCreateFields.country_code = payload.country_code;
        if (payload.party_id !== undefined) cdrCreateFields.party_id = payload.party_id;
        if (payload.id !== undefined) cdrCreateFields.ocpi_cdr_id = payload.id;
        if (payload.start_date_time !== undefined) cdrCreateFields.start_date_time = new Date(payload.start_date_time);
        if (payload.end_date_time !== undefined) cdrCreateFields.end_date_time = new Date(payload.end_date_time);
        if (payload.session_id !== undefined) cdrCreateFields.session_id = payload.session_id ?? null;
        if (payload.cdr_token !== undefined) cdrCreateFields.cdr_token = payload.cdr_token as Prisma.InputJsonValue;
        if (payload.auth_method !== undefined) cdrCreateFields.auth_method = String(payload.auth_method);
        if (payload.authorization_reference !== undefined) cdrCreateFields.authorization_reference = payload.authorization_reference ?? null;
        if (payload.cdr_location !== undefined) cdrCreateFields.cdr_location = payload.cdr_location as Prisma.InputJsonValue;
        if (payload.meter_id !== undefined) cdrCreateFields.meter_id = payload.meter_id ?? null;
        if (payload.currency !== undefined) cdrCreateFields.currency = payload.currency;
        if (payload.tariffs !== undefined) cdrCreateFields.tariffs = payload.tariffs ? (payload.tariffs as unknown as Prisma.InputJsonValue) : undefined;
        if (payload.charging_periods !== undefined) cdrCreateFields.charging_periods = payload.charging_periods as Prisma.InputJsonValue;
        if (payload.signed_data !== undefined) cdrCreateFields.signed_data = payload.signed_data ? (payload.signed_data as unknown as Prisma.InputJsonValue) : undefined;
        if (payload.total_cost !== undefined) cdrCreateFields.total_cost = payload.total_cost as Prisma.InputJsonValue;
        if (payload.total_fixed_cost !== undefined) cdrCreateFields.total_fixed_cost = payload.total_fixed_cost ? (payload.total_fixed_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_energy !== undefined) cdrCreateFields.total_energy = new Prisma.Decimal(payload.total_energy);
        if (payload.total_energy_cost !== undefined) cdrCreateFields.total_energy_cost = payload.total_energy_cost ? (payload.total_energy_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_time !== undefined) {
            // OCPI provides total_time in hours (decimal). We store it as seconds in BigInt.
            cdrCreateFields.total_time = BigInt(Math.round(Number(payload.total_time ?? 0) * 3600));
        }
        if (payload.total_time_cost !== undefined) cdrCreateFields.total_time_cost = payload.total_time_cost ? (payload.total_time_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_parking_time !== undefined) {
            // OCPI provides total_parking_time in hours (decimal). We store it as seconds in BigInt.
            cdrCreateFields.total_parking_time = payload.total_parking_time != null
                ? BigInt(Math.round(Number(payload.total_parking_time) * 3600))
                : undefined;
        }
        if (payload.total_parking_cost !== undefined) cdrCreateFields.total_parking_cost = payload.total_parking_cost ? (payload.total_parking_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_reservation_cost !== undefined) cdrCreateFields.total_reservation_cost = payload.total_reservation_cost ? (payload.total_reservation_cost as Prisma.InputJsonValue) : undefined;
        if (payload.remark !== undefined) cdrCreateFields.remark = payload.remark ?? null;
        if (payload.invoice_reference_id !== undefined) cdrCreateFields.invoice_reference_id = payload.invoice_reference_id ?? null;
        if (payload.credit !== undefined) cdrCreateFields.credit = payload.credit ?? null;
        if (payload.credit_reference_id !== undefined) cdrCreateFields.credit_reference_id = payload.credit_reference_id ?? null;
        if (payload.remarks !== undefined) cdrCreateFields.remarks = payload.remarks ?? null;
        if (payload.last_updated !== undefined) cdrCreateFields.last_updated = new Date(payload.last_updated ?? new Date().toISOString());

        return cdrCreateFields as Prisma.CDRUncheckedCreateInput;
    }

    /**
     * Build CDR update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildCdrUpdateFields(
        payload: OCPICDR,
        existing?: CDR | null,
    ): Prisma.CDRUncheckedUpdateInput {
        const cdrUpdateFields: Prisma.CDRUncheckedUpdateInput = {};

        if (payload.country_code !== undefined && (!existing || existing.country_code !== payload.country_code)) {
            cdrUpdateFields.country_code = payload.country_code;
        }
        if (payload.party_id !== undefined && (!existing || existing.party_id !== payload.party_id)) {
            cdrUpdateFields.party_id = payload.party_id;
        }
        if (payload.id !== undefined && (!existing || existing.ocpi_cdr_id !== payload.id)) {
            cdrUpdateFields.ocpi_cdr_id = payload.id;
        }
        if (payload.start_date_time !== undefined) {
            const payloadStartDate = new Date(payload.start_date_time);
            if (!existing || existing.start_date_time.getTime() !== payloadStartDate.getTime()) {
                cdrUpdateFields.start_date_time = payloadStartDate;
            }
        }
        if (payload.end_date_time !== undefined) {
            const payloadEndDate = new Date(payload.end_date_time);
            if (!existing || existing.end_date_time.getTime() !== payloadEndDate.getTime()) {
                cdrUpdateFields.end_date_time = payloadEndDate;
            }
        }
        if (payload.session_id !== undefined && (!existing || existing.session_id !== payload.session_id)) {
            cdrUpdateFields.session_id = payload.session_id ?? null;
        }
        if (payload.cdr_token !== undefined && (!existing || !isEqual(existing.cdr_token, payload.cdr_token))) {
            cdrUpdateFields.cdr_token = payload.cdr_token as Prisma.InputJsonValue;
        }
        if (payload.auth_method !== undefined && (!existing || existing.auth_method !== String(payload.auth_method))) {
            cdrUpdateFields.auth_method = String(payload.auth_method);
        }
        if (payload.authorization_reference !== undefined && (!existing || existing.authorization_reference !== payload.authorization_reference)) {
            cdrUpdateFields.authorization_reference = payload.authorization_reference ?? null;
        }
        if (payload.cdr_location !== undefined && (!existing || !isEqual(existing.cdr_location, payload.cdr_location))) {
            cdrUpdateFields.cdr_location = payload.cdr_location as Prisma.InputJsonValue;
        }
        if (payload.meter_id !== undefined && (!existing || existing.meter_id !== payload.meter_id)) {
            cdrUpdateFields.meter_id = payload.meter_id ?? null;
        }
        if (payload.currency !== undefined && (!existing || existing.currency !== payload.currency)) {
            cdrUpdateFields.currency = payload.currency;
        }
        if (payload.tariffs !== undefined && (!existing || !isEqual(existing.tariffs, payload.tariffs))) {
            cdrUpdateFields.tariffs = payload.tariffs ? (payload.tariffs as unknown as Prisma.InputJsonValue) : undefined;
        }
        if (payload.charging_periods !== undefined && (!existing || !isEqual(existing.charging_periods, payload.charging_periods))) {
            cdrUpdateFields.charging_periods = payload.charging_periods as Prisma.InputJsonValue;
        }
        if (payload.signed_data !== undefined && (!existing || !isEqual(existing.signed_data, payload.signed_data))) {
            cdrUpdateFields.signed_data = payload.signed_data ? (payload.signed_data as unknown as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_cost !== undefined && (!existing || !isEqual(existing.total_cost, payload.total_cost))) {
            cdrUpdateFields.total_cost = payload.total_cost as Prisma.InputJsonValue;
        }
        if (payload.total_fixed_cost !== undefined && (!existing || !isEqual(existing.total_fixed_cost, payload.total_fixed_cost))) {
            cdrUpdateFields.total_fixed_cost = payload.total_fixed_cost ? (payload.total_fixed_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_energy !== undefined) {
            const payloadTotalEnergy = new Prisma.Decimal(payload.total_energy);
            if (!existing || !existing.total_energy.equals(payloadTotalEnergy)) {
                cdrUpdateFields.total_energy = payloadTotalEnergy;
            }
        }
        if (payload.total_energy_cost !== undefined && (!existing || !isEqual(existing.total_energy_cost, payload.total_energy_cost))) {
            cdrUpdateFields.total_energy_cost = payload.total_energy_cost ? (payload.total_energy_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_time !== undefined) {
            // OCPI provides total_time in hours (decimal). We store it as seconds in BigInt.
            const payloadTotalTime = BigInt(Math.round(Number(payload.total_time ?? 0) * 3600));
            if (!existing || existing.total_time !== payloadTotalTime) {
                cdrUpdateFields.total_time = payloadTotalTime;
            }
        }
        if (payload.total_time_cost !== undefined && (!existing || !isEqual(existing.total_time_cost, payload.total_time_cost))) {
            cdrUpdateFields.total_time_cost = payload.total_time_cost ? (payload.total_time_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_parking_time !== undefined) {
            // OCPI provides total_parking_time in hours (decimal). We store it as seconds in BigInt.
            const payloadTotalParkingTime = payload.total_parking_time != null
                ? BigInt(Math.round(Number(payload.total_parking_time) * 3600))
                : undefined;
            if (!existing || existing.total_parking_time !== payloadTotalParkingTime) {
                cdrUpdateFields.total_parking_time = payloadTotalParkingTime;
            }
        }
        if (payload.total_parking_cost !== undefined && (!existing || !isEqual(existing.total_parking_cost, payload.total_parking_cost))) {
            cdrUpdateFields.total_parking_cost = payload.total_parking_cost ? (payload.total_parking_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_reservation_cost !== undefined && (!existing || !isEqual(existing.total_reservation_cost, payload.total_reservation_cost))) {
            cdrUpdateFields.total_reservation_cost = payload.total_reservation_cost ? (payload.total_reservation_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.remark !== undefined && (!existing || existing.remark !== payload.remark)) {
            cdrUpdateFields.remark = payload.remark ?? null;
        }
        if (payload.invoice_reference_id !== undefined && (!existing || existing.invoice_reference_id !== payload.invoice_reference_id)) {
            cdrUpdateFields.invoice_reference_id = payload.invoice_reference_id ?? null;
        }
        if (payload.credit !== undefined && (!existing || existing.credit !== payload.credit)) {
            cdrUpdateFields.credit = payload.credit ?? null;
        }
        if (payload.credit_reference_id !== undefined && (!existing || existing.credit_reference_id !== payload.credit_reference_id)) {
            cdrUpdateFields.credit_reference_id = payload.credit_reference_id ?? null;
        }
        if (payload.remarks !== undefined && (!existing || existing.remarks !== payload.remarks)) {
            cdrUpdateFields.remarks = payload.remarks ?? null;
        }
        if (payload.last_updated !== undefined) {
            const payloadLastUpdated = new Date(payload.last_updated ?? new Date().toISOString());
            if (!existing || existing.last_updated.getTime() !== payloadLastUpdated.getTime()) {
                cdrUpdateFields.last_updated = payloadLastUpdated;
            }
        }

        return cdrUpdateFields;
    }
}

