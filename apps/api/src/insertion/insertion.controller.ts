import { Controller, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { insertionQuerySchema } from '@shibutz/contracts';
import type { InsertionQuery, InsertionSuggestions } from '@shibutz/contracts';
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
}
