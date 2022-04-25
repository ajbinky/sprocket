import {NestFactory} from "@nestjs/core";
import {Transport} from "@nestjs/microservices";
import * as config from "config";
import fetch from "node-fetch";

import {AppModule} from "./app.module";

// @ts-expect-error gql-client needs fetch
// eslint-disable-next-line no-undef, @typescript-eslint/no-unsafe-assignment
global.fetch = fetch;

async function bootstrap(): Promise<void> {
    const app = await NestFactory.createMicroservice(AppModule, {
        transport: Transport.RMQ,
        logger: config.get("logger.levels"),
        options: {
            urls: [config.get("transport.url")],
            queue: config.get("transport.bot_queue"),
            queueOptions: {
                durable: true,
            },
            heartbeat: 120,
        },
    });
    app.listen(() => {
        /* eslint-disable no-console */
        console.log("Service Started");
    });

}

bootstrap().catch(console.error);
