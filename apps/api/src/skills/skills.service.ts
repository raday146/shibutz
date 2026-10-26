import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { CreateSkill, Skill, UpdateSkill } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { isForeignKeyViolation, isUniqueViolation } from '../db/errors';
import { skills } from '../db/schema';

@Injectable()
export class SkillsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(): Promise<Skill[]> {
    return this.db.select().from(skills).orderBy(asc(skills.id));
  }

  async get(id: number): Promise<Skill> {
    const [row] = await this.db.select().from(skills).where(eq(skills.id, id));
    return found(row);
  }

  async create(input: CreateSkill): Promise<Skill> {
    const [row] = await uniqueCode(this.db.insert(skills).values(input).returning());
    return found(row);
  }

  async update(id: number, input: UpdateSkill): Promise<Skill> {
    const [row] = await uniqueCode(this.db.update(skills).set(input).where(eq(skills.id, id)).returning());
    return found(row);
  }

  async remove(id: number): Promise<void> {
    try {
      const [row] = await this.db.delete(skills).where(eq(skills.id, id)).returning();
      found(row);
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('Skill is still used by technicians or jobs');
      throw err;
    }
  }
}

function found(row: Skill | undefined): Skill {
  if (!row) throw new NotFoundException('Skill not found');
  return row;
}

async function uniqueCode<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictException('Skill code already exists');
    throw err;
  }
}
