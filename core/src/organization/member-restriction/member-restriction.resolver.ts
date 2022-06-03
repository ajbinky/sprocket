// import {UseGuards} from "@nestjs/common";
import {
    Args, Int, Mutation, Query, ResolveField, Resolver, Root,
} from "@nestjs/graphql";

import type {Member} from "../../database";
import {MemberRestriction, MemberRestrictionType} from "../../database";
// import {MLE_OrganizationTeam} from "../../database/mledb";
// import {MLEOrganizationTeamGuard} from "../../mledb";
import {MemberService} from "../member/member.service";
import {MemberRestrictionService} from "./member-restriction.service";

@Resolver(() => MemberRestriction)
export class MemberRestrictionResolver {
    constructor(
        private readonly memberRestrictionService: MemberRestrictionService,
        private readonly memberService: MemberService,
    ) {}

    @Query(() => [MemberRestriction])
    // @UseGuards(MLEOrganizationTeamGuard(MLE_OrganizationTeam.MLEDB_ADMIN))
    async getActiveMemberRestrictions(@Args("type", {type: () => MemberRestrictionType}) type: MemberRestrictionType): Promise<MemberRestriction[]> {
        return this.memberRestrictionService.getActiveMemberRestrictions(type);
    }

    @Mutation(() => MemberRestriction)
    async createMemberRestriction(
        @Args("type", {type: () => MemberRestrictionType}) type: MemberRestrictionType,
        @Args("expiration", {type: () => Date}) expiration: Date,
        @Args("reason") reason: string,
        @Args("memberId", {type: () => Int}) memberId: number,
    ): Promise<MemberRestriction> {
        return this.memberRestrictionService.createMemberRestriction(type, expiration, reason, memberId);
    }

    @Mutation(() => MemberRestriction)
    async manuallyExpireMemberRestriction(
        @Args("id", {type: () => Int}) id: number,
        @Args("manualExpiration", {type: () => Date}) manualExpiration: Date,
        @Args("manualExpirationReason", {type: () => Int}) manualExpirationReason: string,
    ): Promise<MemberRestriction> {
        return this.memberRestrictionService.manuallyExpireMemberRestriction(id, manualExpiration, manualExpirationReason);
    }

    @ResolveField()
    async member(@Root() memberRestriction: Partial<MemberRestriction>): Promise<Member> {
        return memberRestriction.member ?? await this.memberService.getMemberById(memberRestriction.memberId!);
    }
}
