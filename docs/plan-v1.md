# Daily Edge — Plan de développement de la V1

Neuf lots, chacun livrable et testable seul. On ne commence un lot que lorsque le précédent est accepté. Cocher les cases au fil de l'eau.

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
- [ ] Bilan hebdo par règles (§ 3.6), propositions acceptées ou refusées et appliquées.
- [ ] Montée de niveau durable : le bilan hebdo propose de passer au niveau supérieur (`profiles.level`) après 2 semaines au-dessus de 85 % de réalisation ; l'utilisateur accepte ou refuse.
- [ ] Réglages complets (§ 3.7), export JSON, suppression du compte (marquage puis purge à 30 jours).
- [ ] Script de données de démonstration (§ 8).

## Lot 7 — Premium, IA et administration
- [ ] Interrupteur gratuit / premium (table `subscriptions`).
- [ ] Couche `_shared/llm/` : interface commune, fournisseurs Anthropic et Mistral, choix par variable d'environnement, validation zod, repli.
- [ ] Choix et personnalisation premium dans `generate-plan`, bilan hebdo rédigé par l'IA.
- [ ] Écrans admin : contenus, statuts, statistiques par exercice, journal du moteur.

## Lot 8 — Finitions et bêta
- [ ] Cache hors ligne du plan du jour et des coches (expo-sqlite), synchronisation au retour du réseau.
- [ ] Message bienveillant et ressources d'aide (3114) si humeur ≤ 2 pendant 5 jours.
- [ ] Sentry et PostHog (UE), politique de confidentialité, mentions dans l'onboarding.
- [ ] Projet Supabase de recette (région UE), builds EAS, TestFlight et test interne Android.
- [ ] Réévaluer le stockage local chiffré : session Supabase et brouillon d'onboarding sont en V1 dans expo-sqlite, non chiffré (piste : SecureStore pour la clé + chiffrement des valeurs).
- [ ] Lien magique avec liens universels (iOS) et App Links (Android), si utile en plus du code.
