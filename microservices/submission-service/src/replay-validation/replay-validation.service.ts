import {Injectable, Logger} from "@nestjs/common";
import type {
    BallchasingResponse,
    GetPlayerSuccessResponse,
    MatchReplaySubmission,
    ReplaySubmission,
    ScrimReplaySubmission,
    VerifySubmissionUniquenessPlayerData,
} from "@sprocketbot/common";
import {
    config,
    CoreEndpoint,
    CoreService,
    MatchmakingEndpoint,
    MatchmakingService,
    MinioService,
    readToString,
    ReplaySubmissionType,
    ResponseStatus,
} from "@sprocketbot/common";
import {isEqual} from "lodash";

import type {ValidationError, ValidationResult} from "./types/validation-result";
import {sortIds} from "./utils";

@Injectable()
export class ReplayValidationService {
    private readonly logger: Logger = new Logger(ReplayValidationService.name);

    constructor(
        private readonly coreService: CoreService,
        private readonly matchmakingService: MatchmakingService,
        private readonly minioService: MinioService,
    ) {}

    async validate(submission: ReplaySubmission): Promise<ValidationResult> {
        if (submission.type === ReplaySubmissionType.SCRIM) {
            return this.validateScrimSubmission(submission);
        }
        return this.validateMatchSubmission(submission);
    }

