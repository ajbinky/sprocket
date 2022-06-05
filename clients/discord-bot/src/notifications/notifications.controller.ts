import {Controller} from "@nestjs/common";
import {MessagePattern, Payload} from "@nestjs/microservices";
import {BotEndpoint, BotSchemas} from "@sprocketbot/common";

import {NotificationsService} from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
    constructor(private readonly notificationService: NotificationsService) {}
    
    @MessagePattern(BotEndpoint.SendGuildTextMessage)
    async sendGuildTextMessage(@Payload() payload: unknown): Promise<boolean> {
        const data = BotSchemas.SendGuildTextMessage.input.parse(payload);
        return this.notificationService.sendGuildTextMessage(data.organizationId, data.channelId, data.content);
    }
    
    @MessagePattern(BotEndpoint.SendDirectMessage)
    async sendDirectMessage(@Payload() payload: unknown): Promise<boolean> {
        const data = BotSchemas.SendDirectMessage.input.parse(payload);
        return this.notificationService.sendDirectMessage(data.organizationId, data.userId, data.content);
    }
}
