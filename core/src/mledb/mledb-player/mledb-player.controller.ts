import {
    Controller, forwardRef, Inject,
} from "@nestjs/common";
import {MessagePattern, Payload} from "@nestjs/microservices";
import type {
    CoreOutput,
} from "@sprocketbot/common";
import {
    CoreEndpoint, CoreSchemas,
} from "@sprocketbot/common";

import {MLE_Platform} from "../../database/mledb";
import {GameSkillGroupService} from "../../franchise";
import {MledbPlayerService} from "./mledb-player.service";

const isMlePlatform = (platformCode: string): platformCode is MLE_Platform => Object.values(MLE_Platform).includes(platformCode as MLE_Platform);

@Controller("mledb-player")
export class MledbPlayerController {
    constructor(
        private readonly mledbPlayerService: MledbPlayerService,
        @Inject(forwardRef(() => GameSkillGroupService))
        private readonly skillGroupService: GameSkillGroupService,
    ) {}

    @MessagePattern(CoreEndpoint.GetPlayerByPlatformId)
    async getPlayerByPlatformId(@Payload() payload: unknown): Promise<CoreOutput<CoreEndpoint.GetPlayerByPlatformId>> {
        const {platform, platformId} = CoreSchemas.GetPlayerByPlatformId.input.parse(payload);

        if (!isMlePlatform(platform)) {
            throw new Error(`platformCode must be one of (${Object.values(MLE_Platform)}) (found ${platform})`);
        }

        const player = await this.mledbPlayerService.getPlayerByPlatformId(platform, platformId);
        const skillGroup = await this.skillGroupService.getGameSkillGroupByMLEDBLeague(player.league);

        // All MLE players should have a discordId
        if (!player.discordId) {
            throw new Error(`Player ${player.id} is missing a discordId`);
        }

        return {
            id: player.id,
            discordId: player.discordId,
            skillGroupId: skillGroup.id,
            franchise: {
                name: player.teamName,
            },
        };
    }

    @MessagePattern(CoreEndpoint.GetPlayersByPlatformIds)
    async getPlayersByPlatformIds(@Payload() payload: unknown): Promise<CoreOutput<CoreEndpoint.GetPlayersByPlatformIds>> {
        const platformIds = CoreSchemas.GetPlayersByPlatformIds.input.parse(payload);
        const platformIdsResponse = await Promise.allSettled(platformIds.map(async d => this.getPlayerByPlatformId(d)));

        if (platformIdsResponse.every(r => r.status === "fulfilled")) {
            return platformIdsResponse.map(r => (r as PromiseFulfilledResult<CoreOutput<CoreEndpoint.GetPlayerByPlatformId>>).value);
        } else {
            // Build up a custom error response containing the list of failed platforms + IDs.
            var failedPlatforms: string[] = [];

            platformIdsResponse.forEach((r,i) => {
                if (r.status === "rejected") {
                    failedPlatforms.push(`${platformIds[i].platform}: ${platformIds[i].platformId}`);
                }
            });

            throw new Error(`Could not find players associated with the following platforms: ${failedPlatforms.join(", ")}`);
        }
    }
}