    private async validateScrimSubmission(submission: ScrimReplaySubmission): Promise<ValidationResult> {
        const scrimResponse = await this.matchmakingService.send(MatchmakingEndpoint.GetScrim, submission.scrimId);
        if (scrimResponse.status === ResponseStatus.ERROR) throw scrimResponse.error;
        if (!scrimResponse.data) throw new Error("Scrim not found");
        
        const scrim = scrimResponse.data;

        // ========================================
        // Validate number of games
        // ========================================
        if (!scrim.games) {
            throw new Error(`Unable to validate gameCount for scrim ${scrim.id} because it has no games`);
        }

        const submissionGameCount = submission.items.length;
        const scrimGameCount = scrim.games.length;

        if (submissionGameCount !== scrimGameCount) {
            return {
                valid: false,
                errors: [ {
                    error: `Incorrect number of replays submitted, expected ${scrimGameCount} but found ${submissionGameCount}`,
                } ],
            };
        }

        const gameCount = submissionGameCount;

        const progressErrors = submission.items.reduce<ValidationError[]>((r, v) => {
            if (v.progress?.error) {
                this.logger.error(`Error in submission found, scrim=${scrim.id} submissionId=${scrim.submissionId}\n${v.progress.error}`);
                r.push({
                    error: `Error encountered while parsing file ${v.originalFilename}`,
                });
            }
            return r;
        }, []);
        if (progressErrors.length) {
            return {
                valid: false,
                errors: progressErrors,
            };
        }

        // ========================================
        // Validate the correct players played
        // ========================================
        // All items should have an outputPath
        if (!submission.items.every(i => i.outputPath)) {
            this.logger.error(`Unable to validate submission with missing outputPath, scrim=${scrim.id} submissionId=${scrim.submissionId}`);
            return {
                valid: false,
                errors: [],
            };
        }

        // We should have stats for every game
        const stats = await Promise.all(submission.items.map(async i => this.getStats(i.outputPath!)));
        if (stats.length !== gameCount) {
            this.logger.error(`Unable to validate submission missing stats, scrim=${scrim.id} submissionId=${scrim.submissionId}`);
            return {
                valid: false,
                errors: [ {error: "The submission is missing stats. Please contact support."} ],
            };
        }

        if (!this.submissionItemsUnique(stats)) {
            this.logger.error(`Replays are not unique submissionId=${submission.id}`);
            return {
                valid: false,
                errors: [ {error: `Please verify you are uploading the correct replays. Two or more of the same replay have been uploaded.`} ],
            };
        }

        const gameResult = await this.coreService.send(CoreEndpoint.GetGameByGameMode, {gameModeId: scrim.gameModeId});
        if (gameResult.status === ResponseStatus.ERROR) {
            this.logger.error(`Unable to get game gameMode=${scrim.gameModeId}`);
            return {
                valid: false,
                errors: [ {error: `Failed to find associated game. Please contact support.`} ],
            };
        }

        // Get platformIds from stats
        // Don't send the same request for multiple players
        const uniqueBallchasingPlayerIds = Array.from(new Set(stats.flatMap(s => [s.blue, s.orange].flatMap(t => t.players.flatMap(p => ({
            name: p.name,
            platform: p.id.platform.toUpperCase(),
            id: p.id.id,
        }))))));
        
        // Look up players by their platformIds
        const playersResponse = await this.coreService.send(CoreEndpoint.GetPlayersByPlatformIds, uniqueBallchasingPlayerIds.map(bId => ({
            gameId: gameResult.data.id,
            platform: bId.platform,
            platformId: bId.id,
        })));
        if (playersResponse.status === ResponseStatus.ERROR) {
            this.logger.error(`Unable to validate submission, couldn't find all players by their platformIds`, playersResponse.error);
            return {
                valid: false,
                errors: [ {error: "Failed to find all players by their platform Ids. Please contact support."} ],
            };
        }
        
        const playerErrors: string[] = [];
        for (const player of playersResponse.data) {
            if (!player.success) {
                playerErrors.push(uniqueBallchasingPlayerIds.find(bcPlayer => bcPlayer.platform === player.request.platform && bcPlayer.id === player.request.platformId)!.name);
            }
        }

        if (playerErrors.length) return {
            valid: false,
            errors: [
                {
                    error: `One or more players played on an unreported account: ${playerErrors.join(", ")}`,
                },
            ],
        };

        const players = playersResponse.data as GetPlayerSuccessResponse[];

        for (const stat of stats) {
            const replayUniquenessResult = await this.coreService.send(CoreEndpoint.VerifySubmissionUniqueness, {
                data: [
                    ...stat.blue.players.map((p): VerifySubmissionUniquenessPlayerData => ({
                        player_id: players.find(player => player.request.platform === p.id.platform.toUpperCase() && player.request.platformId === p.id.id)!.data.id,
                        shots: p.stats.core.shots,
                        saves: p.stats.core.saves,
                        goals: p.stats.core.goals,
                        assists: p.stats.core.assists,
                        color: "BLUE",
                    })),
                    ...stat.orange.players.map((p): VerifySubmissionUniquenessPlayerData => ({
                        player_id: players.find(player => player.request.platform === p.id.platform.toUpperCase() && player.request.platformId === p.id.id)!.data.id,
                        shots: p.stats.core.shots,
                        saves: p.stats.core.saves,
                        goals: p.stats.core.goals,
                        assists: p.stats.core.assists,
                        color: "ORANGE",
                    })),
                ].sort((a, b) => a.player_id - b.player_id),
                playedAt: new Date(stat.date),
            });
            if (replayUniquenessResult.status === ResponseStatus.ERROR) {
                this.logger.error(`Unable to verify uniqueness of submission submissionId=${submission.id}`);
                return {
                    valid: false,
                    errors: [ {error: `Failed to verify if replays are unique. Please contact support.`} ],
                };
            }
    
            if (!replayUniquenessResult.data) {
                this.logger.error(`Replays are not unique submissionId=${submission.id}`);
                return {
                    valid: false,
                    errors: [ {error: `Replays do not appear to be unique; please verify you are submitting the correct replays. Please contact support if you believe this is an error.`} ],
                };
            }
        }

        // Get 3D array of scrim player ids
        const scrimPlayerIds = scrim.games.map(g => g.teams.map(t => t.players.map(p => p.id)));

        // Get 3D array of submission player ids
        const submissionUserIds = stats.map(s => [s.blue, s.orange].map(t => t.players.map(({id}) => {
            const user = players.find(p => p.request.platform === id.platform.toUpperCase() && p.request.platformId === id.id)!;
            return user.data.userId;
        })));

        // Sort IDs so that they are in the same order ready to compare
        const sortedScrimPlayerIds = sortIds(scrimPlayerIds);
        const sortedSubmissionUserIds = sortIds(submissionUserIds);

        const expectedMatchups = Array.from(sortedScrimPlayerIds);

        // For each game, make sure the players were on correct teams
        for (let g = 0; g < gameCount; g++) {
            const submissionGame = sortedSubmissionUserIds[g];
            let matchupIndex: number;

            if (expectedMatchups.some(expectedMatchup => isEqual(submissionGame, expectedMatchup))) {
                matchupIndex = expectedMatchups.findIndex(expectedMatchup => isEqual(submissionGame, expectedMatchup));
                expectedMatchups.splice(matchupIndex, 1);
            } else {
                return {
                    valid: false,
                    errors: [ {
                        error: "Mismatched player",
                        gameIndex: g,
                    } ],
                };
            }

            const scrimGame = sortedScrimPlayerIds[matchupIndex];
            
            for (let t = 0; t < scrim.settings.teamCount; t++) {
                const scrimTeam = scrimGame[t];
                const submissionTeam = submissionGame[t];
                if (scrimTeam.length !== submissionTeam.length) {
                    return {
                        valid: false,
                        errors: [ {
                            error: "Invalid team size",
                            gameIndex: g,
                            teamIndex: t,
                        } ],
                    };
                }
            }
            if (scrimGame.length !== submissionGame.length) {
                return {
                    valid: false,
                    errors: [ {
                        error: "Invalid team count",
                        gameIndex: g,
                    } ],
                };
            }
        }

        // ========================================
        // Validate players are in the correct skill group if the scrim is competitive
        // ========================================
        if (scrim.settings.competitive) for (const player of players) {
            if (player.data.skillGroupId !== scrim.skillGroupId) {
                return {
                    valid: false,
                    errors: [ {
                        error: "One of the players isn't in the correct skill group",
                    } ],
                };
            }
        }

        // ========================================
        // Submission is valid
        // ========================================
        return {
            valid: true,
        };
    }

