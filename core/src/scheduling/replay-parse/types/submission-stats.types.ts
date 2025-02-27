import {Field, Int, ObjectType} from "@nestjs/graphql";

@ObjectType()
export class ReplaySubmissionPlayer {
    @Field(() => String)
    name: string;

    @Field(() => Int)
    goals: number;
}

@ObjectType()
export class ReplaySubmissionTeam {
    @Field(() => [ReplaySubmissionPlayer])
    players: ReplaySubmissionPlayer[];

    @Field(() => Boolean)
    won: boolean;

    @Field(() => Int)
    score: number;
}

@ObjectType()
export class ReplaySubmissionGame {
    @Field(() => [ReplaySubmissionTeam])
    teams: ReplaySubmissionTeam[];
}

@ObjectType()
export class ReplaySubmissionStats {
    @Field(() => [ReplaySubmissionGame])
    games: ReplaySubmissionGame[];
}
