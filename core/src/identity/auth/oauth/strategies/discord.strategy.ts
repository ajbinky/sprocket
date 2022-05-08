import {Injectable, Logger} from "@nestjs/common";
import {PassportStrategy} from "@nestjs/passport";
import {readFileSync} from "fs";
import type {GuildInfo, Profile} from "passport-discord";
import {Strategy} from "passport-discord";
import type {IrrelevantFields, UserAuthenticationAccount, UserProfile,} from "src/database";
import {UserAuthenticationAccountType} from "src/database";
import {User} from "src/database/identity/user/user.model";
import {UserService} from "src/identity/user/user.service";
import {config} from "src/util/config";
import {AnalyticsEndpoint, AnalyticsService} from "@sprocketbot/common";

export type Done = (err: string, user: User) => void;
const mleGuildId = "172404472637685760";

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, "discord") {

    private readonly logger = new Logger(DiscordStrategy.name)

    constructor(private readonly userService: UserService,
                private readonly analyticsService: AnalyticsService) {
        super({
            clientID: config.auth.discordClientId,
            clientSecret: readFileSync("./secret/discord-secret.txt").toString(),
            callbackURL: config.auth.discordCallbackURL,
            scope: ["identify", "email", "guilds", "guilds.members.read"],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: Done,
    ): Promise<User | undefined> {

        const guilds: GuildInfo[] = profile.guilds as GuildInfo[];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const mleGuild: GuildInfo | undefined = guilds.find(guild => guild.id === mleGuildId);

        let user = new User();
        if (!mleGuild) {
            // This user is not in MLE, abort.
            return user;
        }

        // First, check if the user already exists
        const queryResult = await this.userService.getUsers({where: {email: profile.email as string}});

        // If no users returned from query, create a new one
        if (queryResult.length === 0) {
            const userProfile: Omit<UserProfile, IrrelevantFields | "id" | "user"> = {
                email: profile.email as string,
                displayName: profile.username as string,
            };

            const authAcct: Omit<UserAuthenticationAccount, IrrelevantFields | "id" | "user"> = {
                accountType: UserAuthenticationAccountType.DISCORD,
                accountId: profile.id as string,
                oauthToken: accessToken,
            };
            user = await this.userService.createUser(userProfile, [authAcct]);
            this.analyticsService.send(AnalyticsEndpoint.Analytics, {
                name: "SprocketAccountImported",
                tags: [
                    ['source', "MLEDB"],
                ],
                strings: [
                    ['account_id', profile.id],
                    ['displayname', profile.username]
                ]
            })
                .then(() => this.logger.log("Account Import Recorded via Analytics"))
                .catch(this.logger.error.bind(this.logger))
        } else {
            // Else, return the one we found
            user = queryResult[0];
            const authAccounts = await this.userService.getUserAuthenticationAccountsForUser(user.id);
            const discordAccount = authAccounts.find(obj => obj.accountType === UserAuthenticationAccountType.DISCORD);
            if (!discordAccount) {
                const authAcct: Omit<UserAuthenticationAccount, IrrelevantFields | "id" | "user"> = {
                    accountType: UserAuthenticationAccountType.DISCORD,
                    accountId: profile.id as string,
                    oauthToken: accessToken,
                };
                user = await this.userService.addAuthenticationAccounts(user.id, [authAcct]);
            }
        }

        done("", user);
        return user;
    }
}
