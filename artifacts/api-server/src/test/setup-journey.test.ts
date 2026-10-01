import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../domain/concierge-core';
import { canNavigateSetup, nextSetupStep, setupWorkflow, SETUP_STEPS } from '../domain/concierge-workflow';

describe('Setup journey', () => {
 it('blocks unvisited future sections and allows completed sections after returning', () => {
  expect(canNavigateSetup('company', 'branches', [], false)).toBe(false);
  expect(canNavigateSetup('branches', 'review', [], true)).toBe(false);
  expect(canNavigateSetup('services', 'branches', ['branches'], true)).toBe(true);
  expect(canNavigateSetup('branches', 'staff', ['branches', 'services', 'rooms'], true)).toBe(false);
  expect(canNavigateSetup('branches', 'staff', ['branches', 'services', 'rooms'], true, ['staff'])).toBe(true);
  expect(canNavigateSetup('branches', 'staff', SETUP_STEPS, true)).toBe(true);
  expect(canNavigateSetup('branches', 'review', SETUP_STEPS, true)).toBe(true);
 });
 it('persists a selected section without discarding completed sections or draft data', () => {
  const state = { draft: emptyDraft(), companyProfile: { name: 'Clinic' }, completedSteps: [...SETUP_STEPS], activeSetupStep: 'services' as const };
  const before = structuredClone(state);
  expect(setupWorkflow(state, 'ar').step).toBe('services');
  expect(setupWorkflow(state, 'en').completed).toEqual(SETUP_STEPS);
  expect(state).toEqual(before);
  expect(setupWorkflow({ ...state, companyProfile: null }, 'en').step).toBe('company');
  expect(setupWorkflow({ ...state, serviceWizard: true, activeSetupStep: 'branches' }, 'en').total).toBe(1);
 });
 it('advances in order and skips rooms only when explicitly allowed', () => {
  expect(SETUP_STEPS.map(step => nextSetupStep(step))).toEqual(['services', 'rooms', 'staff', 'review']);
  expect(nextSetupStep('services', true)).toBe('staff');
  expect(nextSetupStep('branches', true)).toBe('services');
 });
});
