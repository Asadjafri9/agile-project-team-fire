import type { Role, Sprint, SprintState } from '../model';
import { ProjectCalendar, isValidSprintRange } from './ProjectCalendar';

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
    return date.toISOString();
  }

  isTodayPartial(now: Date | string = new Date()): boolean {
    if (!this.hasValidSchedule()) return false;
    const localToday = this.calendar.toLocalDate(now);
    return localToday >= this.dto.start && localToday <= this.dto.end;
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

  timelineCutoff(): string {
    const frozen = this.dto.result?.cutoff ?? this.dto.completedAt;
    if (frozen) {
      return new Date(frozen).toISOString();
    }
    return `${this.dto.end}T23:59:59.999Z`;
  }

  isTodayPartial(): boolean {
    return false;
  }
}

export function createSprintDomain(dto: Sprint, timezone = 'Asia/Karachi'): SprintDomain {
  const calendar = new ProjectCalendar(timezone);
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