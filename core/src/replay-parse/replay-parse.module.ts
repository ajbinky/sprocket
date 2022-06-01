import {Module} from "@nestjs/common";
import {
    CeleryModule, EventsModule, MatchmakingModule, MinioModule, RedisModule,
} from "@sprocketbot/common";
import {PubSub} from "apollo-server-express";

import {DatabaseModule} from "../database";
import {ScrimModule} from "../scrim";
import {ReplayParsePubSub} from "./replay-parse.constants";
import {ReplayParseResolver} from "./replay-parse.resolver";
import {ReplayParseService} from "./replay-parse.service";
import {ReplayParseSubscriber} from "./replay-parse.subscriber";
import {ReplayRatificationResolver} from "./replay-ratification/replay-ratification.resolver";
import {ReplaySubmissionService} from "./replay-submission";

@Module({
    imports: [
        CeleryModule,
        MinioModule,
        RedisModule,
        MatchmakingModule,
        ScrimModule,
        EventsModule,
        DatabaseModule,
    ],
    providers: [
        ReplayParseSubscriber,
        ReplayParseResolver,
        ReplayParseService,
        {
            provide: ReplayParsePubSub,
            useValue: new PubSub(),
        },
        ReplayRatificationResolver,
        ReplaySubmissionService,
    ],
})
export class ReplayParseModule {
}
