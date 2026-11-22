import type { Role, Sprint, SprintState } from '../model';
import { ProjectCalendar, isValidLocalDate, isValidSprintRange } from './ProjectCalendar';

export type SprintAction =
  | 'edit-plan'
  | 'allocate-items'
  | 'start-sprint'
  | 'complete-sprint'
  | 'view-analytics'
  | 'export-report';

const MANAGER_ROLES: ReadonlySet<Role> = new Set(['Product Owner', 'Scrum Master']);

export abstract class SprintDomain {
  protected readonly dto: Sprint;
  readonly calendar: ProjectCalendar;

  constructor(dto: Sprint, calendar: ProjectCalendar = new ProjectCalendar()) {
    this.dto = structuredClone(dto);
    this.calendar = calendar;
  }

  get id(): string {
    return this.dto.id;
  }

  get name(): string {
    return this.dto.name;
  }

  get goal(): string {
    return this.dto.goal;
  }

  abstract get state(): SprintState;

  get start(): string {
    return this.dto.start;
  }

  get end(): string {
    return this.dto.end;
  }

  get pointCapacity(): number {
    return this.dto.pointCapacity;
  }

  get hourCapacity(): number {
    return this.dto.hourCapacity;
  }

  get originalItemIds(): readonly string[] {
    return [...this.dto.originalItemIds];
  }

  get frozenPoints(): Readonly<Record<string, number>> {
    return { ...this.dto.frozenPoints };
  }

  get initialCommitment(): number {
    return this.dto.originalItemIds.reduce(
      (sum, itemId) => sum + (this.dto.frozenPoints[itemId] ?? 0),
      0,
    );
  }

  hasValidSchedule(): boolean {
    return isValidSprintRange(this.dto.start, this.dto.end);
  }

  /** The recorded start. Null for planned sprints and for legacy rows without one. */
  get startedAt(): string | null {
    return this.dto.startedAt ? new Date(this.dto.startedAt).toISOString() : null;
  }

  /** Planned end dates are exclusive: the sprint's time is up at local midnight (Bolt 002). */
  plannedEnd(): string | null {
    return isValidLocalDate(this.dto.end) ? this.calendar.startOfDay(this.dto.end) : null;
  }

  /** Requirements section 5.5. Null when it cannot be known without inventing a start. */
  idealRemainingAt(instant: string): number | null {
    const plannedEnd = this.plannedEnd();
    if (!plannedEnd) return null;
    const at = Date.parse(instant);
    const end = Date.parse(plannedEnd);
    if (at >= end) return 0;
    if (!this.startedAt) return null;
    const start = Date.parse(this.startedAt);
    if (at < start) return null;
    return Math.round(this.initialCommitment * (1 - (at - start) / (end - start)) * 10) / 10;
  }

  /** Preflight only; the database makes the final decision. */
  canStartAt(_now: Date | string = new Date()): boolean {
    return false;
  }

  calendarDays(): string[] {
    return this.calendar.enumerateDays(this.dto.start, this.dto.end);
  }

  protected isManager(role: Role): boolean {
    return MANAGER_ROLES.has(role);
  }

  abstract availableActions(role: Role): SprintAction[];
  abstract timelineCutoff(now?: Date | string): string | null;
  abstract isTodayPartial(now?: Date | string): boolean;

  canPerform(role: Role, action: SprintAction): boolean {
    return this.availableActions(role).includes(action);
  }

  toJSON(): Sprint {
    return structuredClone(this.dto);
  }
}

export class PlannedSprint extends SprintDomain {
  get state(): SprintState {
    return 'planned';
  }

  availableActions(role: Role): SprintAction[] {
    const actions: SprintAction[] = ['view-analytics'];
    if (this.isManager(role)) {
      actions.unshift('edit-plan', 'allocate-items');
      if (this.hasValidSchedule()) {
        actions.push('start-sprint');
      }
    }
    return actions;
  }

  override canStartAt(now: Date | string = new Date()): boolean {
    return (
      this.hasValidSchedule() &&
      this.end > this.start &&
      this.calendar.toLocalDate(now) < this.end
    );
  }

  timelineCutoff(): string | null {
    return null;
  }

  isTodayPartial(): boolean {
    return false;
  }
}

export class ActiveSprint extends SprintDomain {
  get state(): SprintState {
    return 'active';
  }

  availableActions(role: Role): SprintAction[] {
    const actions: SprintAction[] = ['view-analytics', 'export-report'];
    if (this.isManager(role)) {
      actions.unshift('allocate-items', 'complete-sprint');
    }
    return actions;
  }

  timelineCutoff(now: Date | string = new Date()): string {
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid active sprint cutoff instant: "${String(now)}"`);
    }
    const iso = date.toISOString();
    // A browser clock slightly behind the database must not precede the recorded start.
    return this.startedAt && this.startedAt > iso ? this.startedAt : iso;
  }

  /** A running sprint's today is always incomplete, including early starts and overruns. */
  isTodayPartial(): boolean {
    return true;
  }
}

export class CompletedSprint extends SprintDomain {
  get state(): SprintState {
    return 'completed';
  }

  get completedAt(): string | undefined {
    return this.dto.completedAt ?? this.dto.result?.cutoff;
  }

  availableActions(): SprintAction[] {
    return ['view-analytics', 'export-report'];
  }

  timelineCutoff(): string | null {
    const frozen = this.dto.result?.cutoff ?? this.dto.completedAt;
    if (frozen) {
      return new Date(frozen).toISOString();
    }
    return isValidLocalDate(this.dto.end) ? this.calendar.endOfDay(this.dto.end) : null;
  }

  isTodayPartial(): boolean {
    return false;
  }
}

export function createSprintDomain(dto: Sprint, timezone = 'Asia/Karachi'): SprintDomain {
  // The zone frozen at start wins over the project's current setting.
  const calendar = new ProjectCalendar(dto.timezone ?? timezone);
  switch (dto.state) {
    case 'planned':
      return new PlannedSprint(dto, calendar);
    case 'active':
      return new ActiveSprint(dto, calendar);
    case 'completed':
      return new CompletedSprint(dto, calendar);
    default: {
      const exhaustive: never = dto.state;
      throw new Error(`Unsupported sprint state: ${String(exhaustive)}`);
    }
  }
}