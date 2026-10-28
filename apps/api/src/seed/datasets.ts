import type { CreateJob, CreateSkill, CreateTechnician, LonLat } from '@shibutz/contracts';

/**
 * Data loaded into empty tables with identity restarted, so ids are positional:
 * skills[0] gets id 1, technicians[0] id 1, jobs[0] id 1. skillIds refer to those ids.
 */
export interface Dataset {
  skills: CreateSkill[];
  technicians: CreateTechnician[];
  jobs: CreateJob[];
  /** Notes by positional job id. */
  notes?: { jobId: number; body: string }[];
  /** A day report and an incident for technician 1 on SEED_DAY; the incident links job 1. */
  workDay?: { report: string; incident: string };
}

/** Fixed planning day, so re-runs are identical. Israel is on winter time (+02:00) then. */
export const SEED_DAY = '2026-11-02';
const at = (hhmm: string): string => `${SEED_DAY}T${hhmm}:00+02:00`;

const SKILLS: CreateSkill[] = [
  { code: 'electric', nameEn: 'Electrical', nameHe: 'חשמל' },
  { code: 'plumbing', nameEn: 'Plumbing', nameHe: 'אינסטלציה' },
  { code: 'hvac', nameEn: 'Air conditioning', nameHe: 'מיזוג אוויר' },
  { code: 'network', nameEn: 'Networking', nameHe: 'תקשורת ורשתות' },
  { code: 'appliance', nameEn: 'Appliances', nameHe: 'מוצרי חשמל' },
  { code: 'locks', nameEn: 'Locks and doors', nameHe: 'מנעולים ודלתות' },
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

/** Hebrew job titles per skill, indexed by skill id - 1. */
const TITLES: readonly (readonly string[])[] = [
  ['החלפת לוח חשמל', 'תיקון קצר חשמלי', 'התקנת שקעים', 'החלפת גוף תאורה'],
  ['תיקון נזילה בצנרת', 'פתיחת סתימה בביוב', 'החלפת ברז', 'תיקון דוד שמש'],
  ['התקנת מזגן', 'תחזוקת מזגן', 'תיקון מזגן שאינו מקרר', 'ניקוי מסננים'],
  ['התקנת נקודת רשת', 'תיקון אינטרנט', 'החלפת נתב', 'הרחבת כיסוי אלחוטי'],
  ['תיקון מכונת כביסה', 'תיקון מקרר', 'תיקון תנור', 'תיקון מדיח כלים'],
  ['החלפת צילינדר', 'פריצת דלת נעולה', 'תיקון ציר דלת', 'התקנת מנעול חכם'],
];

/** Hebrew town names and a few streets each, keyed like TOWNS. */
const ADDRESSES: Record<keyof typeof TOWNS, { town: string; streets: readonly string[] }> = {
  telAviv: { town: 'תל אביב', streets: ['דיזנגוף', 'אבן גבירול', 'הרצל', 'שנקין'] },
  ramatGan: { town: 'רמת גן', streets: ['ז׳בוטינסקי', 'ביאליק', 'הרצל', 'אבא הלל'] },
  petahTikva: { town: 'פתח תקווה', streets: ['רוטשילד', 'ההגנה', 'ז׳בוטינסקי', 'סירקין'] },
  holon: { town: 'חולון', streets: ['סוקולוב', 'גולדה מאיר', 'ויצמן', 'הפלמ״ח'] },
  batYam: { town: 'בת ים', streets: ['בלפור', 'העצמאות', 'רוטשילד', 'קוממיות'] },
  rishon: { town: 'ראשון לציון', streets: ['הרצל', 'רוטשילד', 'ז׳בוטינסקי', 'הנשיא'] },
  herzliya: { town: 'הרצליה', streets: ['סוקולוב', 'בן גוריון', 'ויצמן', 'שדרות ההגנה'] },
  raanana: { town: 'רעננה', streets: ['אחוזה', 'ויצמן', 'הרצל', 'קלאוזנר'] },
  kfarSaba: { town: 'כפר סבא', streets: ['ויצמן', 'הרצל', 'סוקולוב', 'בן גוריון'] },
  rehovot: { town: 'רחובות', streets: ['הרצל', 'יעקב', 'בן גוריון', 'ויצמן'] },
};

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
  const towns = Object.entries(TOWNS) as [keyof typeof TOWNS, LonLat][];
  const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  const technicians: CreateTechnician[] = [
    { name: 'דנה', home: near(TOWNS.telAviv), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1, 4] },
    { name: 'יוסי', home: near(TOWNS.rishon), shiftStart: '07:00:00', shiftEnd: '15:00:00', skillIds: [2, 5] },
    { name: 'אבי', home: near(TOWNS.herzliya), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1, 3, 6] },
    { name: 'נועה', home: near(TOWNS.petahTikva), shiftStart: '09:00:00', shiftEnd: '17:00:00', skillIds: [3, 4] },
    { name: 'משה', home: near(TOWNS.holon), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [2, 6] },
    { name: 'רינה', home: near(TOWNS.kfarSaba), shiftStart: '07:00:00', shiftEnd: '15:00:00', skillIds: [1, 2, 5] },
    { name: 'אלי', home: near(TOWNS.rehovot), shiftStart: '09:00:00', shiftEnd: '17:00:00', skillIds: [3, 5] },
    { name: 'תמר', home: near(TOWNS.ramatGan), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [4, 6] },
  ];

  const jobs = Array.from({ length: 60 }, (): CreateJob => {
    const startMin = int(8 * 4, 15 * 4) * 15; // 08:00..15:00 in 15-minute steps
    const first = int(1, 6);
    const second = int(1, 6);
    const [town, center] = pick(towns);
    const { town: townHe, streets } = ADDRESSES[town];
    return {
      title: pick(TITLES[first - 1] ?? []),
      address: `${pick(streets)} ${int(1, 120)}, ${townHe}`,
      location: near(center),
      // One skill mostly; a second one sometimes, which may match nobody (an unassigned reason).
      skillIds: rand() < 0.2 && second !== first ? [first, second] : [first],
      serviceDurationS: pick([1800, 2700, 3600]),
      windowStart: at(hhmm(startMin)),
      windowEnd: at(hhmm(startMin + int(2, 4) * 60)),
      priority: int(0, 100),
    };
  });

  const notes = [
    { jobId: 1, body: 'הלקוח מבקש להתקשר חצי שעה לפני ההגעה.' },
    { jobId: 5, body: 'קוד כניסה לבניין: 1948. חניה ברחוב הצדדי.' },
    { jobId: 12, body: 'להביא סולם גבוה. הציוד הוחלף בביקור הקודם.' },
    { jobId: 20, body: 'Customer works from home, bring shoe covers.' },
  ];
  const workDay = { report: 'יום רגוע, כל העבודות הסתיימו בזמן.', incident: 'הלקוח לא היה בבית בהגעה, נדרשת בדיקה.' };

  return { skills: SKILLS, technicians, jobs, notes, workDay };
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

