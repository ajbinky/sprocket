import {Inject, Injectable, Logger} from "@nestjs/common";
import {
    config,
    EventsService,
    EventTopic,
    MinioService,
    readToBuffer,
    RedisService,
    REPLAY_SUBMISSION_REJECTION_SYSTEM_PLAYER_ID,
    ResponseStatus,
    SubmissionEndpoint,
    SubmissionService,
} from "@sprocketbot/common";
import {PubSub} from "apollo-server-express";
import {SHA256} from "crypto-js";
import {GraphQLError} from "graphql";
import type {Readable} from "stream";

import {PubSubKey} from "../../types/pubsub.constants";
import {REPLAY_EXT} from "./replay-parse.constants";
import type {ReplaySubmission} from "./types";

@Injectable()
export class ReplayParseService {
    private readonly logger = new Logger(ReplayParseService.name);

    private subscribed = false;

    constructor(
        private readonly minioService: MinioService,
        private readonly submissionService: SubmissionService,
        private readonly redisService: RedisService,
        private readonly eventsService: EventsService,
        @Inject(PubSubKey.ReplayParsing) private readonly pubsub: PubSub,
    ) {}

    async getSubmission(submissionId: string): Promise<ReplaySubmission> {
        const result = await this.submissionService.send(SubmissionEndpoint.GetSubmissionRedisKey, {submissionId});
        if (result.status === ResponseStatus.ERROR) throw result.error;

        // Right now, this is entirely based on faith. If we encounter issues; we can update the graphql types.
        // Writing up a zod schema set for this would be suckage to the 10th degree.
        return this.redisService.getJson<ReplaySubmission>(result.data.redisKey);
    }

    /**
     * @returns if the scrim has been reset
     */
    async resetBrokenReplays(submissionId: string, userId: number, override = false): Promise<boolean> {
        const resetResponse = await this.submissionService.send(SubmissionEndpoint.ResetSubmission, {
            submissionId: submissionId,
            override: override,
            userId: userId,
        });
        if (resetResponse.status === ResponseStatus.ERROR) throw resetResponse.error;
        return true;
    }

    async parseReplays(
        streams: Array<{stream: Readable; filename: string}>,
        submissionId: string,
        userId: number,
    ): Promise<string[]> {
        const canSubmitReponse = await this.submissionService.send(SubmissionEndpoint.CanSubmitReplays, {
            userId: userId,
            submissionId: submissionId,
        });
        if (canSubmitReponse.status === ResponseStatus.ERROR) throw canSubmitReponse.error;
        if (!canSubmitReponse.data.canSubmit) throw new GraphQLError(canSubmitReponse.data.reason);

        const filepaths = await Promise.all(
            streams.map(async s => {
                const buffer = await readToBuffer(s.stream);
                const objectHash = SHA256(buffer.toString()).toString();
                const replayObjectPath = `replays/${objectHash}${REPLAY_EXT}`;
                const bucket = config.minio.bucketNames.replays;
                await this.minioService.put(bucket, replayObjectPath, buffer).catch(this.logger.error.bind(this));

                return {
                    minioPath: replayObjectPath,
                    originalFilename: s.filename,
                };
            }),
        );

        const submissionResponse = await this.submissionService.send(SubmissionEndpoint.SubmitReplays, {
            submissionId: submissionId,
            filepaths: filepaths,
            creatorUserId: userId,
        });
        if (submissionResponse.status === ResponseStatus.ERROR) throw submissionResponse.error;
        // Return taskIds, directly correspond to the files that were uploaded
        return submissionResponse.data;
    }

    async ratifySubmission(submissionId: string, userId: number): Promise<void> {
        const canRatifyReponse = await this.submissionService.send(SubmissionEndpoint.CanRatifySubmission, {
            userId: userId,
            submissionId: submissionId,
        });
        if (canRatifyReponse.status === ResponseStatus.ERROR) throw canRatifyReponse.error;
        if (!canRatifyReponse.data.canRatify) throw new GraphQLError(canRatifyReponse.data.reason);

        const ratificationResponse = await this.submissionService.send(SubmissionEndpoint.RatifySubmission, {
            submissionId: submissionId,
            userId: userId,
        });
        if (ratificationResponse.status === ResponseStatus.ERROR) throw ratificationResponse.error;
    }

    async rejectSubmissionByPlayer(submissionId: string, userId: number, reason: string): Promise<void> {
        const rejectionResponse = await this.submissionService.send(SubmissionEndpoint.RejectSubmission, {
            submissionId: submissionId,
            userId: userId,
            reason: reason,
        });
        if (rejectionResponse.status === ResponseStatus.ERROR) throw rejectionResponse.error;
    }

    async rejectSubmissionBySystem(submissionId: string, reason: string): Promise<void> {
        return this.rejectSubmissionByPlayer(submissionId, REPLAY_SUBMISSION_REJECTION_SYSTEM_PLAYER_ID, reason);
    }

    async enableSubscription(): Promise<void> {
        if (this.subscribed) return;
        this.subscribed = true;
        await this.eventsService.subscribe(EventTopic.AllSubmissionEvents, true).then(rx => {
            rx.subscribe(v => {
                if (typeof v.payload !== "object") {
                    return;
                }
                this.redisService
                    .getJson<ReplaySubmission>(v.payload.redisKey)
                    .then(async submission =>
                        this.pubsub.publish(submission.id, {
                            followSubmission: submission,
                        }),
                    )
                    .catch(this.logger.error.bind(this.logger));
            });
        });
    }
}
