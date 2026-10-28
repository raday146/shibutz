import request from 'supertest';
import { DB, type Db } from '../src/db/db.module';
import { buildSeed, comparisonScenario, SEED_DAY } from '../src/seed/datasets';
import { loadDataset, snapCheck } from '../src/seed/load';
import { setupTestApp } from './app';
import { describeIfUp, OSRM_URL } from './stack';

describe('seed', () => {
  const app = setupTestApp();
  const snapshot = async (): Promise<unknown[]> => {
    const http = request(app().getHttpServer());
    return Promise.all(['/skills', '/technicians', '/jobs'].map(async (p) => (await http.get(p).expect(200)).body as unknown));
  };

  it('loads the seed with identical data on every run', async () => {
    const db = app().get<Db>(DB);
    await loadDataset(db, buildSeed());
    const first = await snapshot();
    await loadDataset(db, buildSeed());

    expect(await snapshot()).toEqual(first);
    const [skills, technicians, jobs] = first as unknown[][];
    expect([skills?.length, technicians?.length, jobs?.length]).toEqual([6, 8, 60]);
  });

  it('stores Hebrew in logical order and every job has a title and address', async () => {
    await loadDataset(app().get<Db>(DB), buildSeed());
    const http = request(app().getHttpServer());
    const techs = (await http.get('/technicians').expect(200)).body as { name: string }[];
    expect(techs[0]?.name).toBe('\u05D3\u05E0\u05D4');
    const jobs = (await http.get('/jobs').expect(200)).body as { title: string; address: string }[];
    expect(jobs.every((j) => j.title.length > 0 && j.address.length > 0)).toBe(true);
  });

  it('seeds one day report and one open incident', async () => {
    await loadDataset(app().get<Db>(DB), buildSeed());
    const http = request(app().getHttpServer());
    const day = `/technicians/1/days/${SEED_DAY}`;
    expect((await http.get(`${day}/report`).expect(200)).body.body).toContain('יום');
    const open = (await http.get('/incidents/open').expect(200)).body as { technicianId: number; date: string; jobId: number }[];
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ technicianId: 1, date: SEED_DAY, jobId: 1 });
  });

  it('loads the comparison scenario with routed jobs assigned and the new job unassigned', async () => {
    await loadDataset(app().get<Db>(DB), comparisonScenario);

    const { body } = await request(app().getHttpServer()).get('/jobs').expect(200);
    const statuses = (body as { status: string }[]).map((j) => j.status);
    expect(statuses).toEqual([...comparisonScenario.jobs.map(() => 'assigned'), 'unassigned']);
  });
});

describeIfUp('osrm')('seed snap check against OSRM', () => {
  it('finds every seed and scenario point within the extract', async () => {
    await expect(snapCheck(buildSeed(), OSRM_URL)).resolves.toEqual([]);
    await expect(snapCheck(comparisonScenario, OSRM_URL)).resolves.toEqual([]);
  });

  it('reports a point in the sea', async () => {
    const offshore = { ...comparisonScenario, jobs: [{ ...comparisonScenario.newJob, location: [34.5, 32.0853] as [number, number] }] };
    const far = await snapCheck(offshore, OSRM_URL);
    expect(far.map((f) => f.label)).toEqual(['job 1']);
  });
});
