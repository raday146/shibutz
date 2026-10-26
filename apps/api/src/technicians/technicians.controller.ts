import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { createTechnicianSchema, updateTechnicianSchema } from '@shibutz/contracts';
import type { CreateTechnician, Technician, UpdateTechnician } from '@shibutz/contracts';
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

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.technicians.remove(id);
  }
}
