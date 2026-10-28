import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { updateJobStatusSchema } from '@shibutz/contracts';
import type { Job, UpdateJobStatus } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { JobStatusService } from './job-status.service';

@Controller('jobs')
export class JobStatusController {
  constructor(private readonly statuses: JobStatusService) {}

  @Patch(':id/status')
  change(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateJobStatusSchema)) { status, reason }: UpdateJobStatus,
  ): Promise<Job> {
    return this.statuses.change(id, status, reason);
  }
}
