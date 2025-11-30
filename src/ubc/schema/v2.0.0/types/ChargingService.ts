import { BecknServiceLocation } from "./Location";

// Item Attributes for ChargingService
export type BecknChargingServiceAttributes = {
    "@context": string;
    "@type": "ChargingService";
    serviceLocation: BecknServiceLocation;
    parkingType?: string;
    connectorType?: string;
    amenityFeature?: string[];
    connectorId?: string;
    socketCount?: number;
    roamingNetwork?: string;
    minPowerKW?: number;
    evseId?: string;
    reservationSupported?: boolean;
    connectorFormat?: string;
    maxPowerKW?: number;
    stationStatus?: string;
    chargingSpeed?: string;
    ocppId?: string;
    powerType?: string;
};

