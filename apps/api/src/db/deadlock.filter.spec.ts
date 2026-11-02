import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { DeadlockFilter } from './deadlock.filter';

function run(err: unknown): { status: number; body: { message: string } } {
  let sent: { status: number; body: { message: string } } | undefined;
  const filter = new DeadlockFilter({ reply: (_res: unknown, body: { message: string }, status: number) => (sent = { status, body }), isHeadersSent: () => false } as never);
  filter.catch(err, { getType: () => 'http', getArgByIndex: () => ({}) } as unknown as ArgumentsHost);
  if (!sent) throw new Error('no reply');
  return sent;
}

describe('DeadlockFilter', () => {
  it('answers a Postgres deadlock (40P01, wrapped by drizzle) with 409', () => {
    const wrapped = Object.assign(new Error('Failed query'), { cause: { code: '40P01' } });
    expect(run(wrapped)).toEqual({ status: 409, body: { statusCode: 409, message: 'Concurrent change; retry', error: 'Conflict' } });
  });

  it('leaves other errors alone', () => {
    expect(run(new BadRequestException('nope')).status).toBe(400);
    expect(run(new Error('boom')).status).toBe(500);
  });
});
