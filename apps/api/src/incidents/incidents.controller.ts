import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { createIncidentSchema, writeDayReportSchema } from '@shibutz/contracts';
import type { CreateIncident, DayReport, Incident, WriteDayReport } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { IncidentsService } from './incidents.service';

const date = new ZodValidationPipe(z.iso.date());

@Controller()
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get('technicians/:id/days/:date/report')
  report(@Param('id', ParseIntPipe) id: number, @Param('date', date) day: string): Promise<DayReport> {
    return this.incidents.report(id, day);
  }

  @Put('technicians/:id/days/:date/report')
  writeReport(
    @Param('id', ParseIntPipe) id: number,
    @Param('date', date) day: string,
    @Body(new ZodValidationPipe(writeDayReportSchema)) body: WriteDayReport,
  ): Promise<DayReport> {
    return this.incidents.writeReport(id, day, body.body);
  }

  @Get('technicians/:id/days/:date/incidents')
  forDay(@Param('id', ParseIntPipe) id: number, @Param('date', date) day: string): Promise<Incident[]> {
    return this.incidents.forDay(id, day);
  }

  @Post('technicians/:id/days/:date/incidents')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Param('date', date) day: string,
    @Body(new ZodValidationPipe(createIncidentSchema)) body: CreateIncident,
  ): Promise<Incident> {
    return this.incidents.create(id, day, body);
  }

  @Get('incidents/open')
  open(): Promise<Incident[]> {
    return this.incidents.open();
  }

  @Post('incidents/:id/review')
  review(@Param('id', ParseIntPipe) id: number): Promise<Incident> {
    return this.incidents.review(id);
  }
}
