import {Injectable, Logger} from "@nestjs/common";
import type {BallchasingPlayer, CoreEndpoint, CoreOutput} from "@sprocketbot/common";
import {BallchasingTeamSchema} from "@sprocketbot/common";
import {DataSource, IsNull, Not} from "typeorm";

import {PopulateService} from "$util";

import type {CalculateEloForMatchInput, MatchSummary, PlayerSummary} from "../../elo/elo-connector";
import {EloConnectorService, EloEndpoint, GameMode, TeamColor} from "../../elo/elo-connector";
import {Franchise} from "../../franchise/database/franchise.entity";
import type {Team} from "../../franchise/database/team.entity";
import {TeamRepository} from "../../franchise/database/team.repository";
import type {Invalidation} from "../database/invalidation.entity";
import {InvalidationRepository} from "../database/invalidation.repository";
import {MatchRepository} from "../database/match.repository";
import type {Round} from "../database/round.entity";
import {RoundRepository} from "../database/round.repository";
import {ScheduleFixture} from "../database/schedule-fixture.entity";
import type {ScheduledEvent} from "../database/scheduled-event.entity";
import type {ScrimMeta} from "../database/scrim-meta.entity";
import {PlayerStatLineStatsSchema} from "../schemas/player-stat-line.schema";

export type MatchParentResponse =
    | {
          type: "fixture";
          data: ScheduleFixture;
      }
    | {
          type: "scrim";
          data: ScrimMeta;
      }
    | {
          type: "event";
          data: ScheduledEvent;
      };

@Injectable()
export class MatchService {
    private readonly logger = new Logger(MatchService.name);

    constructor(
        private readonly matchRepository: MatchRepository,
        private readonly invalidationRepository: InvalidationRepository,
        private readonly roundRepository: RoundRepository,
        private readonly teamRepository: TeamRepository,
        private readonly dataSource: DataSource,
        private readonly popService: PopulateService,
        private readonly eloConnectorService: EloConnectorService,
    ) {}

    async getMatchParentEntity(matchId: number): Promise<MatchParentResponse> {
        const populatedMatch = await this.matchRepository.findOneOrFail({
            where: {
                id: matchId,
            },
            relations: ["matchParent", "matchParent.fixture", "matchParent.scrimMeta", "matchParent.event"],
        });

        if (populatedMatch.matchParent.fixture) {
            this.logger.debug("Populating Fixture");
            populatedMatch.matchParent.fixture.homeFranchise = await this.popService.populateOneOrFail(
                ScheduleFixture,
                populatedMatch.matchParent.fixture,
                "homeFranchise",
            );
            populatedMatch.matchParent.fixture.homeFranchise.profile = await this.popService.populateOneOrFail(
                Franchise,
                populatedMatch.matchParent.fixture.homeFranchise,
                "profile",
            );
            populatedMatch.matchParent.fixture.homeFranchiseId = populatedMatch.matchParent.fixture.homeFranchise.id;

            populatedMatch.matchParent.fixture.awayFranchise = await this.popService.populateOneOrFail(
                ScheduleFixture,
                populatedMatch.matchParent.fixture,
                "awayFranchise",
            );
            populatedMatch.matchParent.fixture.awayFranchise.profile = await this.popService.populateOneOrFail(
                Franchise,
                populatedMatch.matchParent.fixture.awayFranchise,
                "profile",
            );
            populatedMatch.matchParent.fixture.awayFranchiseId = populatedMatch.matchParent.fixture.awayFranchise.id;
            return {
                type: "fixture",
                data: populatedMatch.matchParent.fixture,
            };
        }
        if (populatedMatch.matchParent.scrimMeta)
            return {
                type: "scrim",
                data: populatedMatch.matchParent.scrimMeta,
            };
        if (populatedMatch.matchParent.event)
            return {
                type: "event",
                data: populatedMatch.matchParent.event,
            };
        throw new Error("Data type not found");
    }

