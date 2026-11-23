# Daily Edge — Plan de développement de la V1

Onze lots, chacun livrable et testable seul. On ne commence un lot que lorsque le précédent est accepté. Cocher les cases au fil de l'eau.

## Lot 0 — Mise en place (½ journée)

- [ ] Prérequis vérifiés : Node LTS, Docker Desktop lancé, Supabase CLI (`brew install supabase/tap/supabase`), Expo Go sur le téléphone, Git.
- [x] `git init`, `.gitignore` (node_modules, .env*, .expo, supabase/.temp).
- [x] App Expo TypeScript avec Expo Router dans `app/` (`npx create-expo-app@latest app`), TypeScript strict, ESLint + Prettier.
- [x] `supabase init` à la racine, `supabase start` fonctionne en local.
- [x] Vitest à la racine pour les tests du moteur.
- [x] Jetons de thème clair/sombre, polices, composant Logo (voir `identite-visuelle.md`).
- [x] i18n FR/EN branché, détection de la langue du téléphone.
- [x] Section « Commandes » de `CLAUDE.md` complétée.

Acceptation : l'app s'ouvre dans Expo Go avec le logo et un texte traduit ; `supabase start` et `npx vitest` passent.

## Lot 1 — Base de données et catalogue

- [x] Migrations : tables de contenu, tables utilisateur, `engine_decisions`, types énumérés, index.
- [x] RLS : contenu lisible si `published` ; tables utilisateur limitées à `auth.uid()` ; écriture du contenu réservée au rôle admin.
- [x] Création automatique de `profiles` et `subscriptions` (free) à l'inscription (trigger sur `auth.users`).
- [x] `scripts/import-catalog` : lit l'export de `data/` (xlsx ou csv), normalise (« — » → vide, « Non » → non répétable, « Tous », listes « S01, S04 » → tables de liaison, statuts → enum), génère `supabase/seed.sql`, signale les références cassées.
- [x] Types TypeScript générés (`supabase gen types typescript --local`).

Acceptation : `supabase db reset` charge 15 sources, 115 principes, 287 exercices, 42 habitudes, 4 programmes et 112 étapes sans erreur ; un test vérifie qu'un utilisateur ne lit pas les données d'un autre.

## Lot 2 — Accueil, authentification et onboarding

