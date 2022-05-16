import {Injectable} from "@nestjs/common";
import type {GraphQLExecutionContext} from "@nestjs/graphql";
import type {Scrim} from "@sprocketbot/common";
import {GraphQLError} from "graphql";

import {PlayerGuard, PlayerService} from "../franchise";
import type {GameAndOrganization} from "../franchise/player/player.types";
import {GameModeService} from "../game";
import type {UserPayload} from "../identity";
import {ScrimService} from "./scrim.service";
import type {CreateScrimInput} from "./types";

@Injectable()
export class CreateScrimPlayerGuard extends PlayerGuard {
    constructor(
        private readonly gameModeService: GameModeService,
        readonly playerService: PlayerService,
    ) { super() }

    async getGameAndOrganization(ctx: GraphQLExecutionContext, userPayload: UserPayload): Promise<GameAndOrganization> {
        if (!userPayload.currentOrganizationId) throw new Error("User is not connected to an organization");
        const {data: {settings: {gameModeId} } } = ctx.getArgs<{data: CreateScrimInput;}>();

        const gameMode = await this.gameModeService.getGameModeById(gameModeId, {relations: ["game"] });

        return {
            gameId: gameMode.game.id,
            organizationId: userPayload.currentOrganizationId,
        };
    }
}

@Injectable()
export class JoinScrimPlayerGuard extends PlayerGuard {
    constructor(
        private readonly scrimService: ScrimService,
        private readonly gameModeService: GameModeService,
        readonly playerService: PlayerService,
    ) { super() }

    async getGameAndOrganization(ctx: GraphQLExecutionContext): Promise<GameAndOrganization> {
        const {scrimId} = ctx.getArgs<{scrimId: string;}>();
        const scrim = await this.scrimService.getScrimById(scrimId).catch(() => null);
        if (!scrim) throw new GraphQLError("Scrim does not exist");

        const gameMode = await this.gameModeService.getGameModeById(scrim.gameMode.id);

        return {
            gameId: gameMode.gameId,
            organizationId: scrim.organizationId,
        };
    }
}

@Injectable()
/**
 * This guard passes if the player making the request is in the specified scrim
 */
export class ScrimResolverPlayerGuard extends PlayerGuard {
    constructor(
        private readonly gameModeService: GameModeService,
        readonly playerService: PlayerService,
    ) { super() }

    async getGameAndOrganization(ctx: GraphQLExecutionContext, userPayload: UserPayload): Promise<GameAndOrganization> {
        if (!userPayload.currentOrganizationId) throw new Error("User is not connected to an organization");
        
        const scrim = ctx.getRoot<Scrim>();
        const gameMode = await this.gameModeService.getGameModeById(scrim.gameMode.id);

        if (!scrim.players.some(p => p.id === userPayload.userId)) throw new Error("Player is not in the scrim");

        return {
            gameId: gameMode.gameId,
            organizationId: scrim.organizationId,
        };
    }
}