    private async getStats(outputPath: string): Promise<BallchasingResponse> {
        const r = await this.minioService.get(config.minio.bucketNames.replays, outputPath);
        const stats = await readToString(r);
        return JSON.parse(stats).data as BallchasingResponse;
    }

    private async validateMatchSubmission(submission: MatchReplaySubmission): Promise<ValidationResult> {
        const matchResult = await this.coreService.send(CoreEndpoint.GetMatchById, {matchId: submission.matchId});
        if (matchResult.status === ResponseStatus.ERROR) throw matchResult.error;
        const match = matchResult.data;

        const gameResult = await this.coreService.send(CoreEndpoint.GetGameByGameMode, {gameModeId: match.gameModeId});
        if (gameResult.status === ResponseStatus.ERROR) {
            this.logger.error(`Unable to get game gameMode=${match.gameModeId}`);
            return {
                valid: false,
                errors: [ {error: `Failed to find associated game. Please contact support.`} ],
            };
        }

        const homeName = match.homeFranchise!.name;
        const awayName = match.awayFranchise!.name;

        const errors: ValidationError[] = [];

        if (!submission.items.every(i => i.progress?.result?.data)) {
            return {
                valid: false,
                errors: [ {error: "Incomplete Replay Found, please wait for submission to complete"} ],
            };
        }

        const uniqueBallchasingPlayerIds = Array.from(new Set(submission.items.flatMap(s => [s.progress!.result!.data.blue, s.progress!.result!.data.orange].flatMap(t => t.players.flatMap(p => ({
            name: p.name,
            platform: p.id.platform.toUpperCase(),
            id: p.id.id,
        }))))));
        
        // Look up players by their platformIds
        const playersResponse = await this.coreService.send(CoreEndpoint.GetPlayersByPlatformIds, uniqueBallchasingPlayerIds.map(bId => ({
            gameId: gameResult.data.id,
            platform: bId.platform,
            platformId: bId.id,
        })));
        if (playersResponse.status === ResponseStatus.ERROR) {
            this.logger.error(`Unable to validate submission, couldn't find all players by their platformIds`, playersResponse.error);
            return {
                valid: false,
                errors: [ {error: "Failed to find all players by their platform Ids. Please contact support."} ],
            };
        }
        
        const playerErrors: string[] = [];
        for (const player of playersResponse.data) {
            if (!player.success) {
                playerErrors.push(uniqueBallchasingPlayerIds.find(bcPlayer => bcPlayer.platform === player.request.platform && bcPlayer.id === player.request.platformId)!.name);
            }
        }

        if (playerErrors.length) return {
            valid: false,
            errors: [
                {
                    error: `One or more players played on an unreported account: ${playerErrors.join(", ")}`,
                },
            ],
        };

        const players = playersResponse.data as GetPlayerSuccessResponse[];

        if (!this.submissionItemsUnique(submission.items.map(i => i.progress!.result!.data))) {
            this.logger.error(`Replays are not unique submissionId=${submission.id}`);
            return {
                valid: false,
                errors: [ {error: `Please verify you are uploading the correct replays. Two or more of the same replay have been uploaded.`} ],
            };
        }

        for (const item of submission.items) {
            const blueBcPlayers = item.progress!.result!.data.blue.players;
            const orangeBcPlayers = item.progress!.result!.data.orange.players;

            try {
                const bluePlayers = blueBcPlayers.map(bcp => ({
                    ...players.find(p => p.request.platform === bcp.id.platform.toUpperCase() && p.request.platformId === bcp.id.id)!.data,
                    bcp,
                }));
                const orangePlayers = orangeBcPlayers.map(bcp => ({
                    ...players.find(p => p.request.platform === bcp.id.platform.toUpperCase() && p.request.platformId === bcp.id.id)!.data,
                    bcp,
                }));
                    
                const replayUniquenessResult = await this.coreService.send(CoreEndpoint.VerifySubmissionUniqueness, {
                    data: [
                        ...bluePlayers.map((p): VerifySubmissionUniquenessPlayerData => ({
                            player_id: p.id,
                            shots: p.bcp.stats.core.shots,
                            saves: p.bcp.stats.core.saves,
                            goals: p.bcp.stats.core.goals,
                            assists: p.bcp.stats.core.assists,
                            color: "BLUE",
                        })),
                        ...orangePlayers.map((p): VerifySubmissionUniquenessPlayerData => ({
                            player_id: p.id,
                            shots: p.bcp.stats.core.shots,
                            saves: p.bcp.stats.core.saves,
                            goals: p.bcp.stats.core.goals,
                            assists: p.bcp.stats.core.assists,
                            color: "ORANGE",
                        })),
                    ].sort((a, b) => a.player_id - b.player_id),
                    playedAt: new Date(item.progress!.result!.data.date),
                });
                if (replayUniquenessResult.status === ResponseStatus.ERROR) {
                    this.logger.error(`Unable to verify uniqueness of submission submissionId=${submission.id}`);
                    return {
                        valid: false,
                        errors: [ {error: `Failed to verify if replays are unique. Please contact support.`} ],
                    };
                }
        
                if (!replayUniquenessResult.data) {
                    this.logger.error(`Replays are not unique submissionId=${submission.id}`);
                    return {
                        valid: false,
                        errors: [ {error: `Replays do not appear to be unique; please verify you are submitting the correct replays. Please contact support if you believe this is an error.`} ],
                    };
                }

                const blueTeam = bluePlayers[0].franchise.name;
                const orangeTeam = orangePlayers[0].franchise.name;

                if (blueTeam === orangeTeam) {
                    errors.push({
                        error: `Players from a single franchise found on both teams in replay ${item.originalFilename}`,
                    });
                }

                if (!bluePlayers.every(bp => bp.franchise.name === blueTeam)) {
                    errors.push({
                        error: `Multiple franchises found for blue team in replay ${item.originalFilename}`,

                    });
                }
                if (!orangePlayers.every(op => op.franchise.name === orangeTeam)) {
                    errors.push({
                        error: `Multiple franchises found for orange team in replay ${item.originalFilename}`,
                    });
                }

                if (![blueTeam, orangeTeam].includes(awayName)) {
                    errors.push({
                        error: `Away team ${awayName} not found in replay ${item.originalFilename}. (Found ${blueTeam} and ${orangeTeam})`,
                    });
                }
                if (![blueTeam, orangeTeam].includes(homeName)) {
                    errors.push({
                        error: `Home team ${homeName} not found in replay ${item.originalFilename}. (Found ${blueTeam} and ${orangeTeam})`,
                    });
                }

                if (![...bluePlayers, ...orangePlayers].every(p => p.skillGroupId === match.skillGroupId)) {
                    errors.push({
                        error: `Player(s) from incorrect skill group found in replay ${item.originalFilename}`,
                    });
                    this.logger.verbose(JSON.stringify({
                        expected: match.skillGroupId,
                        found: [...bluePlayers.map(bp => [bp.id, bp.skillGroupId]), ...orangePlayers.map(p => [p.id, p.skillGroupId])],
                    }));
                }

            } catch (e) {
                this.logger.error("Error looking up match participants", e);
                errors.push({
                    error: `Error looking up match participants in replay ${item.originalFilename}`,
                });
            }
        }
        if (errors.length) {
            return {
                valid: false, errors: errors,
            };
        }

        return {
            valid: true,
        };
    }

    private submissionItemsUnique(items: BallchasingResponse[]): boolean {
        const hashes: Set<string> = new Set();

        for (const item of items) {
            const players: Array<{
                player_id: string;
                shots: number;
                saves: number;
                goals: number;
                assists: number;
                color: "BLUE" | "ORANGE";
            }> = [];

            for (const p of item.blue.players) {
                players.push({
                    player_id: p.id.id,
                    shots: p.stats.core.shots,
                    saves: p.stats.core.saves,
                    goals: p.stats.core.goals,
                    assists: p.stats.core.assists,
                    color: "BLUE",
                });
            }

            for (const p of item.orange.players) {
                players.push({
                    player_id: p.id.id,
                    shots: p.stats.core.shots,
                    saves: p.stats.core.saves,
                    goals: p.stats.core.goals,
                    assists: p.stats.core.assists,
                    color: "ORANGE",
                });
            }
            
            hashes.add(JSON.stringify(players.sort((a, b) => (a.player_id < b.player_id ? -1 : 1))));
        }

        return hashes.size === items.length;
    }
}
