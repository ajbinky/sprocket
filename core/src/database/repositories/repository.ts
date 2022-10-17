import type {DeepPartial, FindOneOptions} from "typeorm";
import {DataSource, Repository} from "typeorm";

import type {BaseModel} from "../base-model";
import {Class} from "./repository.types";

export abstract class ExtendedRepository<T extends BaseModel> extends Repository<T> {
    constructor(readonly c: Class<T>, readonly dataSource: DataSource) {
        super(c, dataSource.createEntityManager());
    }

    async getById(id: number, options?: FindOneOptions<T>): Promise<T> {
        return this.findOneOrFail(
            Object.assign(
                {
                    where: {id},
                },
                options,
            ),
        );
    }

    async createAndSave(data: DeepPartial<T>): Promise<T> {
        const newEntity = this.create(data);
        await this.save(newEntity);

        return newEntity;
    }

    async updateAndSave(id: number, data: DeepPartial<T>): Promise<T> {
        let entity = await this.findOneOrFail({where: {id}} as FindOneOptions<T>);
        entity = this.merge(entity, data);
        await this.save(entity);

        return entity;
    }

    async deleteAndReturn(id: number): Promise<T> {
        const entity = await this.findOneOrFail({where: {id}} as FindOneOptions<T>);
        await this.delete(id);

        return entity;
    }
}
