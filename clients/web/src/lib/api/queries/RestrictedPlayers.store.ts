import type {OperationResult} from "@urql/core";
import {gql} from "@urql/core";
import {LiveQueryStore} from "$lib/api/core/LiveQueryStore";

enum MemberRestrictionType {
    QUEUE_BAN = "QUEUE_BAN",
    RATIFICATION_BAN = "RATIFICATION_BAN",
}

enum MemberRestrictionEventType {
    RESTRICTED = 1,
    UNRESTRICTED = 2,
}

interface MemberProfile {
    name: string;
}

interface Member {
    profile: MemberProfile;
}

export interface MemberRestriction {
    id: number;

    type: MemberRestrictionType;

    expiration: Date;

    reason: string;

    member: Member;

    manualExpiration?: Date;

    manualExpirationReason?: string;

    memberId: number;
}

export interface MemberRestrictionEvent extends MemberRestriction{
    eventType: number;
}

export interface RestrictedPlayersStoreValue {
    getActiveMemberRestrictions: MemberRestriction[];
}

export interface RestrictedPlayersSubscriptionValue {
    followRestrictedMembers: MemberRestrictionEvent;
}

export interface RestrictedPlayersStoreVariables {
}

export interface RestrictedPlayersStoreSubscriptionVariables {
}

export class RestrictedPlayersStore extends LiveQueryStore<RestrictedPlayersStoreValue, RestrictedPlayersStoreVariables, RestrictedPlayersSubscriptionValue, RestrictedPlayersStoreSubscriptionVariables> {
    protected queryString = gql<RestrictedPlayersStoreValue, RestrictedPlayersStoreVariables>`
        query {
            getActiveMemberRestrictions(type: QUEUE_BAN) {
                id
                type
                expiration
                reason
                manualExpiration
                manualExpirationReason
                member {
                    profile {
                        name
                    }
                }
                memberId
            }
        }`;

    protected subscriptionString = gql<RestrictedPlayersSubscriptionValue, RestrictedPlayersStoreSubscriptionVariables>`
        subscription {
            followRestrictedMembers {
                id
                eventType
                type
                expiration
                reason
                manualExpiration
                manualExpirationReason
                member {
                    profile {
                        name
                    }
                }
                memberId
            }
        }
    `;

    constructor() {
        super();
        this.vars = {};
        this.subscriptionVariables = {};
    }

    protected handleGqlMessage = (message: OperationResult<RestrictedPlayersSubscriptionValue, RestrictedPlayersStoreSubscriptionVariables>): void => {
        if (message?.data) {
            if (!this.currentValue.data?.getActiveMemberRestrictions) {
                console.log(this.currentValue);
                console.warn("Received subscription before query completed!");
                return;
            }

            // In the backend, we spread to create the event
            // MemberRestrictionEvent = {eventType: 1, ...MemberRestriction}
            // I don't know of a way to invert that operation, but I need to
            // here in the front end, as my store value is just an array of
            // MemberRestrictions. Any help with a slick syntax to do this below
            // operation would be appreciated ;). 
            const memberRestriction = {
                id: message.data.followRestrictedMembers.id,
                type: message.data.followRestrictedMembers.type,
                expiration: message.data.followRestrictedMembers.expiration,
                reason: message.data.followRestrictedMembers.reason,
                member: message.data.followRestrictedMembers.member,
                manualExpiration: message.data.followRestrictedMembers.manualExpiration,
                manualExpirationReason: message.data.followRestrictedMembers.manualExpirationReason,
                memberId: message.data.followRestrictedMembers.memberId,
            };

            switch (message.data.followRestrictedMembers.eventType) {
                case MemberRestrictionEventType.RESTRICTED:
                    this.currentValue.data.getActiveMemberRestrictions.push(memberRestriction);
                    break;
                case MemberRestrictionEventType.UNRESTRICTED:
                    this.currentValue.data.getActiveMemberRestrictions = this.currentValue.data.getActiveMemberRestrictions.filter(s => s.id !== memberRestriction.id);
                    break;
                default:
                    console.log("This path shouldn't be hit.");
            }

            this.pub();
        }
    };
}

export const restrictedPlayers = new RestrictedPlayersStore();
