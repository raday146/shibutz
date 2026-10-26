import type { CreateJob, CreateSkill, CreateTechnician, LonLat } from '@shibutz/contracts';

/**
 * Data loaded into empty tables with identity restarted, so ids are positional:
 * skills[0] gets id 1, technicians[0] id 1, jobs[0] id 1. skillIds refer to those ids.
 */
export interface Dataset {
  skills: CreateSkill[];
  technicians: CreateTechnician[];
  jobs: CreateJob[];
}

/** Fixed planning day, so re-runs are identical. Israel is on winter time (+02:00) then. */
export const SEED_DAY = '2026-11-02';
const at = (hhmm: string): string => `${SEED_DAY}T${hhmm}:00+02:00`;

const SKILLS: CreateSkill[] = [
  { code: 'electric', name: 'Electrical' },
  { code: 'plumbing', name: 'Plumbing' },
  { code: 'hvac', name: 'Air conditioning' },
  { code: 'network', name: 'Networking' },
  { code: 'appliance', name: 'Appliances' },
  { code: 'locks', name: 'Locks and doors' },
];

// Town centers, [lon, lat].
const TOWNS = {
  telAviv: [34.7818, 32.0853],
  ramatGan: [34.8248, 32.0684],
  petahTikva: [34.8878, 32.0871],
  holon: [34.7806, 32.0158],
  batYam: [34.7515, 32.0171],
  rishon: [34.7894, 31.973],
  herzliya: [34.8443, 32.1663],
  raanana: [34.8706, 32.1848],
  kfarSaba: [34.9066, 32.1782],
  rehovot: [34.8113, 31.8928],
} satisfies Record<string, LonLat>;

/** mulberry32: tiny seeded PRNG returning [0, 1). */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(seed = 20261102): Dataset {
  const rand = prng(seed);
  const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  // About ±1 km of jitter, rounded to ~10 cm so the data reads cleanly.
  const near = ([lon, lat]: LonLat): LonLat => [
    Math.round((lon + (rand() - 0.5) * 0.02) * 1e6) / 1e6,
    Math.round((lat + (rand() - 0.5) * 0.02) * 1e6) / 1e6,
  ];
  const towns = Object.values(TOWNS);
  const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  const technicians: CreateTechnician[] = [
    { name: 'Dana', home: near(TOWNS.telAviv), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1, 4] },
    { name: 'Yossi', home: near(TOWNS.rishon), shiftStart: '07:00:00', shiftEnd: '15:00:00', skillIds: [2, 5] },
    { name: 'Avi', home: near(TOWNS.herzliya), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1, 3, 6] },
    { name: 'Noa', home: near(TOWNS.petahTikva), shiftStart: '09:00:00', shiftEnd: '17:00:00', skillIds: [3, 4] },
    { name: 'Moshe', home: near(TOWNS.holon), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [2, 6] },
    { name: 'Rina', home: near(TOWNS.kfarSaba), shiftStart: '07:00:00', shiftEnd: '15:00:00', skillIds: [1, 2, 5] },
    { name: 'Eli', home: near(TOWNS.rehovot), shiftStart: '09:00:00', shiftEnd: '17:00:00', skillIds: [3, 5] },
    { name: 'Tamar', home: near(TOWNS.ramatGan), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [4, 6] },
  ];

  const jobs = Array.from({ length: 60 }, (): CreateJob => {
    const startMin = int(8 * 4, 15 * 4) * 15; // 08:00..15:00 in 15-minute steps
    const first = int(1, 6);
    const second = int(1, 6);
    return {
      location: near(pick(towns)),
      // One skill mostly; a second one sometimes, which may match nobody (an unassigned reason).
      skillIds: rand() < 0.2 && second !== first ? [first, second] : [first],
      serviceDurationS: pick([1800, 2700, 3600]),
      windowStart: at(hhmm(startMin)),
      windowEnd: at(hhmm(startMin + int(2, 4) * 60)),
      priority: int(0, 100),
    };
  });

  return { skills: SKILLS, technicians, jobs };
}

/**
 * Hand-built scenario for the heuristic-vs-VROOM comparison (spec #1, story 62).
 * `routes` is each technician's existing stop order (job ids); it is data only until the
 * routes tables exist (#6). `newJob` is the job that arrives during the day: a Givatayim job
 * needing skill 2 (plumbing), which Dana (Tel Aviv / Ramat Gan loop) and Yossi (Holon / Rishon loop)
 * can both take; it sits between Dana's first two stops, so the cheapest detour is obvious.
 */
export interface Scenario extends Dataset {
  routes: { technicianId: number; jobIds: number[] }[];
  newJob: CreateJob;
  /** Jobs already finished at `now`; the comparison starts each technician from their last done stop. */
  doneJobIds: number[];
  now: string;
}

const job = (location: LonLat, skillIds: number[], from: string, to: string): CreateJob => ({
  location,
  skillIds,
  serviceDurationS: 1800,
  windowStart: at(from),
  windowEnd: at(to),
  priority: 50,
});

export const comparisonScenario: Scenario = {
  skills: SKILLS,
  technicians: [
    { name: 'Dana', home: [34.7818, 32.0853], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1, 2] },
    { name: 'Yossi', home: [34.7894, 31.973], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [2, 5] },
    { name: 'Avi', home: [34.8443, 32.1663], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [3, 6] },
  ],
  jobs: [
    job([34.7915, 32.0795], [1], '08:30', '11:00'), // 1 Tel Aviv, Dizengoff Center area
    job([34.8248, 32.0684], [1], '09:30', '13:00'), // 2 Ramat Gan
    job([34.8878, 32.0871], [2], '11:00', '15:00'), // 3 Petah Tikva
    job([34.7806, 32.0158], [5], '08:30', '11:00'), // 4 Holon
    job([34.7515, 32.0171], [2], '10:00', '13:00'), // 5 Bat Yam
    job([34.8113, 31.8928], [5], '12:00', '15:00'), // 6 Rehovot
    job([34.8706, 32.1848], [3], '09:00', '12:00'), // 7 Ra'anana
    job([34.9066, 32.1782], [6], '11:00', '15:00'), // 8 Kfar Saba
  ],
  routes: [
    { technicianId: 1, jobIds: [1, 2, 3] },
    { technicianId: 2, jobIds: [4, 5, 6] },
    { technicianId: 3, jobIds: [7, 8] },
  ],
  newJob: job([34.8114, 32.0707], [2], '09:00', '14:00'), // Givatayim
  doneJobIds: [1],
  now: at('09:15'),
};
