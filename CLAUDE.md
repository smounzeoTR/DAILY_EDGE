# Daily Edge — instructions pour Claude Code

Daily Edge est un coach quotidien de développement personnel : chaque jour, un principe tiré des grands livres de réussite (Hill, Kiyosaki, Clear, Covey…), un exercice concret, de petites habitudes et un check-in du soir. Le programme s'adapte au vécu de l'utilisateur (énergie, temps disponible, réalisation).

- Produit porté par Trasenel, sous la marque distincte « Daily Edge » (aucune mention de Trasenel dans l'app).
- Multi-utilisateurs dès la V1 : le fondateur est le premier utilisateur, pas le seul.
- Bilingue français / anglais dès la V1 (français par défaut).
- Freemium : le gratuit fonctionne avec les règles seules ; l'IA (personnalisation, « pourquoi aujourd'hui » rédigé, bilan hebdo rédigé) est réservée au premium.

Documents de référence (à lire avant toute tâche structurante) :
- `docs/cahier-des-charges.md` — vision, écrans, moteur, schéma, RGPD.
- `docs/plan-v1.md` — découpage en lots, critères d'acceptation, ordre de travail.
- `docs/identite-visuelle.md` — couleurs, typographies, logo, ton.
- `docs/corrections-maquette.md` — écarts connus de la maquette Base44 à corriger.
- `data/` — export du catalogue de contenu (voir `data/README.md`).

Maquette validée (référence visuelle et fonctionnelle) : https://daily-edge-pro.base44.app/

## Pile technique

| Brique | Choix |
| --- | --- |
| App | Expo (SDK récent) + React Native + TypeScript strict, Expo Router (routes par fichiers) |
| Données côté app | `@supabase/supabase-js` + TanStack Query ; cache hors ligne (expo-sqlite) en fin de V1 |
| i18n | i18next + react-i18next + expo-localization ; fichiers `app/src/i18n/fr.json` et `en.json` |
| Styles | Jetons de thème dans `app/src/theme/` (clair + sombre), `StyleSheet` ; polices Space Grotesk + Inter via `@expo-google-fonts` |
| Rappels | Notifications locales `expo-notifications` (matin et soir, aux heures du profil) |
| Backend | Supabase région UE : Postgres, Auth, Row Level Security, Edge Functions (Deno), pg_cron |
| Moteur | Fonction pure TypeScript dans `supabase/functions/_shared/engine/`, testée avec Vitest depuis la racine |
| IA | Couche d'abstraction côté serveur (`supabase/functions/_shared/llm/`) : Anthropic et Mistral interchangeables, sortie JSON validée par schéma (zod) |

## Arborescence cible

```
DAILY_EDGE/
  app/                      # application Expo
    src/app/                # routes Expo Router (convention SDK 58) : (auth), (onboarding), (tabs)/today, progress, library, settings, checkin, weekly-review, admin
    src/components/ src/theme/ src/i18n/ src/lib/ (supabase, queries) src/features/
  supabase/
    migrations/             # SQL versionné
    functions/
      _shared/engine/       # moteur de plan (pur, sans I/O)
      _shared/llm/          # fournisseurs LLM
      generate-plan/        # appelée par le check-in et par pg_cron
      weekly-review/
    seed.sql                # généré par scripts/import-catalog
  scripts/import-catalog/   # lit data/*.xlsx ou *.csv → seed SQL
  data/                     # export du catalogue (source de vérité du contenu en V1)
  docs/
```

## Commandes

Prérequis : Node LTS, Docker Desktop lancé, Supabase CLI, Expo Go sur le téléphone. Deux `package.json` séparés (racine = tests et outillage, `app/` = application), sans workspaces.

| Action | Commande (depuis la racine sauf mention) |
| --- | --- |
| Installer les dépendances | `npm install && npm --prefix app install` |
| Ajouter une dépendance à l'app | `cd app && npx expo install <paquet>` (versions compatibles SDK) |
| Démarrer Supabase local | `supabase start` (API 54321, Studio http://127.0.0.1:54323, e-mails Mailpit http://127.0.0.1:54324) |
| Arrêter Supabase | `supabase stop` |
| Rejouer migrations + seed | `supabase db reset` |
| Nouvelle migration | `supabase migration new <nom>` |
| Clés et URL locales | `supabase status` |
| Démarrer l'app | `cd app && npx expo start` (QR code pour Expo Go ; `--tunnel` si réseau filtrant ; `-c` pour vider le cache) |
| Tests (moteur, i18n, scripts) | `npm test` (= `vitest run`), `npm run test:watch` |
| Typecheck (racine + app) | `npm run typecheck` |
| Lint | `npm run lint` |
| Formatage | `npm run format` / `npm run format:check` |
| Diagnostic Expo | `cd app && npx expo-doctor` |

À lancer avant de déclarer un lot terminé : `npm run typecheck && npm run lint && npm run format:check && npm test`.

Notes :
- Sur le téléphone, `localhost` désigne le téléphone : `EXPO_PUBLIC_SUPABASE_URL` doit pointer vers l'IP locale du Mac (voir `app/.env.example`).
- `npx expo lint` refuse ESLint 9.39 (bug de détection) : le script `lint` appelle `eslint .` directement.
- Moteur : imports relatifs avec extension `.ts` (exigé par Deno, accepté par Vitest).

## Règles de travail

- Avancer lot par lot selon `docs/plan-v1.md`. Avant de coder un lot, proposer un plan court et attendre mon accord ; à la fin, lancer typecheck, lint et tests, puis résumer ce qui a été fait et ce qui reste.
- Toute la communication avec moi se fait en français. Code, noms de tables, de colonnes et de variables en anglais. Commentaires en anglais, courts.
- Aucune chaîne d'interface en dur : tout passe par i18n, avec les deux langues renseignées.
- Contenu : afficher les champs `_fr` ou `_en` selon la langue ; seul le contenu au statut `published` est lu par l'app.
- Sécurité : RLS sur toutes les tables utilisateur (chaque utilisateur ne voit que ses lignes) ; jamais de clé `service_role` dans l'app ; appels LLM uniquement côté serveur ; secrets dans `.env` (non versionné) et dans les secrets Supabase.
- Le moteur reste une fonction pure (profil + historique + catalogue → plan). Chaque règle a ses tests de cas types.
- Toute décision du moteur est journalisée dans `engine_decisions`.
- Ton de l'app bienveillant, jamais culpabilisant : une série interrompue n'est jamais présentée négativement.
- Migrations SQL uniquement par nouveaux fichiers dans `supabase/migrations/` ; ne jamais modifier une migration déjà appliquée.
- Commits petits et fréquents, messages en anglais au format conventionnel (`feat:`, `fix:`…). Ne pas pousser sans que je le demande.
