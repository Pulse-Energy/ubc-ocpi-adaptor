import { OCPIRole } from "../../../general/enum";
import CountryCode from "../../../general/enum/country-codes";
import { URL } from "../../../general/types";
import { OCPIBusinessDetailsClass } from "../../locations/types";


// 7.4.1
export type OCPICredentialsRoleClass = {
    role: OCPIRole
    business_details: OCPIBusinessDetailsClass
    party_id: string
    country_code: CountryCode
}

// 7.3.1
export type OCPICredentials = {
    token: string
    url: URL
    roles: OCPICredentialsRoleClass[]
}

// #OCPIv2.1.1
// 7.2.1
export type OCPIv211Credentials = {
    token: string
    url: URL
    business_details: OCPIBusinessDetailsClass
    party_id: string
    country_code: CountryCode
}