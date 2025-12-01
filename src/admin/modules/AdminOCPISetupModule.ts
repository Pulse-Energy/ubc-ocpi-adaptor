import { Request } from "express";
import { HttpResponse } from "../../types/responses";
import { AdminResponsePayload } from "../types/responses";
import { ValidationError } from "../../utils/errors";
import OCPIRegistrationService from "../../services/ocpi-registration.service";

export default class AdminOCPISetupModule {
    public static async registerWithCPO(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const { registrationToken, cpoUrl } = req.body;

        if (!registrationToken || !cpoUrl) {
            throw new ValidationError('Registration token and CPO URL are required');
        }

        await OCPIRegistrationService.registerWithCPO(registrationToken, cpoUrl);

        return {
            payload: {
                data: {
                    success: true,
                    message: 'OCPI registration successful',
                },
            },
        };
    }

    public static async getRegistrationStatus(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const { cpoId } = req.query;

        if (!cpoId || typeof cpoId !== 'string') {
            throw new ValidationError('CPO ID is required');
        }

        const status = await OCPIRegistrationService.getRegistrationStatus(cpoId);


        return {
            payload: {
                data: status,
            },
        };
    }
}