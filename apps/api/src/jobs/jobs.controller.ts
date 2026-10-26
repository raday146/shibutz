import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { createJobSchema, updateJobSchema } from '@shibutz/contracts';
import type { CreateJob, Job, UpdateJob } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(): Promise<Job[]> {
    return this.jobs.list();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<Job> {
    return this.jobs.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createJobSchema)) body: CreateJob): Promise<Job> {
    return this.jobs.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateJobSchema)) body: UpdateJob,
  ): Promise<Job> {
    return this.jobs.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.jobs.remove(id);
  }
}
