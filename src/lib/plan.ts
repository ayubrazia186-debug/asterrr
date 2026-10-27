import type { ClassItem, PlanData, SubjectId, SubjectPlan } from '../types';
import { addDays, daysBetween, todayISO } from './dates';
import { SUBJECTS } from '../data/subjects';

export const isDone = (c: ClassItem) => c.steps.every(Boolean);
export const ticksOf = (c: ClassItem) => c.steps.filter(Boolean).length;
export const planClasses = (p?: SubjectPlan) => (p ? p.classes.filter((c) => c.section === 'plan') : []);
export const laterClasses = (p?: SubjectPlan) => (p ? p.classes.filter((c) => c.section === 'later') : []);

export interface Progress {
  total: number;
  done: number;
  started: number;
  /** share of all tick boxes ticked, 0..1 — same maths as the sheet's "Overall progress" */
  ratio: number;
  stepTicks: [number, number, number, number];
}

export function progressOf(classes: ClassItem[]): Progress {
  const stepTicks: [number, number, number, number] = [0, 0, 0, 0];
  let done = 0;
  let started = 0;
  classes.forEach((c) => {
    c.steps.forEach((s, i) => s && stepTicks[i]++);
    const t = ticksOf(c);
    if (t === 4) done++;
    else if (t > 0) started++;
  });
  const total = classes.length;
  const ratio = total ? stepTicks.reduce((a, b) => a + b, 0) / (total * 4) : 0;
  return { total, done, started, ratio, stepTicks };
}

export const behindOf = (classes: ClassItem[], today = todayISO()) =>
  classes.filter((c) => c.date && c.date < today && !isDone(c));

export const todayOf = (classes: ClassItem[], today = todayISO()) =>
  classes.filter((c) => c.date === today);

/** The first and last dates of the plan across all subjects. */
export function planSpan(plan: PlanData) {
  const dates = SUBJECTS.flatMap((s) => planClasses(plan[s.id]).map((c) => c.date!)).filter(Boolean).sort();
  if (!dates.length) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

export interface DayCell {
  date: string;
  dayNo: number;
  total: number;
  ticked: number;
  ratio: number;
  doneClasses: number;
  classes: number;
}

/** One cell per plan day, summing every subject. Used by the strip and the planner grid. */
export function dayCells(plan: PlanData): DayCell[] {
  const span = planSpan(plan);
  if (!span) return [];
  const n = daysBetween(span.start, span.end) + 1;
  const cells: DayCell[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(span.start, i);
    let classes = 0, doneClasses = 0, ticked = 0;
    SUBJECTS.forEach((s) =>
      planClasses(plan[s.id]).forEach((c) => {
        if (c.date !== date) return;
        classes++;
        ticked += ticksOf(c);
        if (isDone(c)) doneClasses++;
      }),
    );
    cells.push({ date, dayNo: i + 1, total: classes * 4, ticked, ratio: classes ? ticked / (classes * 4) : 0, doneClasses, classes });
  }
  return cells;
}

/** Classes per day needed to finish every remaining class by the plan's last day (same idea as the sheet's "Classes per day now"). */
export function pace(classes: ClassItem[], endDate: string, today = todayISO()) {
  const remaining = classes.filter((c) => !isDone(c)).length;
  const daysLeft = Math.max(1, daysBetween(today, endDate) + 1);
  return { remaining, daysLeft, perDay: remaining === 0 ? 0 : Math.ceil(remaining / daysLeft) };
}

export interface TopicGroup {
  topic: string;
  classes: ClassItem[];
  progress: Progress;
}

export function topicGroups(classes: ClassItem[]): TopicGroup[] {
  const map = new Map<string, ClassItem[]>();
  classes.forEach((c) => {
    const key = c.topic || 'Other';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  });
  return [...map.entries()].map(([topic, list]) => ({ topic, classes: list, progress: progressOf(list) }));
}

export const classKey = (subject: SubjectId, row: number) => `${subject}:${row}`;
