import { HttpResponse } from "../../types/responses";
import { OCPIResponseStatusCode } from "../schema/general/enum";
import { OCPIResponsePayload } from "../schema/general/types/responses";

export default class OCPIResponseService {
    public static success<T>(data: T): HttpResponse<OCPIResponsePayload<T>> {
        return {
            httpStatus: 200,
            payload: {
                data: data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    static clientError<T>(data: T, statusCode: OCPIResponseStatusCode = OCPIResponseStatusCode.status_2000): HttpResponse<OCPIResponsePayload<T>> {
        return {
            httpStatus: 500,
            payload: {
                data: data,
                status_code: statusCode,
                timestamp: new Date().toISOString(),
            },
        };
    }

    static serverError<T>(data: T, statusCode: OCPIResponseStatusCode = OCPIResponseStatusCode.status_3000): HttpResponse<OCPIResponsePayload<T>> {
        return {
            httpStatus: 500,
            payload: {
                data: data,
                status_code: statusCode,
                timestamp: new Date().toISOString(),
            },
        };
    }

    static hubError<T>(data: T, statusCode: OCPIResponseStatusCode = OCPIResponseStatusCode.status_4000): HttpResponse<OCPIResponsePayload<T>> {
        return {
            httpStatus: 500,
            payload: {
                data: data,
                status_code: statusCode,
                timestamp: new Date().toISOString(),
            },
        };
    }
}