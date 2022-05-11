import {Field, ObjectType} from "@nestjs/graphql";
import {
    Column, Entity, JoinColumn, ManyToOne, OneToOne,
} from "typeorm";

import {BaseModel} from "../../base-model";
import {Member} from "../member/member.model";
import {MemberRestrictionType} from "./member_restriction_type.enum";

@Entity({schema: "sprocket"})
@ObjectType()
export class MemberRestriction extends BaseModel {
    @Column({
        type: "enum",
        enum: MemberRestrictionType,
    })
    @Field(() => MemberRestrictionType)
    type: MemberRestrictionType;

    @Column()
    @Field(() => Date)
    expiration: Date;

    @Column({nullable: true})
    @Field(() => Date, {nullable: true})
    manualExpiration?: Date;

    @Column({nullable: true})
    @Field({nullable: true})
    manualExpirationReason?: string;

    @ManyToOne(() => Member, m => m.restrictions)
    @JoinColumn()
    @Field(() => Member)
    member: Member;

    @Column()
    @Field()
    memberId: number;
}
