import {Injectable} from "@nestjs/common";
import type {DeepPartial, DeleteResult} from "typeorm";
import {DataSource} from "typeorm";

import {PopulateService} from "../../util/populate/populate.service";
import type {BaseModel} from "../base-model";
import {ExtendedRepository} from "./extended-repository";
import {Class} from "./repository.types";

@Injectable()
export abstract class EloRepository<T extends BaseModel> extends ExtendedRepository<T> {
    constructor(
        readonly C: Class<T>,
        readonly dataSource: DataSource,
        readonly populateService: PopulateService,
    ) {
        super(C, dataSource, populateService);
    }

    /**
     * @deprecated Method is overwritten due to elo database implications.
     */
    // @ts-expect-error This needs to work because I said so.
    create(): unknown {
        throw new Error("Method is overwritten due to elo database implications.");
    }

    /**
     * @deprecated Method is overwritten due to elo database implications.
     */
    // @ts-expect-error This needs to work because I said so.
    update(): unknown {
        throw new Error("Method is overwritten due to elo database implications.");
    }

    async delete(id: number): Promise<DeleteResult> {
        // Put elo job here
        return super.delete(id);
    }

    async createAndSave(data: DeepPartial<T>): Promise<T> {
        // Put elo job here
        return super.createAndSave(data);
    }

    async updateAndSave(id: number, data: DeepPartial<T>): Promise<T> {
        // Put elo job here
        return super.updateAndSave(id, data);
    }

    async deleteAndReturn(id: number): Promise<T> {
        // Put elo job here
        return super.deleteAndReturn(id);
    }
}
