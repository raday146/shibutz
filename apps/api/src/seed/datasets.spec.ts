import { createJobSchema, createSkillSchema, createTechnicianSchema } from '@shibutz/contracts';
import { buildSeed, comparisonScenario, type Dataset } from './datasets';

function expectValid({ skills, technicians, jobs }: Dataset): void {
  skills.forEach((s) => createSkillSchema.parse(s));
  technicians.forEach((t) => createTechnicianSchema.parse(t));
  jobs.forEach((j) => createJobSchema.parse(j));
  const skillIds = skills.map((_, i) => i + 1);
  for (const { skillIds: ids } of [...technicians, ...jobs]) expect(skillIds).toEqual(expect.arrayContaining(ids));
}

describe('buildSeed', () => {
  const seed = buildSeed();

  it('has 6 skills, 8 technicians with 2-3 skills and 60 jobs', () => {
    expect(seed.skills).toHaveLength(6);
    expect(seed.technicians).toHaveLength(8);
    for (const t of seed.technicians) expect([2, 3]).toContain(t.skillIds.length);
    expect(seed.jobs).toHaveLength(60);
  });

  it('is deterministic', () => {
    expect(buildSeed()).toEqual(seed);
  });

  it('is valid input for the API contracts and stays in central Israel', () => {
    expectValid(seed);
    for (const [lon, lat] of [...seed.technicians.map((t) => t.home), ...seed.jobs.map((j) => j.location)]) {
      expect(lon).toBeGreaterThan(34.6);
      expect(lon).toBeLessThan(35.1);
      expect(lat).toBeGreaterThan(31.8);
      expect(lat).toBeLessThan(32.3);
    }
  });
});

describe('comparisonScenario', () => {
  const s = comparisonScenario;

  it('is valid input for the API contracts', () => {
    expectValid(s);
    createJobSchema.parse(s.newJob);
  });

  it('routes each existing job exactly once to a technician holding its skills', () => {
    const routed = s.routes.flatMap((r) => r.jobIds).sort((a, b) => a - b);
    expect(routed).toEqual(s.jobs.map((_, i) => i + 1));
    for (const { technicianId, jobIds } of s.routes) {
      const tech = s.technicians[technicianId - 1];
      for (const id of jobIds) expect(tech?.skillIds).toEqual(expect.arrayContaining(s.jobs[id - 1]?.skillIds ?? [-1]));
    }
  });
});
