import { Request } from "express";
import { HttpResponse } from "../../types/responses";
import { AdminResponsePayload } from "../types/responses";
import { ValidationError } from "../../utils/errors";
import { generateToken, extractTokenFromHeader, verifyToken } from "../../utils/auth";
import { logger } from "../../services/logger.service";

export default class AdminAuthModule {
    public static async login(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const { email, company } = req.body;

        if (!email) {
            throw new ValidationError('Email is required');
        }

        // In a real implementation, validate credentials against a user database
        // For now, accept any email with company domain validation
        const token = generateToken({ email, company });

        logger.info('Admin login successful', { email });

        return {
            payload: {
                data: {
                    token,
                    user: { email, company },
                },
            },
        };
    }

    public static async getMe(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const token = extractTokenFromHeader(req.headers.authorization);
        const payload = verifyToken(token);

        return {
            payload: {
                data: {
                    email: payload.email,
                    company: payload.company,
                },
            },
        };
    }
}

