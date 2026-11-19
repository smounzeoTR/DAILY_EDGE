import 'i18next';

import type fr from './fr.json';

// Typed translation keys, French is the reference
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof fr };
  }
}