    async resubmitAllMatchesAfter(startDate: Date): Promise<void> {
        this.logger.verbose(`Querying date to reprocess matches after ${startDate}`);
        const queryString = `WITH round_played_time AS (SELECT r.id,
                                  r."matchId",
                                  (r."roundStats" -> 'date')::TEXT::TIMESTAMP AS played_at
                               FROM round r)
                            SELECT "matchId",
                                   TO_TIMESTAMP(MIN(EXTRACT(EPOCH FROM played_at))) AS played_at,
                                   mp."fixtureId" IS NOT NULL AND mp."scrimMetaId" IS NULL AS is_league_match,
                                   mp."fixtureId" IS NULL AND mp."scrimMetaId" IS NULL     AS broken
                                FROM round_played_time
                                         INNER JOIN match m ON "matchId" = m.id
                                         INNER JOIN match_parent mp ON m."matchParentId" = mp.id
                                WHERE played_at > $1
                                GROUP BY "matchId", mp.id, m.id
                                HAVING COUNT(round_played_time.id) > 0
                                ORDER BY 2;`;

        interface toBeReprocessed {
            matchId: number;
            played_at: string;
            is_league_match: boolean;
        }
        const results: toBeReprocessed[] = (await this.dataSource.manager.query(queryString, [
            startDate,
        ])) as toBeReprocessed[];

        this.logger.verbose(`Got data ${JSON.stringify(results)} to reprocess matches.`);
        const sleep = async (ms: number): Promise<void> =>
            new Promise(resolve => {
                setTimeout(() => {
                    resolve();
                }, ms);
            });
        for (const r of results) {
            const payload = await this.translatePayload(r.matchId, !r.is_league_match);
            await this.eloConnectorService.createJob(EloEndpoint.CalculateEloForMatch, payload);
            await sleep(500);
        }
    }

    async getMatchReportCardWebhooks(matchId: number): Promise<CoreOutput<CoreEndpoint.GetMatchReportCardWebhooks>> {
        const match = await this.matchRepository.findOneOrFail({
            where: {id: matchId},
            relations: {
                skillGroup: {
                    profile: {
                        matchReportCardWebhook: true,
                    },
                },
                matchParent: {
                    fixture: {
                        homeFranchise: {
                            profile: {
                                matchReportCardWebhook: true,
                            },
                        },
                        awayFranchise: {
                            profile: {
                                matchReportCardWebhook: true,
                            },
                        },
                        scheduleGroup: {
                            type: {
                                organization: true,
                            },
                        },
                    },
                },
            },
        });

        if (!match.matchParent.fixture) throw new Error(`Match is not league match matchId=${matchId}`);
        return {
            skillGroupWebhook: match.skillGroup.profile.matchReportCardWebhook?.url,
            franchiseWebhooks: [
                match.matchParent.fixture.homeFranchise.profile.matchReportCardWebhook?.url,
                match.matchParent.fixture.awayFranchise.profile.matchReportCardWebhook?.url,
            ].filter(f => f) as string[],
            organizationId: match.matchParent.fixture.scheduleGroup.type.organization.id,
        };
    }

    async getFranchisesForMatch(matchId: number): Promise<{home: Franchise; away: Franchise}> {
        const match = await this.matchRepository.findOneOrFail({
            where: {
                id: matchId,
                matchParent: {
                    fixture: Not(IsNull()),
                },
            },
            relations: {
                matchParent: {
                    fixture: {
                        homeFranchise: {profile: true},
                        awayFranchise: {profile: true},
                    },
                },
            },
        });
        return {
            home: match.matchParent.fixture!.homeFranchise,
            away: match.matchParent.fixture!.awayFranchise,
        };
    }

