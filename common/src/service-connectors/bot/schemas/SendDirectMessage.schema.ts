import {z} from "zod";

import {MessageContentSchema} from "../types";

export const SendDirectMessage_Request = z.object({
    organizationId: z.number(),
    userId: z.string(),
    content: MessageContentSchema,
});

export const SendDirectMessage_Response = z.boolean();
