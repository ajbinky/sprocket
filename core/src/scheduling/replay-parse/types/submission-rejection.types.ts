import {Field, ObjectType} from "@nestjs/graphql";

import type {ReplaySubmissionItem} from "./submission-item.types";

export type RejectedItem = Omit<ReplaySubmissionItem, "progress">;

@ObjectType()
export class SubmissionRejection {
    @Field()
    userId: number;

    @Field()
    playerName: string;

    @Field()
    reason: string;

    @Field()
    stale: boolean;

    @Field()
    rejectedAt: string;

    rejectedItems?: RejectedItem[];
}
