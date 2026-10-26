import { Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import type { DayPlan } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { OptimizationService } from './optimization.service';

@Controller('optimization')
export class OptimizationController {
  constructor(private readonly optimization: OptimizationService) {}

  @Post('day/:date')
  optimizeDay(@Param('date', new ZodValidationPipe(z.iso.date())) date: string): Promise<DayPlan> {
    return this.optimization.optimizeDay(date);
  }
}
