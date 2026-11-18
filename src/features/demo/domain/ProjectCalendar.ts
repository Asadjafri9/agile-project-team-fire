
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

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
    this.formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
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
