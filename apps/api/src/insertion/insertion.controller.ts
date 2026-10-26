import { Body, Controller, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { insertCommitSchema, insertionQuerySchema } from '@shibutz/contracts';
import type { InsertCommit, InsertionQuery, InsertionSuggestions, Job } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { InsertionService } from './insertion.service';

@Controller('jobs')
export class InsertionController {
  constructor(private readonly insertion: InsertionService) {}

  @Post(':id/insertion-suggestions')
  suggest(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(insertionQuerySchema)) { limit }: InsertionQuery,
  ): Promise<InsertionSuggestions> {
    return this.insertion.suggest(id, limit);
  }

  @Post(':id/insert')
  @HttpCode(200)
  insert(@Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(insertCommitSchema)) body: InsertCommit): Promise<Job> {
    return this.insertion.insert(id, body);
  }
}
