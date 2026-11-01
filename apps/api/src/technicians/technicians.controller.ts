import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { createTechnicianSchema, technicianChangesQuerySchema, technicianVersionSchema, updateTechnicianSchema } from '@shibutz/contracts';
import type { CreateTechnician, Technician, TechnicianChange, TechnicianChangesQuery, TechnicianVersion, UpdateTechnician } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { TechniciansService } from './technicians.service';

@Controller('technicians')
export class TechniciansController {
  constructor(private readonly technicians: TechniciansService) {}

  @Get()
  list(): Promise<Technician[]> {
    return this.technicians.list();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<Technician> {
    return this.technicians.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTechnicianSchema)) body: CreateTechnician): Promise<Technician> {
    return this.technicians.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateTechnicianSchema)) body: UpdateTechnician,
  ): Promise<Technician> {
    return this.technicians.update(id, body);
  }

  @Post(':id/deactivate')
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(technicianVersionSchema)) body: TechnicianVersion,
  ): Promise<Technician> {
    return this.technicians.deactivate(id, body);
  }

  @Post(':id/reactivate')
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(technicianVersionSchema)) body: TechnicianVersion,
  ): Promise<Technician> {
    return this.technicians.reactivate(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.technicians.remove(id);
  }
}

/** Top level, not under `technicians/`, so it cannot be read as `technicians/:id`. */
@Controller('technician-changes')
export class TechnicianChangesController {
  constructor(private readonly technicians: TechniciansService) {}

  @Get()
  list(@Query(new ZodValidationPipe(technicianChangesQuerySchema)) query: TechnicianChangesQuery): Promise<TechnicianChange[]> {
    return this.technicians.changes(query);
  }
}