    async getMatchInfoAndStakeholders(
        matchId: number,
    ): Promise<CoreOutput<CoreEndpoint.GetMatchInformationAndStakeholders>> {
        const match = await this.matchRepository.findOneOrFail({
            where: {
                id: matchId,
            },
            relations: {
                skillGroup: {
                    profile: true,
                },
                matchParent: {
                    fixture: {
                        homeFranchise: {
                            profile: {
                                submissionWebhook: true,
                            },
                        },
                        awayFranchise: {
                            profile: {
                                submissionWebhook: true,
                            },
                        },
                        scheduleGroup: {
                            parentGroup: {
                                type: {
                                    organization: true,
                                },
                            },
                        },
                    },
                },
                gameMode: {
                    game: true,
                },
            },
        });

        if (!match.matchParent.fixture) throw new Error(`Match is not a fixture`);

        return {
            organizationId: match.matchParent.fixture.scheduleGroup.parentGroup.type.organization.id,
            game: match.gameMode.game.title,
            gameMode: match.gameMode.description,
            skillGroup: match.skillGroup.profile.description,
            home: {
                url: match.matchParent.fixture.homeFranchise.profile.submissionWebhook?.url,
                role: match.matchParent.fixture.homeFranchise.profile.submissionDiscordRoleId,
            },
            away: {
                url: match.matchParent.fixture.awayFranchise.profile.submissionWebhook?.url,
                role: match.matchParent.fixture.awayFranchise.profile.submissionDiscordRoleId,
            },
        };
    }