const job = (title: string, address: string, location: LonLat, skillIds: number[], from: string, to: string): CreateJob => ({
  title,
  address,
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
    { name: 'דנה', home: [34.7818, 32.0853], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1, 2] },
    { name: 'יוסי', home: [34.7894, 31.973], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [2, 5] },
    { name: 'אבי', home: [34.8443, 32.1663], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [3, 6] },
  ],
  jobs: [
    job('החלפת לוח חשמל', 'דיזנגוף 50, תל אביב', [34.7915, 32.0795], [1], '08:30', '11:00'), // 1 Tel Aviv, Dizengoff Center area
    job('התקנת שקעים', 'ביאליק 12, רמת גן', [34.8248, 32.0684], [1], '09:30', '13:00'), // 2 Ramat Gan
    job('תיקון נזילה בצנרת', 'רוטשילד 30, פתח תקווה', [34.8878, 32.0871], [2], '11:00', '15:00'), // 3 Petah Tikva
    job('תיקון מכונת כביסה', 'סוקולוב 8, חולון', [34.7806, 32.0158], [5], '08:30', '11:00'), // 4 Holon
    job('החלפת ברז', 'בלפור 21, בת ים', [34.7515, 32.0171], [2], '10:00', '13:00'), // 5 Bat Yam
    job('תיקון מקרר', 'הרצל 45, רחובות', [34.8113, 31.8928], [5], '12:00', '15:00'), // 6 Rehovot
    job('תחזוקת מזגן', 'אחוזה 100, רעננה', [34.8706, 32.1848], [3], '09:00', '12:00'), // 7 Ra'anana
    job('החלפת צילינדר', 'ויצמן 15, כפר סבא', [34.9066, 32.1782], [6], '11:00', '15:00'), // 8 Kfar Saba
  ],
  routes: [
    { technicianId: 1, jobIds: [1, 2, 3] },
    { technicianId: 2, jobIds: [4, 5, 6] },
    { technicianId: 3, jobIds: [7, 8] },
  ],
  newJob: job('פתיחת סתימה בביוב', 'כצנלסון 20, גבעתיים', [34.8114, 32.0707], [2], '09:00', '14:00'), // Givatayim
  doneJobIds: [1],
  now: at('09:15'),
};
