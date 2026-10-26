import { fromDaySeconds, toDaySeconds, wallClockDaySeconds } from './time';

describe('seconds since local midnight (Asia/Jerusalem)', () => {
  it.each([
    ['summer (UTC+3)', '2026-07-01T05:00:00Z', '2026-07-01', 8 * 3600],
    ['winter (UTC+2)', '2026-01-15T06:00:00Z', '2026-01-15', 8 * 3600],
    // 02:00-03:00 is skipped, so local 09:00 is 8 elapsed hours after midnight.
    ['spring-forward day', '2026-03-27T06:00:00Z', '2026-03-27', 8 * 3600],
    // 01:00-02:00 repeats, so local 09:00 is 10 elapsed hours after midnight.
    ['fall-back day', '2026-10-25T07:00:00Z', '2026-10-25', 10 * 3600],
  ])('converts an instant (%s)', (_case, instant, date, seconds) => {
    expect(toDaySeconds(new Date(instant), date)).toBe(seconds);
    expect(fromDaySeconds(seconds, date).toISOString()).toBe(new Date(instant).toISOString());
  });

  it.each([
    ['summer', '2026-07-01', '08:00:00', 8 * 3600],
    ['spring-forward day', '2026-03-27', '09:00:00', 8 * 3600],
    ['fall-back day', '2026-10-25', '09:00:00', 10 * 3600],
    ['seconds kept', '2026-07-01', '17:30:15', 17 * 3600 + 30 * 60 + 15],
  ])('converts a local wall-clock time on the plan date (%s)', (_case, date, time, seconds) => {
    expect(wallClockDaySeconds(time, date)).toBe(seconds);
  });
});
