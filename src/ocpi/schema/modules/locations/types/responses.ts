import { OCPIConnector, OCPIEVSE, OCPILocation, OCPIv211Connector, OCPIv211EVSE, OCPIv211Location } from ".";
import { OCPIResponsePayload } from "../../../general/types/responses";

export type OCPILocationsResponse = OCPIResponsePayload & {
    data?: OCPILocation[],
}

export type OCPIEVSEsResponse = OCPIResponsePayload & {
    data?: OCPIEVSE[],
}

export type OCPIConnectorsResponse = OCPIResponsePayload & {
    data?: OCPIConnector[],
}

export type OCPILocationResponse = OCPIResponsePayload & {
    data?: OCPILocation,
}

export type OCPIEVSEResponse = OCPIResponsePayload & {
    data?: OCPIEVSE,
}

export type OCPIConnectorResponse = OCPIResponsePayload & {
    data?: OCPIConnector,
}


// #OCPIv2.1.1
export type OCPIv211LocationsResponse = OCPIResponsePayload & {
    data?: OCPIv211Location[],
}

export type OCPIv211EVSEsResponse = OCPIResponsePayload & {
    data?: OCPIv211EVSE[],
}

export type OCPIv211ConnectorsResponse = OCPIResponsePayload & {
    data?: OCPIv211Connector[],
}

export type OCPIv211LocationResponse = OCPIResponsePayload & {
    data?: OCPIv211Location,
}

export type OCPIv211EVSEResponse = OCPIResponsePayload & {
    data?: OCPIv211EVSE,
}

export type OCPIv211ConnectorResponse = OCPIResponsePayload & {
    data?: OCPIv211Connector,
}