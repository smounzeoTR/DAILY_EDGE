import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { storage, storageKeys } from '@/lib/storage';

import en from './en.json';
import fr from './fr.json';
import { defaultLanguage, resolveLanguage, type Language } from './language';

export const resources = {
  fr: { translation: fr },
  en: { translation: en },
} as const;

// Saved choice first, then device language
function initialLanguage(): Language {
  const saved = storage.getItemSync(storageKeys.language);
  return saved === 'fr' || saved === 'en' ? saved : resolveLanguage(getLocales()[0].languageCode);
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: defaultLanguage,
  interpolation: { escapeValue: false },
});

export function currentLanguage(): Language {
  return resolveLanguage(i18n.language);
}

export async function setLanguage(language: Language): Promise<void> {
  storage.setItemSync(storageKeys.language, language);
  await i18n.changeLanguage(language);
}

export default i18n;
