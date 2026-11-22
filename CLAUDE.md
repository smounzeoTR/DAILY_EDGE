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
| Importer le catalogue | `npm run import:catalog` (lit `data/catalogue.xlsx`, écrit `supabase/seed.sql`, puis `supabase db reset`) |
| Tests base de données (pgTAP) | `npm run test:db` (= `supabase test db`, fichiers dans `supabase/tests/database/`) |
| Tests d'intégration (Edge Functions) | `npm run test:integration` (Supabase local lancé ; après une nouvelle fonction ou un changement de `config.toml` : `supabase stop && supabase start`) |
| Vérifier les Edge Functions (Deno) | `npm run check:functions` (`deno check` + `deno lint`, inclus dans `npm run typecheck`) |
| Appeler `generate-plan` en local | `POST http://127.0.0.1:54321/functions/v1/generate-plan` avec `Authorization: Bearer <JWT utilisateur>` et `{ "date"?: "YYYY-MM-DD" }` |
| Génération de secours (pg_cron) en local | tâche horaire `generate-plans-batch` ; déclencher à la main : `docker exec supabase_db_daily-edge psql -U postgres -c "select public.trigger_plans_batch()"`, réponse dans `net._http_response`. Valeurs locales : `supabase/seeds/local_dev.sql` (Vault) et `[edge_runtime.secrets]` de `config.toml` |
| Génération de secours en production | créer dans Vault `plans_batch_url` (URL de la fonction) et `plans_batch_secret` (secret aléatoire), et `supabase secrets set PLANS_BATCH_SECRET=<même secret>` ; ne jamais exécuter `seeds/local_dev.sql` en production |
| Types TypeScript de la base | `npm run gen:types` (après chaque migration ; écrit `app/src/lib/database.types.ts` et `supabase/functions/_shared/database.types.ts`) |
| SQL dans la base locale | `docker exec -it supabase_db_daily-edge psql -U postgres` (psql n'est pas installé sur le Mac) |
| Démarrer l'app | `cd app && npx expo start` (QR code pour Expo Go ; `--tunnel` si réseau filtrant ; `-c` pour vider le cache) |
| Démarrer sur le simulateur iOS | `cd app && npx expo start --ios` (ou touche `i` dans Metro) ; mode sombre : `xcrun simctl ui booted appearance dark` |
| Forcer Expo Go (expo-dev-client installé) | `cd app && npx expo start --go --ios` |
| Rebuild du development build (nouveau module natif) | `cd app && npx expo prebuild --platform ios && cd ios && pod install`, puis ⌘R dans Xcode |
| Se connecter en local | e-mail quelconque dans l'app, puis le code à 6 chiffres dans Mailpit (http://127.0.0.1:54324) |
| Config Supabase modifiée (`config.toml`, modèles d'e-mail) | `supabase stop && supabase start` (un `db reset` ne recharge pas la config) |
| Tests de bout en bout (simulateur iOS, Maestro) | Metro lancé (`cd app && npx expo start --go`), simulateur démarré, puis `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && maestro test app/e2e/<scénario>.yaml -e APP_URL=exp://127.0.0.1:8081`. `APP_URL` est obligatoire : aucun scénario ne le définit dans un bloc `env` (il écraserait la valeur passée par `-e`). Scénarios : `lot2-sign-in-onboarding`, `lot4-full-day`, `lot4-reminders-allow`, `lot5-library-progress`, `lot6-settings`, `lot6-review-demo` `lot7-premium-admin`, `lot8-guide-notes` et `lot9-coach` (après `npm run seed:demo`, qui recrée aussi le compte admin et donc son facteur TOTP) ; sous-scénarios dans `app/e2e/subflows/`. Installation : `brew install openjdk mobile-dev-inc/tap/maestro` (pas le cask `maestro`) |
| Tests (moteur, i18n, scripts) | `npm test` (= `vitest run`), `npm run test:watch` |
| Données de démonstration (local uniquement) | `npm run seed:demo` (recrée `demo@daily-edge.local`, code de connexion dans Mailpit ; refuse une URL Supabase non locale) |
| Export de mes données (Edge Function) | `POST /functions/v1/export-my-data` avec le JWT de l'utilisateur |
| Me nommer admin (local ; en production, même requête dans l'éditeur SQL) | `docker exec supabase_db_daily-edge psql -U postgres -c "update public.profiles set role = 'admin' where user_id = (select id from auth.users where email = '<mon e-mail>')"` ; au premier accès à l'administration, activer la double authentification (TOTP) dans l'app. Compte admin local tout prêt : `admin@daily-edge.local` (`npm run seed:demo`) |
| IA en local | Fournisseur factice (`LLM_PROVIDER = "mock"`, délai 1,5 s) dans `[edge_runtime.secrets]` de `config.toml` : aucun appel réseau. Variables documentées dans `supabase/functions/.env.example` |
| IA en production | `supabase secrets set LLM_PROVIDER=anthropic LLM_MODEL=claude-haiku-5-5 ANTHROPIC_API_KEY=... LLM_PRICE_IN_EUR_PER_MTOK=... LLM_PRICE_OUT_EUR_PER_MTOK=...` (prix à revérifier, lot 10) ; sans fournisseur ni modèle, les règles seules s'appliquent |
| Essai manuel d'un vrai fournisseur (facultatif, payant) | copier `supabase/functions/.env.example` en `.env.llm` à la racine (ignoré par Git), renseigner la clé, puis `npm run llm:smoke` (charge fictive ; s'arrête sans clé) |
| Assistant Coach Edge en local | Fournisseur factice (`LLM_ASSISTANT_PROVIDER = "mock"`) dans `[edge_runtime.secrets]` de `config.toml` ; réponse en flux (SSE) de `POST /functions/v1/assistant-chat` avec `{ "thread_id"?, "message" }` |
| Évaluation de l'assistant (manuelle, payante) | renseigner `LLM_ASSISTANT_*` et la clé dans `.env.llm`, Supabase local lancé, puis `npm run assistant:eval` (comparer : `npm run assistant:eval -- --model claude-sonnet-5-5 --price-in 2 --price-out 10`) ; rapport dans `scripts/assistant-eval/results/` (non versionné) |
| Quota de l'assistant | `update public.app_settings set value = '30' where key = 'assistant_daily_messages'` |
| Interrupteur premium | autorisé si `app_settings.allow_plan_toggle` est vrai (vrai seulement par `seeds/local_dev.sql`) ; ne jamais l'activer en production |
| Typecheck (racine + app) | `npm run typecheck` |
| Lint | `npm run lint` |
| Formatage | `npm run format` / `npm run format:check` |
| Diagnostic Expo | `cd app && npx expo-doctor` |

À lancer avant de déclarer un lot terminé : `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:db && npm run test:integration`, puis les scénarios Maestro de `app/e2e/` sur le simulateur.

Notes :
- Sur le téléphone, `localhost` désigne le téléphone : `EXPO_PUBLIC_SUPABASE_URL` doit pointer vers l'IP locale du Mac (voir `app/.env.example`).
- `npx expo lint` refuse ESLint 9.39 (bug de détection) : le script `lint` appelle `eslint .` directement.
- Moteur : imports relatifs avec extension `.ts` (exigé par Deno, accepté par Vitest).
- Edge Functions : dépendances npm épinglées dans le `deno.json` de chaque fonction. Deno refuse les versions publiées depuis moins d'environ un jour : épingler une version un peu plus ancienne si besoin.
- Moteur : `buildPlan` ne lit jamais l'horloge ; la date du plan est calculée par l'Edge Function dans le fuseau de l'utilisateur.
- `app/.env` : `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clé `sb_publishable_…` de `supabase status`).
- Routage (Expo Router, `Stack.Protected`) : non connecté → `(public)` (présentation, une fois par appareil, puis connexion) ; connecté sans `onboarded_at` → `(onboarding)` ; sinon → `(app)`.
- Stockage local (session, brouillon d'onboarding, préférences) : `app/src/lib/storage.ts` (expo-sqlite, non chiffré en V1).
- Navigation : `(app)/(tabs)/` (today, progress, library) ; fiches `(app)/exercise/[id]` et `(app)/principle/[id]` ; check-in et rappels en modales. Les onglets rechargent leurs données à chaque visite (`useFocusEffect`).
- Exercices ajoutés depuis la bibliothèque : `plan_items.origin = 'user'`, via `add_exercise_to_today` (crée au besoin un plan vide, `generated_at` NULL, complété par `generate-plan`). Seuls les items `engine` font avancer le programme et décident si un plan est « touché ».
- Maestro : un champ de texte se lit « étiquette texte indicatif » ; cibler par expression régulière (`'Étiquette.*'`). Fermer la bulle d'aide du clavier iOS avec `subflows/dismiss-keyboard-tip.yaml`.
- Écritures serveur contrôlées : résultat d'exercice via `set_plan_item_result`, check-in via `upsert_checkin`, habitude proposée via `add_habit_from_template` (plus d'écriture directe sur `plan_items` ni `checkins`). Coches d'habitude : jour même et veille seulement (RLS).
- Code partagé app / Edge Functions : `supabase/functions/_shared/habits/` (périodes, taux d'habitude) importé dans l'app via l'alias `@shared/*` (tsconfig + `app/metro.config.js` `watchFolders`). Après un changement d'alias ou de `metro.config.js` : `npx expo start -c` (cache Metro).
- IA : `supabase/functions/_shared/llm/` (interface, fournisseurs, tâches plan et bilan, `runTask` : 8 s, une nouvelle tentative, plafond de 3 appels par jour pour plan + bilan, hachage, journal `llm_calls`) et `_shared/ai/` (accès base, enrichissement). L'enrichissement tourne après la réponse (`EdgeRuntime.waitUntil`) et ne s'applique que par `apply_plan_enrichment` / `apply_review_enrichment` (plan non recalculé ni touché). La charge envoyée à l'IA ne contient jamais nom, e-mail, identifiant, réflexions ni notes.
- Guide (lot 8) : décisions pures dans `app/src/features/guide/` (`dayJourney`, `tabBadges`, `overlayToShow`) ; état serveur `user_guide_state` écrit par RPC. Une seule superposition par ouverture, rendue au-dessus d'Aujourd'hui (pas de `Modal` natif : iOS refuse d'en présenter un pendant la fermeture d'un autre). Les pastilles d'onglets lisent le cache TanStack via `useSyncExternalStore` (jamais de second `useQuery` sur la même clé).
- Maestro : un nouveau compte voit la visite guidée et le compte démo une célébration ; les scénarios appellent `subflows/dismiss-guide.yaml` après « Plus tard ». Centrer (`centerElement: true`) un bouton proche du bas avant de le toucher (sinon la barre d'onglets reçoit le tap).
- Assistant (lot 9) : `_shared/assistant/` (prompt versionné, filet de détresse, contexte minimisé, outils, orchestrateur `runChat` partagé par l'Edge Function et l'eval). Les outils d'écriture créent seulement une action en attente ; seule `confirm_assistant_action` écrit. Un plan ajusté par l'utilisateur (`user_adjusted_at`) n'est plus recalculé ni enrichi.
- Après une modification de `supabase/functions/_shared/`, le runtime Edge local peut servir l'ancienne version : `docker restart supabase_edge_runtime_daily-edge`.
- Jamais de fichier `supabase/functions/.env` : le runtime Edge local le charge et il remplace le fournisseur factice de `config.toml` (l'app et les tests d'intégration appelleraient alors le vrai modèle, payant). Les clés pour `llm:smoke` et `assistant:eval` vont dans `.env.llm` à la racine ; les tests d'intégration refusent de tourner si `supabase/functions/.env` existe.
- Ne pas utiliser `supabase migration down` en local : il réinitialise la base sans rejouer `seeds/local_dev.sql` (interrupteur premium, secrets Vault) ; préférer `supabase db reset`.
- Maestro : si le pilote iOS se fige (saisie bloquée) ou ne démarre pas, arrêter les processus `maestro`, relancer avec `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000`.
- Administration : lecture seule, RPC `admin_*` ; `is_admin()` exige le rôle admin et une session `aal2` (TOTP). En pgTAP, simuler l'aal2 avec `"aal":"aal2"` dans `request.jwt.claims`.
- Scripts Node (`scripts/`) : pas de propriétés de paramètre TypeScript (`constructor(readonly x)`) dans le code qu'ils importent (suppression des types de Node).
- Bilan de la semaine : `supabase/functions/_shared/review/` (fonction pure + génération partagée par `generate-review`, la génération de secours et `seed:demo`).
- Accessibilité : pour un élément à cocher, utiliser `accessibilityRole="switch"` (le rôle `checkbox` n'expose pas son état sur iOS) ; les textes enfants d'un `Pressable` étiqueté ne sont pas annoncés, les inclure dans l'étiquette ou `accessibilityValue`.

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
