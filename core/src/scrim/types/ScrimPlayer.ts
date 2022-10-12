import {
    Field, Int, ObjectType,
} from "@nestjs/graphql";
import type {ScrimPlayer as IScrimPlayer} from "@sprocketbot/common";

@ObjectType()
export class ScrimPlayer implements IScrimPlayer {
    @Field(() => Int)
    id: number;

    @Field(() => String)
    name: string;

    @Field(() => Date)
    joinedAt: Date;

    @Field(() => Int)
    leaveAfter?: number;

    @Field(() => Boolean, {nullable: true})
    checkedIn?: boolean;

    @Field(() => String, {nullable: true})
    group?: string;
}
