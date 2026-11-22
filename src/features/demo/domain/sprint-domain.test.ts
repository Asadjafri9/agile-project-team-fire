import { describe, expect, it } from 'vitest';
import { cloneInitialState } from '../model';
import {
  ActiveSprint,
  CompletedSprint,
  PlannedSprint,
  ProjectCalendar,
  SprintDomain,
  createSprintDomain,
  isValidLocalDate,
  isValidSprintRange,
} from './index';

describe('Bolt 001: ProjectCalendar value object', () => {
  it('validates local YYYY-MM-DD dates and preserves issue #13 range checks', () => {
    expect(isValidLocalDate('2026-10-19')).toBe(true);
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('0202-10-19')).toBe(false);
    expect(isValidLocalDate('')).toBe(false);

    expect(isValidSprintRange('2026-10-19', '2026-10-30')).toBe(true);
    expect(isValidSprintRange('2026-10-19', '2026-10-19')).toBe(true);
    expect(isValidSprintRange('2026-10-30', '2026-10-19')).toBe(false);
    expect(isValidSprintRange('', '2026-10-19')).toBe(false);
  });

  it('enumerates inclusive calendar days including weekends', () => {
    const cal = new ProjectCalendar('Asia/Karachi');
    const days = cal.enumerateDays('2026-10-16', '2026-10-19');
    expect(days).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']);
    expect(cal.dayCount('2026-10-16', '2026-10-19')).toBe(4);
    expect(() => cal.enumerateDays('2026-10-20', '2026-10-19')).toThrow();
  });

  it('handles Asia/Karachi midnight boundaries accurately', () => {
    const cal = new ProjectCalendar('Asia/Karachi');
    expect(cal.toLocalDate('2026-10-19T18:59:59.000Z')).toBe('2026-10-19');
    expect(cal.toLocalDate('2026-10-19T19:00:00.000Z')).toBe('2026-10-20');
    expect(cal.toLocalDate('2026-10-19T20:00:00.000Z')).toBe('2026-10-20');
  });

  it('handles America/New_York daylight saving transitions (spring forward & fall back)', () => {
    const ny = new ProjectCalendar('America/New_York');
    expect(ny.toLocalDate('2026-03-08T06:59:59.000Z')).toBe('2026-03-08');
    expect(ny.toLocalDate('2026-03-08T07:00:00.000Z')).toBe('2026-03-08');
    expect(ny.enumerateDays('2026-03-07', '2026-03-09')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);

    expect(ny.toLocalDate('2026-11-01T03:59:59.000Z')).toBe('2026-10-31');
    expect(ny.toLocalDate('2026-11-01T04:00:00.000Z')).toBe('2026-11-01');
  });
});

describe('Bolt 001: Polymorphic Sprint hierarchy & JSON factory', () => {
  const fixedNow = new Date('2026-11-15T09:00:00Z');
  const project = cloneInitialState(fixedNow).projects[0];
  const s1Dto = project.sprints.find(s => s.id === 's1')!;
  const s2Dto = project.sprints.find(s => s.id === 's2')!;
  const s3Dto = project.sprints.find(s => s.id === 's3')!;

  it('hydrates matching subclasses from JSON DTOs and round-trips cleanly', () => {
    const completed = createSprintDomain(s1Dto, project.timezone);
    const active = createSprintDomain(s2Dto, project.timezone);
    const planned = createSprintDomain(s3Dto, project.timezone);

    expect(completed).toBeInstanceOf(SprintDomain);
    expect(completed).toBeInstanceOf(CompletedSprint);
    expect(active).toBeInstanceOf(SprintDomain);
    expect(active).toBeInstanceOf(ActiveSprint);
    expect(planned).toBeInstanceOf(SprintDomain);
    expect(planned).toBeInstanceOf(PlannedSprint);

    expect(completed.toJSON()).toEqual(s1Dto);
    expect(active.toJSON()).toEqual(s2Dto);
    expect(planned.toJSON()).toEqual(s3Dto);
  });

  it('enforces state-specific actions and cutoff behavior polymorphically', () => {
    const planned = createSprintDomain(s3Dto, project.timezone);
    const active = createSprintDomain(s2Dto, project.timezone);
    const completed = createSprintDomain(s1Dto, project.timezone);

    expect(planned.timelineCutoff(fixedNow)).toBeNull();
    expect(planned.isTodayPartial(fixedNow)).toBe(false);
    expect(planned.canPerform('Scrum Master', 'start-sprint')).toBe(true);
    expect(planned.canPerform('Scrum Master', 'edit-plan')).toBe(true);
    expect(planned.canPerform('Developer', 'start-sprint')).toBe(false);

    expect(active.timelineCutoff(fixedNow)).toBe('2026-11-15T09:00:00.000Z');
    expect(active.isTodayPartial(fixedNow)).toBe(true);
    expect(active.canPerform('Product Owner', 'complete-sprint')).toBe(true);
    expect(active.canPerform('Viewer', 'complete-sprint')).toBe(false);

    expect(completed.timelineCutoff(fixedNow)).toBe(new Date(s1Dto.completedAt!).toISOString());
    expect(completed.isTodayPartial(fixedNow)).toBe(false);
    expect(completed.canPerform('Product Owner', 'complete-sprint')).toBe(false);
    expect(completed.canPerform('Product Owner', 'allocate-items')).toBe(false);
    expect(completed.availableActions('Product Owner')).toEqual(['view-analytics', 'export-report']);
  });

  it('prevents PlannedSprint start action when schedule dates are invalid', () => {
    const invalidPlanned = createSprintDomain({ ...s3Dto, start: '2026-11-20', end: '2026-11-10' });
    expect(invalidPlanned.hasValidSchedule()).toBe(false);
    expect(invalidPlanned.canPerform('Product Owner', 'start-sprint')).toBe(false);
  });
});