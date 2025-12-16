import { FeedbackForm } from "../../../types/FeedbackForm";

export type SubmitRatingResponsePayload = {
    success: boolean;
    message?: string;
    feedbackForm?: FeedbackForm;
};

export type ExtractedOnRatingResponsePayload = {
    metadata: {
        domain: string;
    };
    payload: SubmitRatingResponsePayload;
};

