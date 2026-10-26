import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { postJson } from './ports';

describe('postJson', () => {
  let server: Server;
  let url: string;
  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"code":1,"error":"bad vehicle"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
  });

  it('reports the HTTP status and body of an error reply in the 503', async () => {
    const err: unknown = await postJson('VROOM', url, {}, z.object({ routes: z.array(z.unknown()) }), 1000).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).message).toMatch(/^VROOM unavailable: HTTP 400: .*bad vehicle/);
  });
});
