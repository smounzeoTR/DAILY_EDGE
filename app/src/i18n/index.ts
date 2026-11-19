import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import fr from './fr.json';
import { defaultLanguage, resolveLanguage } from './language';

export const resources = {
  fr: { translation: fr },
  en: { translation: en },
} as const;

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(getLocales()[0].languageCode),
  fallbackLng: defaultLanguage,
  interpolation: { escapeValue: false },
});

export default i18n;
