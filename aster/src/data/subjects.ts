import type { SubjectId, SubjectMeta } from '../types';

export const SUBJECTS: SubjectMeta[] = [
  { id: 'maths', name: 'Mathematics', code: '0580', color: '#2F54D6', tint: 'var(--tint-maths)' },
  { id: 'accounting', name: 'Accounting', code: '0452', color: '#0C8A6A', tint: 'var(--tint-accounting)' },
  { id: 'cs', name: 'Computer Science', code: '0478', color: '#7447D1', tint: 'var(--tint-cs)' },
  { id: 'business', name: 'Business Studies', code: '0450', color: '#C9710C', tint: 'var(--tint-business)' },
  { id: 'english', name: 'English Language', code: '0500', color: '#C23A63', tint: 'var(--tint-english)' },
];

export const subjectMeta = (id: SubjectId) => SUBJECTS.find((s) => s.id === id)!;
export const isSubjectId = (v: string | undefined): v is SubjectId => SUBJECTS.some((s) => s.id === v);
export const STEP_NAMES = ['Video', 'Notes', 'Questions', 'Revise'] as const;
