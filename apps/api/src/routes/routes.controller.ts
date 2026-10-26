import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { z } from 'zod';
import type { RouteView } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get(':technicianId/:date')
  view(
    @Param('technicianId', ParseIntPipe) technicianId: number,
    @Param('date', new ZodValidationPipe(z.iso.date())) date: string,
  ): Promise<RouteView> {
    return this.routes.view(technicianId, date);
  }
}
