import {UseGuards} from "@nestjs/common";
import {Args, Mutation, Query, Resolver} from "@nestjs/graphql";
import {GraphQLError} from "graphql";

import {MLE_OrganizationTeam} from "$mledb";
import {EnabledFeature} from "$models";
import {FeatureCode} from "$types";

import {AuthenticatedUser} from "../../authentication/decorators";
import {GraphQLJwtAuthGuard} from "../../authentication/guards";
import {JwtAuthPayload} from "../../authentication/types";
import {MLEOrganizationTeamGuard} from "../../mledb/mledb-player/mle-organization-team.guard";
import {GameFeatureService} from "./game-feature.service";

@Resolver()
export class GameFeatureResolver {
    constructor(private readonly gameFeatureService: GameFeatureService) {}

    @Query(() => Boolean)
    @UseGuards(GraphQLJwtAuthGuard)
    async getFeatureEnabled(
        @AuthenticatedUser() user: JwtAuthPayload,
        @Args("code", {type: () => FeatureCode}) code: FeatureCode,
        @Args("gameId") gameId: number,
    ): Promise<boolean> {
        if (!user.currentOrganizationId) throw new GraphQLError(`User is not related to an organization`);
        return this.gameFeatureService.featureIsEnabled(code, gameId, user.currentOrganizationId);
    }

    @Mutation(() => EnabledFeature)
    @UseGuards(GraphQLJwtAuthGuard, MLEOrganizationTeamGuard(MLE_OrganizationTeam.MLEDB_ADMIN))
    async enableFeature(
        @AuthenticatedUser() user: JwtAuthPayload,
        @Args("code", {type: () => FeatureCode}) code: FeatureCode,
        @Args("gameId") gameId: number,
    ): Promise<EnabledFeature> {
        if (!user.currentOrganizationId) throw new GraphQLError(`User is not related to an organization`);
        return this.gameFeatureService.enableFeature(code, gameId, user.currentOrganizationId);
    }

    @Mutation(() => EnabledFeature)
    @UseGuards(GraphQLJwtAuthGuard, MLEOrganizationTeamGuard(MLE_OrganizationTeam.MLEDB_ADMIN))
    async disableFeature(
        @AuthenticatedUser() user: JwtAuthPayload,
        @Args("code", {type: () => FeatureCode}) code: FeatureCode,
        @Args("gameId") gameId: number,
    ): Promise<EnabledFeature> {
        if (!user.currentOrganizationId) throw new GraphQLError(`User is not related to an organization`);
        return this.gameFeatureService.disableFeature(code, gameId, user.currentOrganizationId);
    }
}
