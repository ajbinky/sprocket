import {forwardRef, Inject, Injectable} from "@nestjs/common";
import type {CoreEndpoint, CoreOutput} from "@sprocketbot/common";

import {MledbPlayerService} from "../../mledb";

@Injectable()
export class FranchiseService {
    constructor(
        @Inject(forwardRef(() => MledbPlayerService))
        private readonly mledbPlayerService: MledbPlayerService,
    ) {}

    async getPlayerFranchises(userId: number): Promise<CoreOutput<CoreEndpoint.GetPlayerFranchises>> {
        const mlePlayer = await this.mledbPlayerService.getMlePlayerBySprocketUser(userId);

        const playerId = mlePlayer.id;

        const team = await this.mledbPlayerService.getPlayerFranchise(playerId);
        const isCaptain = await this.mledbPlayerService.playerIsCaptain(playerId);

        const staffPositions: Array<{id: number; name: string}> = [];

        if (team.franchiseManagerId === playerId) {
            staffPositions.push({id: 0, name: "FM"});
        }
        if (team.generalManagerId === playerId) {
            staffPositions.push({id: 0, name: "GM"});
        }
        if (team.doublesAssistantGeneralManagerId === playerId || team.standardAssistantGeneralManagerId === playerId) {
            staffPositions.push({id: 0, name: "AGM"});
        }
        if (isCaptain) {
            staffPositions.push({id: 0, name: "CAP"});
        }

        return [
            {
                id: 0,
                name: team.name,
                staffPositions: staffPositions,
            },
        ];
    }
}