- [x] Splash, 3 écrans de présentation (avec les corrections de `corrections-maquette.md`), connexion par code à 6 chiffres envoyé par e-mail (OTP). Lien magique abandonné en V1 : liens profonds non fiables dans Expo Go (décision du 21 novembre 2026).
- [x] 12 questions, une par écran, barre de progression, « Passer » sauf Q1.
- [x] Consentements séparés, écran « Ton programme » (règle d'attribution), choix de 3 habitudes filtrées, signal modifiable.
- [x] Écriture de `goals`, `profiles`, `user_habits`, `program_start_date`, `program_day = 1` en une transaction (fonction Postgres `complete_onboarding`) ; brouillon local si l'app est fermée en cours de route.

Acceptation : un nouvel utilisateur termine l'onboarding en moins de 5 minutes et arrive sur Aujourd'hui avec son programme et ses 3 habitudes.

## Lot 3 — Moteur de plan

- [x] Fonction pure `buildPlan(input) → { mode, principleId, items[], whyToday, rulesFired[] }` dans `supabase/functions/_shared/engine/`.
- [x] Modes reprise / minimal / normal, avancement du programme, habitude introduite, mode catalogue après le jour 28 (filtres + score), exclusions (note 1/5, sauté 2 fois), « pourquoi aujourd'hui » par règles en FR et EN.
- [x] Tests Vitest : au moins un cas par règle de `cahier-des-charges.md` § 5.
- [x] Edge Function `generate-plan` : charge les données, appelle `buildPlan`, écrit `daily_plans`, `plan_items`, `engine_decisions` ; idempotente pour une date donnée.

Acceptation : tous les tests passent ; appeler la fonction deux fois pour la même date ne crée pas de doublon.

## Lot 4 — Aujourd'hui et check-in du soir

- [x] Écran Aujourd'hui complet (§ 3.2), saisie selon `proof_type`, « Fait » + étoiles, « Pas le temps », « Trop dur ».
- [x] Coche des habitudes et version minimale en un geste.
- [x] Génération du plan à la première ouverture s'il n'existe pas.
- [x] Check-in du soir (§ 3.3) → appel de `generate-plan` pour le lendemain.
- [x] Quand l'exercice du jour J passe à « fait », rappeler `generate-plan` pour J+1 (recalcul du plan de demain s'il existe et n'a pas été touché : c'est ce qui fait avancer le programme si l'exercice est fait après le check-in).
- [x] Notifications locales matin et soir, replanifiées quand les heures changent.
- [x] pg_cron : génération de secours à 2 h locale pour les utilisateurs sans plan.

Acceptation : sur le téléphone, une journée complète (exercice, habitudes, check-in) produit le plan du lendemain dans le bon mode.

## Lot 5 — Progression et bibliothèque

- [x] Progression (§ 3.4) : série, taux 7 j et 30 j, taux par habitude, objectif, énergie 14 j, réflexions.
- [x] Bibliothèque (§ 3.5) : filtres, recherche, favoris, « Ajouter à ma journée ».

## Lot 6 — Bilan de la semaine et réglages

- [x] Bilan hebdo par règles (§ 3.6), propositions acceptées ou refusées et appliquées.
- [x] Montée de niveau durable : le bilan hebdo propose de passer au niveau supérieur (`profiles.level`) après 2 semaines au-dessus de 85 % de réalisation ; l'utilisateur accepte ou refuse.
- [x] Réglages complets (§ 3.7), export JSON, suppression du compte (marquage puis purge à 30 jours).
- [x] Script de données de démonstration (§ 8).

## Lot 7 — Premium, IA et administration

- [x] Interrupteur gratuit / premium (table `subscriptions`, `is_premium`, `dev_set_plan` autorisé par `app_settings.allow_plan_toggle`).
- [x] Couche `_shared/llm/` : interface commune, fournisseurs Anthropic et Mistral, choix par variable d'environnement, validation zod, repli ; journal `llm_calls`, plafond quotidien, réutilisation par hachage.
- [x] Choix et personnalisation premium dans `generate-plan` (en arrière-plan), bilan hebdo rédigé par l'IA.
- [x] Écrans admin en lecture seule (le contenu reste édité dans le Sheet) : statistiques par exercice, journal du moteur, coût IA par jour ; MFA obligatoire (aal2).
- [x] Échéance de l'objectif vérifiée par la base à chaque modification.

## Lot 8 — Guide quotidien et carnet de notes (§ 3.9)

- [x] Parcours du jour en 4 pastilles (Principe → Exercice → Habitudes → Check-in) en haut d'Aujourd'hui, prochaine étape mise en avant, défilement vers la carte.
- [x] Pastilles sur les onglets : Aujourd'hui (check-in en attente, habitude introduite proposée), Progression (bilan en attente) ; pas sur Bibliothèque.
- [x] Première semaine accompagnée : visite guidée le jour 1 (« Passer » toujours visible), une astuce par jour du jour 2 au jour 7 ; état enregistré côté serveur.
- [x] « ? » sur chaque carte et page « Comment ça marche » dans les Réglages.
- [x] Mes notes : notes rattachées à un principe ou à un exercice, visibles sur la fiche et dans l'onglet « Mes notes » de la Bibliothèque ; RLS, export, suppression avec le compte ; jamais envoyées à l'IA.
- [x] Étapes célébrées sobrement (7 jours de série, semaine 1, programme terminé, objectif atteint).
- [x] Une seule superposition par ouverture (visite, célébration, astuce).
- [x] Tests (pgTAP, Vitest, Maestro), textes FR et EN.

## Lot 9 — Assistant Coach Edge (premium, § 3.10)

- [x] Edge Function `assistant-chat` en streaming, accès premium + `consent_ai`, compte non en cours de suppression.
- [x] Couche `_shared/llm/` : outils (tool use) et `stream()` pour Anthropic, Mistral et le fournisseur factice (interface prévue au lot 7).
- [x] Outils serveur `get_today`, `adapt_today`, `swap_exercise`, `save_exercise_result`, `add_habit`, `update_goal_progress`, `search_catalog`, `get_week_summary` ; les outils qui écrivent renvoient une proposition, appliquée seulement après « Appliquer » (mêmes RPC et mêmes règles que l'app).
- [x] Tables `assistant_threads` et `assistant_messages` (RLS, export, effacement, purge à 90 jours).
- [x] Données minimales ; bouton « Partager avec le coach » sur une note ou une réflexion (un texte, action explicite) ; garde-fous (pas de conseil médical, financier ni juridique ; 3114 en cas de détresse).
- [x] Quota quotidien de messages propre à l'assistant (30 par défaut, configurable) dans `llm_calls`, historique résumé au-delà d'une certaine longueur, coût dans l'écran admin.
- [x] Plan ajusté à la demande (`user_adjusted_at`) : jamais recalculé ni enrichi ; échange limité au principe de l'étape en mode programme.
- [x] Évaluation manuelle `npm run assistant:eval`.
- [x] Tests avec le fournisseur factice (outils, confirmation, quota, minimisation), Maestro.

## Lot 10 — Finitions et bêta

- [x] (10b) Import du catalogue par mise à jour : `npm run deploy -- catalog --env <env>` (simulation par défaut, `--apply` en une transaction, idempotent, contenu absent passé en `retired`, jamais supprimé).
- [x] (10b, prix relevés le 23 novembre 2026) Revérifier sur la grille officielle les prix des modèles (`claude-haiku-5-5` pour le plan et le bilan, `claude-sonnet-5-5` pour l'assistant) indiqués dans `supabase/functions/.env.example` avant la production, Décision du 22 novembre 2026 : Sonnet pour l'assistant pendant la bêta, Haiku pour le plan et le bilan ; réévaluer pour le lancement avec l'usage réel (coût mesuré, cache compris).
- [x] (10b) Tarifs du cache vérifiés et reportés (Sonnet 5.5 : lecture à 0,05 × l'entrée). Plafond mensuel de l'assistant (2 € par utilisateur) à réévaluer avec l'usage de la bêta.
- [x] (10a) Cache hors ligne du plan du jour, des résultats d'exercice et des coches (cache TanStack persisté et chiffré, file d'actions), synchronisation au retour du réseau ; le serveur fait foi : une action refusée au rejeu est abandonnée et signalée, jamais forcée. Check-in, assistant et Réglages restent en ligne.
- [x] (10a) Message bienveillant et ressources d'aide (3114, sinon numéro d'urgence local) si humeur ≤ 2 pendant 5 jours, une fois par épisode (`user_guide_state.support_seen`), seulement avec le consentement check-in.
- [x] (10a) Sentry (UE, sans donnée personnelle, sans consentement) et PostHog (UE, consentement « Mesure d'audience » désactivé par défaut, à l'onboarding et dans Réglages).
- [x] (10b) Pages légales FR (`legal/`, GitHub Pages, `legal.dailyedge.fr`, anciennement `dailyedge.trasenel.com`) avec les sections du document légal, liens dans l'onboarding et les Réglages. Textes définitifs et version EN à intégrer quand ils seront relus.
- [x] (10b) Déploiement par étapes (`npm run deploy -- <étape> --env recette|production`) : check, db, functions, secrets, vault, settings, auth, catalog, backup, restore ; recette obligatoire avant la production (`deploy/history.json`). Procédure : `docs/mise-en-ligne.md`.
- [ ] (10b) Premier déploiement complet en recette, contrôlé ensemble, puis test de restauration noté dans `docs/exploitation.md`.
- [x] (10b) `eas.json` (development, preview = recette, production), déclaration de chiffrement, `com.trasenel.dailyedge` réservé pour Android (pas d'Android pour la bêta). Réponses App Store : `docs/app-store.md`.
- [ ] (10b) Build EAS iOS de recette et TestFlight en test interne (comptes Apple et Expo à créer).
- [x] (10b) Âge minimum : case « J'ai 18 ans ou plus » en première étape de l'onboarding, imposée par le serveur (`confirm_adult_age`, `adult_confirmed_at`).
- [x] (10b) AI Act, art. 50 : mention « Coach Edge est une IA » en tête de chaque conversation et « Rédigé par l'IA » sur la consigne personnalisée et le « pourquoi aujourd'hui ».
- [x] (10b) Relecture des textes FR/EN (vocabulaire de santé et promesses de résultat retirés).
- [x] (10b) « Donner mon avis » (table `feedback`, RLS, version de l'app), premium accordé par l'admin (`admin_grant_premium`, aal2, journal `admin_audit`), indicateurs du § 9 (`admin_metrics`), alertes d'exploitation (`ops_alerts`, e-mail Scaleway par `ops-alert`).
- [x] (10b) Exploitation : `docs/exploitation.md` (déploiement, retour arrière, rotation des secrets, sauvegardes et restauration, incident, purge).
- [x] (10b) Scénario Maestro `lot10b-beta` ; lot 6 indépendant du jour et de l'heure (`DEMO_NOW`, `check-review-window.ts`).
- [x] (10a) Stockage local chiffré : session, brouillon d'onboarding, file hors ligne et cache persisté chiffrés (AES-CTR, clé aléatoire dans le trousseau via SecureStore) ; les anciennes valeurs en clair sont rechiffrées à la première lecture, sans déconnexion.
- [x] (10a) Scénario Maestro `lot10a-robustness` (carte de soutien une seule fois, consentement à la mesure d'audience) ; compte `support@daily-edge.local` créé par `npm run seed:demo`.

### À faire après la fusion du lot 10 (domaine dailyedge.fr)

Reportées de la branche `feat/deploy-site`, qui ne touche pas à `app/` pendant le lot 10 :

- [ ] URL par défaut des pages légales dans l'app : `https://legal.dailyedge.fr` à la place de `https://dailyedge.trasenel.com` dans `app/src/features/legal/links.ts`, son test `links.test.ts` et `app/.env.example` (`EXPO_PUBLIC_LEGAL_BASE_URL`, aussi à corriger dans les variables EAS si elle y est définie).
- [ ] Site, lot S3b : préremplissage de l'onboarding avec le diagnostic du site (« On a retrouvé ton diagnostic », Oui / Recommencer, `claimed_by_user_id`), schéma `supabase/functions/_shared/diagnostic/` importé par `@shared`, et suppression de la copie de `assignPersona` / `selectProgram` dans `app/src/features/onboarding/rules.ts` au profit de `supabase/functions/_shared/onboarding/program.ts` (le test de parité tombe avec elle).
- [ ] Administration > Alertes : ajouter le type `make_webhook_failed` (webhook Make en échec, migration `20261211090000`) à la liste `KINDS` de `app/src/app/(app)/admin/alerts.tsx`, avec ses libellés FR et EN dans `app/src/i18n/`.

### Contrôle manuel du hors-ligne (lot 10a)

Maestro ne sait pas couper le réseau : à refaire à la main avant la bêta.

1. Se connecter, ouvrir Aujourd'hui (le plan est mis en cache).
2. Couper le réseau (simulateur : couper le Wi-Fi du Mac ; téléphone : mode avion). Le bandeau « Hors ligne » apparaît.
3. Terminer l'exercice et cocher une habitude : l'affichage suit, le bandeau compte les actions en attente.
4. Fermer complètement l'app, la rouvrir hors ligne : le plan et les coches sont toujours là.
5. Ouvrir le check-in et valider : message « Le check-in demande une connexion », les réponses restent à l'écran.
6. Rétablir le réseau : la notice « … synchronisée » s'affiche, la base contient le résultat et la coche.
7. Conflit : hors ligne, terminer l'exercice d'un jour, puis rétablir le réseau seulement le surlendemain (ou modifier l'item côté serveur entre-temps) : la notice « n'a pas pu être appliquée » s'affiche et le plan montré est celui du serveur.

- [ ] Lien magique avec liens universels (iOS) et App Links (Android), si utile en plus du code.
