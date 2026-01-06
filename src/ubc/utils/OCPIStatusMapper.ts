import { OCPIStatus } from '../../ocpi/schema/modules/locations/enums';

/**
 * Maps OCPI EVSE status to UBC connectorStatus
 * Reference: UBC spec lines 2091-2104
 * 
 * OCPI Status values:
 * - AVAILABLE: Connector is available for charging
 * - BLOCKED: Connector is blocked (not available)
 * - CHARGING: Connector is currently charging
 * - INOPERATIVE: Connector is inoperative
 * - OUTOFORDER: Connector is out of order
 * - PLANNED: Connector is planned but not yet available
 * - REMOVED: Connector has been removed
 * - RESERVED: Connector is reserved
 * - UNKNOWN: Status is unknown
 * - PREPARING: Connector is preparing for charging
 * - FINISHING: Connector is finishing charging session
 * 
 * UBC connectorStatus values (based on spec):
 * - PREPARING: Connector is being prepared/connected
 * - CONNECTED: Connector is connected to vehicle
 * - CHARGING: Charging is in progress
 * - DISCONNECTED: Connector is disconnected
 */
export class OCPIStatusMapper {
    /**
     * Maps OCPI EVSE status to UBC connectorStatus
     * @param ocpiStatus - OCPI status from EVSE table
     * @returns UBC connectorStatus string
     */
    public static mapOCPIStatusToUBCConnectorStatus(ocpiStatus: string): string {
        switch (ocpiStatus) {
            case OCPIStatus.PREPARING:
                return 'PREPARING';
            
            case OCPIStatus.CHARGING:
                return 'CHARGING';
            
            case OCPIStatus.AVAILABLE:
                // When available, connector is not connected yet
                return 'PREPARING';
            
            case OCPIStatus.RESERVED:
                // Reserved means connector is prepared/reserved for use
                return 'PREPARING';
            
            case OCPIStatus.FINISHING:
                // Finishing means charging is ending but still connected
                return 'CHARGING';
            
            case OCPIStatus.BLOCKED:
            case OCPIStatus.INOPERATIVE:
            case OCPIStatus.OUTOFORDER:
            case OCPIStatus.REMOVED:
            case OCPIStatus.PLANNED:
            case OCPIStatus.UNKNOWN:
            default:
                // For blocked, inoperative, out of order, etc., connector is not available
                // Default to PREPARING as a safe fallback
                return 'PREPARING';
        }
    }
}

