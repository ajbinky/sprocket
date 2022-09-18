import {Injectable} from "@nestjs/common";
import type {DeepPartial, FindOneOptions} from "typeorm";
import {DataSource, Repository} from "typeorm";

import {PopulateService} from "../../util/populate/populate.service";
import type {BaseModel} from "../base-model";
import {Class} from "./repository.types";

@Injectable()
export abstract class ExtendedRepository<T extends BaseModel> extends Repository<T> {
    constructor(
        readonly C: Class<T>,
        readonly dataSource: DataSource,
        readonly populateService: PopulateService,
    ) {
        super(C, dataSource.createEntityManager());
    }

    async createAndSave(data: DeepPartial<T>): Promise<T> {
        const newEntity = this.create(data);
        await this.save(newEntity);

        return newEntity;
    }

    async updateAndSave(id: number, data: DeepPartial<T>): Promise<T> {
        let entity = await this.findOneOrFail({where: {id} } as FindOneOptions<T>);
        entity = this.merge(entity, data);
        await this.save(entity);

        return entity;
    }

    async deleteAndReturn(id: number): Promise<T> {
        const entity = await this.findOneOrFail({where: {id} } as FindOneOptions<T>);
        await this.delete(id);

        return entity;
    }

    async populateOneOrFail<RelationPath extends keyof T & string>(base: T, relation: RelationPath): Promise<T[RelationPath]> {
        return this.populateService.populateOneOrFail(this.C, base, relation);
    }

    async populateOne<RelationPath extends keyof T & string>(base: T, relation: RelationPath): Promise<T[RelationPath] | undefined> {
        return this.populateService.populateOne(this.C, base, relation);
    }

    async populateMany<RelationPath extends keyof T & string>(base: T, relation: RelationPath): Promise<T[RelationPath]> {
        return this.populateService.populateMany(this.C, base, relation);
    }
}
