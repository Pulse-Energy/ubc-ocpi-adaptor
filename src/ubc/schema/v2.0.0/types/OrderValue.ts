import { OrderValueComponentsType } from "../enums/OrderValueComponentsType";

// OrderValue
export type BecknOrderValue = {
    currency: string;   // e.g., "INR"
    value: number;      // e.g., 100.0
};

export type BecknOrderValueComponents = {
    type: OrderValueComponentsType;
    value: number;
    currency: string;
    description: string;
};

export type BecknOrderValueResponse = {
    currency: string;
    value: number;
    components: Array<BecknOrderValueComponents>;
};
