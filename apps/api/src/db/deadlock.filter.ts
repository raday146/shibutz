import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { isDeadlock } from './errors';

/** A lock cycle that slipped past the lock order is a retryable 409, not a 500. */
@Catch()
export class DeadlockFilter extends BaseExceptionFilter {
  override catch(err: unknown, host: ArgumentsHost): void {
    super.catch(isDeadlock(err) ? new ConflictException('Concurrent change; retry') : err, host);
  }
}
