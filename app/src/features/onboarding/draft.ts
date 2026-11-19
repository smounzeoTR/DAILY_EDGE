// Onboarding draft kept on the device so an interrupted onboarding resumes.
import { readJson, storage, storageKeys, writeJson } from '@/lib/storage';

import { parseDraft, type Draft } from './draftSchema';

export function loadDraft(userId: string): Draft | null {
  return parseDraft(readJson<unknown>(storageKeys.onboardingDraft(userId)));
}

export function saveDraft(userId: string, draft: Draft): void {
  writeJson(storageKeys.onboardingDraft(userId), draft);
}

export function clearDraft(userId: string): void {
  storage.removeItemSync(storageKeys.onboardingDraft(userId));
}
