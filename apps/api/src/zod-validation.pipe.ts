import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Parses a request value with a shared zod schema; 400 with the zod issues on failure. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({ message: 'Validation failed', issues: result.error.issues });
    }
    return result.data;
  }
}
