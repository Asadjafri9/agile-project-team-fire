
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

// Intl formatters are expensive to create and a timeline converts many instants.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

export function isValidLocalDate(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function isValidSprintRange(start: string, end: string): boolean {
  if (!isValidLocalDate(start) || !isValidLocalDate(end)) return false;
  return Date.parse(`${end}T00:00:00Z`) >= Date.parse(`${start}T00:00:00Z`);
}

export function addLocalDays(date: string, days: number): string {
  if (!isValidLocalDate(date)) {
    throw new Error(`Invalid local date: "${date}"`);
  }
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export class ProjectCalendar {
  readonly timezone: string;
  private readonly formatter: Intl.DateTimeFormat;

  constructor(timezone = 'Asia/Karachi') {
    this.formatter = formatterFor(timezone);
    this.timezone = timezone;
  }

  toLocalDate(instant: Date | string): string {
    const date = instant instanceof Date ? instant : new Date(instant);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid instant: "${String(instant)}"`);
    }
    const parts = this.formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  }

  /** The local clock reading at an instant, expressed as if that reading were UTC. */
  private wallClock(instant: number): number {
    const parts = this.formatter.formatToParts(new Date(instant));
    const value = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const milliseconds = ((instant % 1000) + 1000) % 1000;
    return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'), milliseconds);
  }

  /**
   * The two instants that could display a wall-clock time, using the UTC offsets
   * either side of it, and those that really do: two in a fall-back hour, none
   * in a spring-forward gap.
   */
  private resolve(wall: number): { candidates: number[]; exact: number[] } {
    const candidates = [wall - DAY_MS, wall + DAY_MS]
      .map(probe => wall - (this.wallClock(probe) - probe))
      .sort((a, b) => a - b);
    return { candidates, exact: candidates.filter(instant => this.wallClock(instant) === wall) };
  }

  /**
   * The last instant whose clock has not passed a wall-clock time. If that time is
   * skipped (Nuuk jumps from 23:00 to midnight) this is just before the jump.
   */
  private lastInstantUpTo(wall: number): number {
    const { candidates, exact } = this.resolve(wall);
    if (exact.length) return exact[exact.length - 1];
    let [before, after] = candidates;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (this.wallClock(middle) <= wall) before = middle;
      else after = middle;
    }
    return before;
  }

  /** Last millisecond of a local date. */
  endOfDay(date: string): string {
    if (!isValidLocalDate(date)) {
      throw new Error(`Invalid local date: "${date}"`);
    }
    return new Date(this.lastInstantUpTo(Date.parse(`${date}T00:00:00Z`) + DAY_MS - 1)).toISOString();
  }

  /** First instant of a local date, which is not 00:00 where DST skips midnight. */
  startOfDay(date: string): string {
    if (!isValidLocalDate(date)) {
      throw new Error(`Invalid local date: "${date}"`);
    }
    return new Date(this.lastInstantUpTo(Date.parse(`${date}T00:00:00Z`) - 1) + 1).toISOString();
  }

  /** Moves an instant by whole local days, keeping its wall-clock time. */
  shiftDays(instant: Date | string, days: number): string {
    const wall = this.wallClock(new Date(instant).getTime()) + days * DAY_MS;
    const { candidates, exact } = this.resolve(wall);
    // A skipped time moves forward past the gap; a repeated one keeps its first occurrence.
    return new Date(exact[0] ?? candidates[1]).toISOString();
  }

  /** Local time of day as HH:MM. */
  toLocalTime(instant: Date | string): string {
    return new Date(this.wallClock(new Date(instant).getTime())).toISOString().slice(11, 16);
  }

  /** An instant as shown to users, always naming its timezone. */
  describe(instant: Date | string): string {
    return `${this.toLocalDate(instant)} ${this.toLocalTime(instant)} (${this.timezone})`;
  }

  assertValidSchedule(start: string, end: string): void {
    if (!isValidLocalDate(start)) {
      throw new Error(`Invalid sprint start date: "${start}"`);
    }
    if (!isValidLocalDate(end)) {
      throw new Error(`Invalid sprint end date: "${end}"`);
    }
    if (Date.parse(`${end}T00:00:00Z`) < Date.parse(`${start}T00:00:00Z`)) {
      throw new Error(`Sprint end date (${end}) cannot precede start date (${start})`);
    }
  }

  enumerateDays(start: string, end: string): string[] {
    this.assertValidSchedule(start, end);
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    const count = Math.round((endMs - startMs) / DAY_MS) + 1;
    const days: string[] = [];
    for (let i = 0; i < count; i += 1) {
      days.push(addLocalDays(start, i));
    }
    return days;
  }

  dayCount(start: string, end: string): number {
    return this.enumerateDays(start, end).length;
  }
}
