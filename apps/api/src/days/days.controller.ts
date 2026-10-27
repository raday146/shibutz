import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { DaySummary } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { DaysService } from './days.service';

@Controller('days')
export class DaysController {
  constructor(private readonly days: DaysService) {}

  @Get(':date/summary')
  summary(@Param('date', new ZodValidationPipe(z.iso.date())) date: string): Promise<DaySummary> {
    return this.days.summary(date);
  }
}