    /**
     * Marks replays as NCP=true/false, and updates the associated Elo of those replays and all connected replays accordingly.
     * "Connected" replays are where replays in which one of the player's in the NCP replay has played. Since the NCP replay will have its elo affects removed,
     * all subsequent replays where those player's played need to be recalculated.
     * @param replayId The replay to mark NCP=true/false.
     * @param isNcp Whether the given replayId should be marked NCP or un-NCP.
     * @returns A string containing status of what was updated.
     */
    async markReplaysNcp(
        replayIds: number[],
        isNcp: boolean,
        winningTeamInput?: Team,
        invalidation?: Invalidation,
    ): Promise<string> {
        this.logger.verbose(
            `Begin markReplaysNcp: replayIds=${replayIds}, isNcp=${isNcp}, winningTeam=${winningTeamInput}`,
        );

        // Find the winning team and it's franchise profile, since that's where
        // team names are in Sprocket.
        const winningTeam = await this.teamRepository.findOne({
            where: {id: winningTeamInput?.id},
            relations: {franchise: {profile: true}},
        });

        if (isNcp && !winningTeam) return "Winning team must be specified if NCPing replays";

        // Make sure we are considering replayIds in chronological order
        replayIds.sort((r1, r2) => r1 - r2);

        // Gather replays
        const replayPromises = replayIds.map(async rId =>
            this.roundRepository.findOneOrFail({
                where: {
                    id: rId,
                },
                relations: {
                    teamStats: true,
                },
            }),
        );
        const replays = await Promise.all(replayPromises);

        // Set replays to NCP true/false and update winning team/color
        for (const replay of replays) {
            if (!isNcp && replay.isDummy) {
                await this.roundRepository.delete(replay.id);
            } else {
                if (!replay.teamStats.some(t => t.team?.id === winningTeam?.id)) {
                    this.logger.error(
                        `ERROR: Round ${replay.id} cannot be NCP'd. Winning team ${winningTeam?.franchise.profile.title} did not participate.`,
                    );
                    throw new Error(
                        `ERROR: Round ${replay.id} cannot be NCP'd. Winning team ${winningTeam?.franchise.profile.title} did not participate.`,
                    );
                }
                replay.invalidation = invalidation;
                await this.roundRepository.save(replay);
            }
        }

        // Magic happens here to talk to the ELO service
        const noDummies = replays.filter(rep => !rep.isDummy).map(rep => rep.id);
        await this.eloConnectorService.createJob(EloEndpoint.CalculateEloForNcp, {
            roundIds: noDummies,
            isNcp: isNcp,
        });

        const outStr = `\`${
            replayIds.length === 1 ? `replayId=${replayIds[0]}` : `replayIds=[${replayIds.join(", ")}]`
        }\` successfully marked \`ncp=${isNcp}\`, ${
            winningTeam ? `\`winningTeam=${winningTeam.franchise.profile.title}\`` : ""
        } with updated elo, and all connected replays had their elo updated.`;

        return outStr;
    }

    async translatePayload(matchId: number, isScrim: boolean): Promise<CalculateEloForMatchInput> {
        const match = await this.matchRepository.findOneOrFail({
            where: {id: matchId},
            relations: {
                rounds: {
                    teamStats: {
                        playerStats: {player: true},
                    },
                },
                gameMode: true,
            },
        });

        const payload: CalculateEloForMatchInput = {
            id: match.id,
            numGames: match.rounds.length,
            isScrim: isScrim,
            gameMode: match.gameMode.code === "RL_DOUBLES" ? GameMode.DOUBLES : GameMode.STANDARD,
            gameStats: [],
        };

        for (const round of match.rounds) {
            const team1Stats = BallchasingTeamSchema.safeParse(round.teamStats[0]);
            const team2Stats = BallchasingTeamSchema.safeParse(round.teamStats[1]);
            if (!team1Stats.success) throw new Error("Failed to convert");
            if (!team2Stats.success) throw new Error("Failed to convert");

            const team1IsOrange = team1Stats.data.color === "orange";
            const orangeScore = team1IsOrange ? team1Stats.data.stats.core.goals : team2Stats.data.stats.core.goals;
            const blueScore = team1IsOrange ? team2Stats.data.stats.core.goals : team1Stats.data.stats.core.goals;

            const team1Players = round.teamStats[0].playerStats.map(p => PlayerStatLineStatsSchema.safeParse(p.stats));
            const team2Players = round.teamStats[1].playerStats.map(p => PlayerStatLineStatsSchema.safeParse(p.stats));

            const orangePlayers: BallchasingPlayer[] = [];
            const bluePlayers: BallchasingPlayer[] = [];

            const errors: string[] = [];
            team1Players.forEach(stat => {
                if (stat.success)
                    team1IsOrange ? orangePlayers.push(stat.data.otherStats) : bluePlayers.push(stat.data.otherStats);
                else errors.push(stat.error.toString());
            });

            team2Players.forEach(stat => {
                if (stat.success)
                    team1IsOrange ? bluePlayers.push(stat.data.otherStats) : orangePlayers.push(stat.data.otherStats);
                else errors.push(stat.error.toString());
            });

            if (errors.length) {
                throw new Error("Failed to convert");
            }

            const stats = round.roundStats as {date?: string};
            let dateString = "";
            if (!stats.date) {
                this.logger.warn("No date found on round.");
            } else {
                this.logger.verbose(stats.date);
                dateString = stats.date;
            }
            const summary: MatchSummary = {
                id: round.id,
                playedAt: dateString,
                orangeWon: orangeScore > blueScore,
                scoreOrange: orangeScore,
                scoreBlue: blueScore,
                blue: round.teamStats[0].playerStats.map((p, i) =>
                    this.translatePlayerStats(p.player.id, bluePlayers[i], TeamColor.BLUE),
                ),
                orange: round.teamStats[1].playerStats.map((p, i) =>
                    this.translatePlayerStats(p.player.id, orangePlayers[i], TeamColor.ORANGE),
                ),
            };

            payload.gameStats.push(summary);
        }

        return payload;
    }

    translatePlayerStats(playerId: number, bcPlayer: BallchasingPlayer, team: TeamColor): PlayerSummary {
        return {
            id: playerId,
            name: "",
            team: team,
            mvpr: this.calculateMVPR(bcPlayer),
        } as PlayerSummary;
    }

    calculateMVPR(p: BallchasingPlayer): number {
        return p.stats.core.goals + p.stats.core.assists * 0.75 + p.stats.core.saves * 0.6 + p.stats.core.shots / 3;
    }

    /**
     * Marks a series (with either a fixture or scrim) as full_ncp=true/false, marks all associated replays as ncp=true, and updates the associated Elo of those replays and all connected replays accordingly.
     * "Connected" replays are where replays in which one of the player's in the NCP replay has played. Since the NCP replay will have its elo affects removed,
     * all subsequent replays where those player's played need to be recalculated.
     * @param seriesId The series to mark full_ncp=true/false.
     * @param isNcp Whether the given replayId should be marked NCP or un-NCP.
     * @param progressMessage A message to update with the progress of the NCP processing.
     * @param seriesType Whether the series is a fixture or scrim series, used for input validation and for difference in actions between fixtures/scrims.
     * @param winningTeam The team that should win the NCP. Required if seriesType=Fixture and isNcp=true.
     * @param numReplays The number of replays that should be in the series. Optional. Used to add dummy replays in place of replays that weren't submitted for some reason.
     * @returns A string containing a summary of the actions that took place when the processing has completed.
     */
    async markSeriesNcp(
        seriesId: number,
        isNcp: boolean,
        winningTeamId?: number,
        numReplays?: number,
    ): Promise<string> {
        this.logger.verbose(`Begin markSeriesNcp: seriesId=${seriesId}, isNcp=${isNcp}, winningTeam=${winningTeamId}`);

        // Find the winning team and it's franchise profile, since that's where
        // team names are in Sprocket.
        const winningTeam = winningTeamId
            ? await this.teamRepository.findOneOrFail({
                  where: {
                      id: winningTeamId,
                  },
                  relations: {
                      franchise: {
                          profile: true,
                      },
                  },
              })
            : undefined;
        const series = await this.matchRepository.findOneOrFail({
            where: {id: seriesId},
            relations: {
                matchParent: {
                    fixture: {
                        homeFranchise: {
                            profile: true,
                        },
                        awayFranchise: {
                            profile: true,
                        },
                    },
                    scrimMeta: true,
                },
                rounds: true,
            },
        });

        if (series.matchParent.fixture) {
            // Winning team must be specified if NCPing replays
            if (isNcp && !winningTeam) {
                throw new Error("When NCPing a series associated with a fixture, you must specify a winningTeam");
            }

            // Check to make sure the winning team played in the series/fixture
            if (
                winningTeam &&
                series.matchParent.fixture.homeFranchise.id !== winningTeam.franchise.id &&
                series.matchParent.fixture.awayFranchise.id !== winningTeam.franchise.id
            ) {
                throw new Error(
                    `The team \`${winningTeam.franchise.profile.title}\` did not play in series with id \`${series.id}\` (${series.matchParent.fixture.awayFranchise.profile.title} v. ${series.matchParent.fixture.homeFranchise.profile.title}), and therefore cannot be marked as the winner of this NCP. Cancelling process with no action taken.`,
                );
            }
        } else if (!series.matchParent.scrimMeta) {
            throw new Error(`MarkSeriesNCP called with series without a fixtureId or scrimMetaId`);
        }

        const seriesReplays: Round[] = series.rounds;

        // Add dummy replays
        let dummiesNeeded = 0;
        if (numReplays) {
            dummiesNeeded = numReplays - seriesReplays.length;
            for (let i = 0; i < dummiesNeeded; i++) {
                const dummy: Partial<Round> = {
                    isDummy: true,
                    match: series,
                    playerStats: [],
                    teamStats: [],
                    roundStats: "",
                    homeWon: false,
                };

                const result = this.roundRepository.create(dummy);
                seriesReplays.push(result);
            }
        }

        this.logger.debug("Creating invalidation");
        const invalidation = this.invalidationRepository.create({
            favorsHomeTeam: winningTeamId === series.matchParent.fixture?.homeFranchise.id,
            description: series.matchParent.fixture ? "Series NCP" : "Scrim NCP",
        });

        if (isNcp) {
            await this.invalidationRepository.save(invalidation);

            this.logger.debug("Invalidation saved, trying series");
            series.invalidation = invalidation;
            await this.matchRepository.save(series);
            this.logger.debug("Series saved with invalidation");
        }

        // Update each series replay (including any dummies) to NCP
        const replayIds = seriesReplays.map(replay => replay.id);
        this.logger.debug("Marking replays in series");
        await this.markReplaysNcp(replayIds, isNcp, winningTeam ?? undefined, invalidation);

        this.logger.verbose(`End markSeriesNcp`);

        const seriesTypeStr = series.matchParent.fixture
            ? "fixture"
            : series.matchParent.scrimMeta
            ? "scrim"
            : "unknown";
        return `\`seriesId=${seriesId}\` ${`(${seriesTypeStr})`} successfully marked \`fullNcp=${isNcp}\` with updated elo, and all connected replays had their elo updated.${
            numReplays && dummiesNeeded ? ` **${dummiesNeeded} dummy replay(s)** were added to the series.` : ""
        }`;
    }
}
