import {Injectable, Logger} from "@nestjs/common";
import type {Scrim} from "@sprocketbot/common";
import {
    BotEndpoint,
    BotService,
    ButtonComponentStyle,
    ComponentType,
    config,
    CoreEndpoint,
    CoreService,
    MatchmakingEndpoint,
    MatchmakingService,
    ResponseStatus,
} from "@sprocketbot/common";

@Injectable()
export class ScrimService {
    private readonly logger = new Logger(ScrimService.name);

    constructor(
        private readonly botService: BotService,
        private readonly coreService: CoreService,
        private readonly matchmakingService: MatchmakingService,
    ) {}

    async sendNotifications(scrim: Scrim): Promise<void> {
        const organizationBrandingResult = await this.coreService.send(CoreEndpoint.GetOrganizationBranding, {id: scrim.organizationId});
        if (organizationBrandingResult.status === ResponseStatus.ERROR) throw organizationBrandingResult.error;

        await Promise.all(scrim.players.map(async p => {
            const userResult = await this.coreService.send(CoreEndpoint.GetDiscordIdByUser, p.id);
            if (userResult.status === ResponseStatus.ERROR) throw userResult.error;
            if (!userResult.data) return;

            await this.botService.send(BotEndpoint.SendDirectMessage, {
                userId: userResult.data,
                content: {
                    embeds: [ {
                        title: "Your scrim has popped!",
                        description: `Hey, ${p.name}! Your ${organizationBrandingResult.data.name} scrim just popped. Check in [here](${config.web.url}/scrims) to avoid being queue banned.`,
                        author: {
                            name: `${organizationBrandingResult.data.name} Scrims`,
                        },
                        footer: {
                            text: organizationBrandingResult.data.name,
                        },
                        timestamp: Date.now(),
                    } ],
                    components: [ {
                        type: ComponentType.ACTION_ROW,
                        components: [
                            {
                                type: ComponentType.BUTTON,
                                style: ButtonComponentStyle.LINK,
                                label: "Check in here!",
                                url: `${config.web.url}/scrims`,
                            },
                        ],
                    } ],
                },
                brandingOptions: {
                    organizationId: scrim.organizationId,
                    options: {
                        author: {
                            icon: true,
                        },
                        color: true,
                        thumbnail: true,
                        footer: {
                            icon: true,
                        },
                    },
                },
            });
        }));
    }

    async sendReportCard(scrim: Scrim): Promise<void> {
        // TODO: This!
        const mleScrimId = 24242;

        const reportCard = await this.coreService.send(CoreEndpoint.GenerateReportCard, {mleScrimId});
        if (reportCard.status !== ResponseStatus.SUCCESS) { this.logger.error(`Could not generate report card for mleScrimId=${mleScrimId}`);return }
        
        await this.botService.send(BotEndpoint.SendGuildTextMessage, {
            channelId: "866420216653414400",
            content: {
                embeds: [ {
                    title: "Scrim Results",
                    image: {
                        url: "attachment://card.png",
                    },
                    timestamp: Date.now(),
                } ],
                attachments: [ {name: "card.png", url: `minio:${config.minio.bucketNames.image_generation}/${reportCard.data}.png`} ],
            },
            brandingOptions: {
                organizationId: scrim.organizationId,
                options: {
                    color: true,
                    footer: {
                        icon: true,
                        text: true,
                    },
                },
            },
        });
    }

    async getScrim(scrimId: string): Promise<Scrim | null> {
        const result = await this.matchmakingService.send(MatchmakingEndpoint.GetScrim, scrimId);
        if (result.status === ResponseStatus.SUCCESS) {
            return result.data;
        }
        throw result.error;
    }
}
