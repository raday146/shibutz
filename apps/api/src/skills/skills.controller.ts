import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { createSkillSchema, updateSkillSchema } from '@shibutz/contracts';
import type { CreateSkill, Skill, UpdateSkill } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { SkillsService } from './skills.service';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(): Promise<Skill[]> {
    return this.skills.list();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<Skill> {
    return this.skills.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSkillSchema)) body: CreateSkill): Promise<Skill> {
    return this.skills.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateSkillSchema)) body: UpdateSkill,
  ): Promise<Skill> {
    return this.skills.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.skills.remove(id);
  }
}
