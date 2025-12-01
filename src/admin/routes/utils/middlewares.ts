import { NextFunction, Request, Response } from "express";
import { extractTokenFromHeader, verifyToken } from "../../../utils/auth";

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);
        verifyToken(token);
        next();
    }
    catch (error) {
        next(error);
    }
};  