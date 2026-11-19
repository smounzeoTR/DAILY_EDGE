# Daily Edge — Cahier des charges (V1)

Version Markdown pour le développement, établie le 19 novembre 2026 à partir du cahier des charges de référence (https://claude.ai/artifact/QVJeM7BSQtPyWUGw5R76Ay) et de la maquette Base44 validée (https://daily-edge-pro.base44.app/). En cas de doute, la maquette fait foi pour le visuel, ce document pour les règles.

## 1. Vision et périmètre

L'application transforme les principes des grands livres de réussite en un programme quotidien personnalisé de 10 à 20 minutes, ajusté chaque soir par un moteur règles + IA selon le vécu réel de l'utilisateur.

- **Problème** : on lit Hill, Kiyosaki ou Clear, on est motivé une semaine, puis rien ne change. Les livres donnent des principes, pas un plan d'action adapté à sa vie, à son énergie et à son temps.
- **Cible** : adultes ambitieux ; entrepreneurs et porteurs de projet en priorité, puis salariés en évolution, personnes en reconversion, étudiants en fin de cursus.
- **Proposition de valeur** : un principe, un exercice concret, ses habitudes, une réflexion. Le programme s'adapte tout seul et chaque choix est expliqué (« pourquoi aujourd'hui »).

Principes de conception :
- Multi-utilisateurs dès la V1 : comptes, données isolées, back-office de contenu.
- L'action avant l'inspiration : toute visualisation ou gratitude est couplée à un plan concret (méthode WOOP).
- IA encadrée : elle choisit et personnalise dans le catalogue validé, elle n'invente pas d'exercices.
- Explicable : chaque exercice proposé affiche « pourquoi aujourd'hui ».
- Sobriété de données : le minimum utile, hébergé dans l'UE.
- Mobile-first (largeur de référence 390 px), utilisable d'une main ; parcours quotidien complet en moins de 10 minutes.

Hors périmètre V1 : réseau social, coaching humain, conseil financier ou médical, audio/vidéo, intégration d'agenda (V2), paiement réel (simulé par un interrupteur gratuit / premium en V1).

## 2. Personas et programmes

| Persona | Situation | Objectif type | Contrainte | Programme de départ |
| --- | --- | --- | --- | --- |
| Entrepreneur | Dirige ou lance une activité | CA cible, signer des clients | Peu de temps, forte charge mentale | PR1 Focus & exécution |
| Salarié | En poste, veut évoluer ou lancer un projet à côté | Promotion, side project | Énergie faible le soir | PR2 Lancer son projet |
| Reconverti | En transition professionnelle | Nouveau métier en X mois | Doute, peur de l'échec | PR3 Confiance & clarté |
| Débutant financier | Revenus réguliers, peu d'épargne | Épargne, comprendre l'argent | Habitudes de dépense | PR4 Intelligence financière |

Règle d'attribution (après l'onboarding) :
1. Premier domaine prioritaire = « Argent & patrimoine » → Débutant financier, PR4.
2. Sinon : entrepreneur ou indépendant → Entrepreneur, PR1 ; salarié → Salarié, PR2 ; étudiant ou en transition → Reconverti, PR3.

Le persona est un point de départ, modifiable ensuite.

## 3. Écrans

### 3.0 Accueil
Splash (logo soleil levant), trois écrans de présentation (voir `corrections-maquette.md` pour l'écran 1/3), puis connexion / création de compte (e-mail + lien magique ; Apple et Google ensuite).

### 3.1 Onboarding — une question par écran, barre de progression, 5 minutes au maximum

| # | Question | Format | Champ |
| --- | --- | --- | --- |
| 1 | Quel est ton objectif principal ? | Texte libre (obligatoire) | goal.title |
| 2 | Comment sauras-tu qu'il est atteint ? | Valeur + unité | goal.target_value, goal.unit |
| 3 | Pour quand ? | Date | goal.deadline |
| 4 | Pourquoi est-ce important pour toi ? | Texte libre | goal.why |
| 5 | Ta situation | salarié, entrepreneur, indépendant, étudiant, en transition | situation |
| 6 | Tes domaines prioritaires | 3 max parmi les 7 domaines | priority_domains |
| 7 | Ce qui te freine le plus | procrastination, peur, finances, confiance, organisation, motivation (multiple) | blockers |
| 8 | Temps disponible un jour normal | 5 / 15 / 30 / 45+ min | daily_minutes |
| 9 | Ton meilleur moment | matin, midi, soir | chronotype |
| 10 | Ce qui te motive | défi, régularité, sens, reconnaissance | motivation_style |
| 11 | Ton niveau en développement personnel | débutant, intermédiaire, avancé | level |
| 12 | Heures des rappels | matin et soir | notify_morning, notify_evening |

Toutes les questions sauf la 1 peuvent être passées. Ensuite :
1. Consentements, deux cases séparées : check-in du soir (humeur, énergie) et personnalisation par IA. L'app reste utilisable sans.
2. Écran « Ton programme » : nom, description et ses 4 semaines (thèmes).
3. Choix de 3 habitudes parmi les modèles, filtrés sur les domaines prioritaires et le persona ; le signal proposé est modifiable.

### 3.2 Aujourd'hui (écran principal)
- En haut : salutation, jour du programme (« Jour 5 sur 28 ») et thème de la semaine.
- Carte « Principe du jour » : titre et résumé.
- Carte « Exercice du jour » : titre, consigne, durée, saisie selon `proof_type` (case à cocher, texte libre, valeur chiffrée). Boutons « Fait », « Pas le temps », « Trop dur ». Après « Fait », note de 1 à 5 étoiles.
- Encart « Pourquoi aujourd'hui ».
- Habitudes du jour à cocher, signal en sous-titre, version minimale accessible en un geste.
- Accès au check-in du soir, mis en avant après l'heure du rappel du soir.
- Le plan est déjà calculé : l'écran s'affiche instantanément.

### 3.3 Check-in du soir (60 secondes)
Énergie 1–5, humeur 1–5, temps disponible demain (5 / 15 / 30 min), question de réflexion (« Qu'est-ce qui m'a rapproché de mon objectif aujourd'hui ? »), note libre facultative. La validation déclenche la génération du plan du lendemain.

### 3.4 Progression
Série en cours, taux de réalisation des exercices sur 7 et 30 jours, taux par habitude, avancement de l'objectif (barre vers target_value, saisie de la valeur actuelle), courbe d'énergie sur 14 jours, historique des réflexions. Aucun classement entre utilisateurs.

### 3.5 Bibliothèque
Principes et exercices filtrables par domaine, source et durée, avec recherche. Favoris. « Ajouter à ma journée » sur un exercice.

### 3.6 Bilan de la semaine (dimanche soir)
Résumé (exercices faits, habitudes tenues, énergie moyenne, meilleur jour), puis 1 à 3 propositions d'ajustement (simplifier une habitude, changer d'habitude, ajuster l'échéance). Chaque proposition s'accepte ou se refuse ; rien n'est appliqué sans accord.

### 3.7 Réglages
Langue, heures des rappels, objectif, habitudes (ajouter, modifier, désactiver), thème (auto / clair / sombre), consentements, offre gratuit / premium (interrupteur en V1), export JSON des données, suppression du compte (effective sous 30 jours).

### 3.8 Administration (rôle admin)
Consultation et modification des contenus, changement de statut (Brouillon / En relecture / Validé / Rejeté), statistiques par exercice : nombre de propositions, taux de réalisation, note moyenne, taux de « trop dur ». Journal des décisions du moteur par utilisateur. En début de V1, Supabase Studio peut suffire ; l'écran admin intégré vient au lot 7.

## 4. Contenu

Hiérarchie : Source → Principe → Exercice. 7 domaines : Clarté & objectifs, Discipline & habitudes, Argent & patrimoine, Entreprise & carrière, Mental & croyances, Relations & réseau, Énergie & santé (hygiène de vie générale, jamais médical).

Catalogue actuel (export dans `data/`) : 15 sources, 115 principes, 287 exercices, 42 modèles d'habitudes, 4 programmes de 28 jours (112 étapes), tous au statut Validé et bilingues.

Métadonnées d'un exercice : durée (min), difficulté 1–5, énergie (Basse / Moyenne / Haute), moment (Matin / Journée / Soir / Indifférent), type (Écriture / Réflexion / Action / Visualisation / Apprentissage / Social), domaine, principes, personas (« Tous » ou liste), blocages traités (« — » si aucun), prérequis (« — » si aucun), délai de répétition en jours (« Non » = jamais répété), preuve (Case à cocher / Texte libre / Valeur chiffrée), statut.

Correspondance des statuts : Brouillon → `draft`, En relecture → `review`, Validé → `published`, Rejeté → `retired`. Un contenu retiré n'est jamais supprimé (cohérence de l'historique).

Règles éditoriales : principes reformulés, jamais de citation longue ; exercices à l'impératif avec un résultat observable ; toute visualisation ou affirmation suivie d'une action ou d'un plan si-alors ; tout contenu généré par IA passe par « en relecture ».

## 5. Moteur de plan

Le plan du lendemain est créé à la validation du check-in du soir, sinon par pg_cron à 2 h (heure locale de l'utilisateur), sinon à la première ouverture de la journée.

### 5.1 Choix du mode
1. **Reprise** (code `recovery`) : aucune activité depuis 3 jours ou plus → exercice minimal du jour en cours, message d'accueil bienveillant ; le programme n'avance pas.
2. **Minimal** : énergie ≤ 2 au dernier check-in, ou temps disponible = 5 min, ou moins de 50 % d'exercices faits sur les 3 derniers jours → `minimal_exercise_id` du jour du programme (une action de 2 à 5 min).
3. **Normal** : exercice principal du jour (`program_steps.day_index = program_day`).

Le jour du programme avance de 1 chaque fois qu'un plan normal ou minimal est réalisé. Le jour où une étape introduit une habitude, proposer de l'ajouter.

### 5.2 Après le jour 28 (ou sans programme)
Filtres éliminatoires sur les exercices `published` :
- durée ≤ temps disponible ;
- énergie compatible (Basse uniquement si énergie ≤ 2) ;
- prérequis déjà faits ;
- délai de répétition respecté (« Non » = jamais deux fois) ;
- persona de l'utilisateur ou « Tous » ;
- difficulté ≤ niveau courant + 1 ;
- exclusion 60 jours d'un exercice noté 1/5.

Score des candidats (poids de départ, à recalibrer après 4 semaines de bêta) :

`score = 0,30 × domaine + 0,25 × blocage + 0,15 × affinité (notes passées du même domaine) + 0,15 × nouveauté + 0,15 × équilibre des domaines sur 14 j`

1 exercice en mode minimal, 2 en mode normal si le temps disponible est d'au moins 30 minutes. Démarrage à froid : l'affinité n'entre en jeu qu'après 10 exercices notés.

### 5.3 Règles d'ajustement
| Condition | Action |
| --- | --- |
| Réalisation < 50 % pendant 3 jours | Charge réduite d'un cran |
| Réalisation > 85 % pendant 7 jours | Niveau +1, un exercice plus exigeant introduit |
| Énergie ≤ 2 deux jours de suite | Mode minimal |
| Humeur ≤ 2 pendant 5 jours | Mode minimal + message bienveillant + ressources d'aide (en France, le 3114), sans diagnostic |
| Habitude < 30 % sur 14 jours | Le bilan propose de la simplifier ou de la remplacer |
| Exercice sauté 2 fois | Remplacé par un exercice plus court du même principe |
| 3 jours sans activité | Plan de reprise doux |
| Objectif en retard de plus de 20 % sur la trajectoire | Le bilan propose de réviser l'échéance |

Principe du jour (décision du 20 novembre 2026) :
- **Pendant un programme**, le principe de l'étape fait foi (`program_steps.principle_id`), même s'il ne fait pas partie des principes de l'exercice principal. L'import signale ces cas par un avertissement (actuellement PR2 J5, PR2 J14 et PR3 J16).
- **En mode catalogue** (après le jour 28 ou sans programme), c'est le premier principe de l'exercice principal (`exercise_principles.position = 1`).

### 5.4 « Pourquoi aujourd'hui » et IA
- Gratuit : phrase construite par les règles (ex. « Ton énergie était basse hier : voici une version courte pour garder le rythme. », « Semaine 2 de ton programme : priorités et focus. »).
- Premium avec consentement IA : le LLM reçoit un profil résumé et pseudonymisé (ni nom ni e-mail), les 3 derniers check-ins et les 10 meilleurs candidats ; il choisit 1 à 3 exercices parmi les identifiants fournis, personnalise la consigne et rédige le « pourquoi aujourd'hui » en 2 phrases maximum, dans la langue de l'utilisateur. Sortie JSON validée par schéma ; en cas d'échec, repli sur le meilleur score sans personnalisation.
- Bilan hebdo premium : le LLM résume la semaine et propose 1 à 3 ajustements ; en gratuit, résumé et propositions par règles.

Chaque calcul écrit une ligne dans `engine_decisions` (règles déclenchées, candidats, modèle, sortie, repli, latence).

### 5.5 Rappels
Matin à `notify_morning` (« Ton exercice du jour est prêt »), soir à `notify_evening` (« 60 secondes pour ton check-in »).

## 6. Schéma de données (PostgreSQL)

Le schéma de référence est dans `supabase/migrations/` ; cette section en donne la vue d'ensemble. Les libellés français du catalogue sont convertis en codes anglais (types énumérés) par `scripts/import-catalog`.

Contenu (lecture seule côté app, `published` uniquement ; sources et tables de liaison lisibles par tous ; écriture réservée au rôle admin). Clés primaires = identifiants du catalogue (S01, P001, E001, H01, PR1) :
- `sources`, `principles`, `principle_sources` (position)
- `exercises` : domaine (un seul, colonne `domain`), `personas persona[]` (tableau vide = « Tous »), `blockers blocker[]`, `repeat_after_days` (NULL = « Non », jamais répété), `proof_type`, `status`. Décision du 20 novembre 2026 : tableaux typés à la place d'une table `exercise_tags`.
- `exercise_principles` (position ; 1 = principe principal), `exercise_prerequisites`
- `habit_templates` (`personas persona[]`, `frequency`), `habit_template_principles` (position)
- `programs`, `program_steps` (program_id, day_index, theme_fr/en, principle_id, main_exercise_id, minimal_exercise_id, introduced_habit_id)

Les textes FR/EN sont stockés en colonnes `*_fr` / `*_en` en V1 (une table `content_translations` reste possible en V2 pour d'autres langues).

Utilisateur (RLS sur `user_id = auth.uid()`, aucun accès anonyme) :
- `profiles` : user_id, display_name, locale, timezone, situation, priority_domains[] (3 max), blockers[], daily_minutes, chronotype, motivation_style, level, persona, program_id, program_start_date, program_day, notify_morning, notify_evening, consent_checkin, consent_ai, consent_at, role (user / admin, non modifiable par l'utilisateur), onboarded_at. Créé automatiquement à l'inscription (trigger sur `auth.users`), avec un abonnement `free`.
- `subscriptions` : user_id, plan (free / premium), provider, status, current_period_end
- `goals` : id, user_id, title, why, target_value, unit, deadline, current_value, status
- `user_habits` : id, user_id, template_id (nullable), title, cue, minimal_version, frequency, active
- `habit_logs` : user_habit_id, user_id, date, done
- `checkins` : user_id, date, energy, mood, minutes_tomorrow, reflection, note
- `daily_plans` : id, user_id, date (unique par utilisateur), principle_id, mode (normal / minimal / recovery, affiché « Reprise »), program_day (NULL en mode catalogue), why_today
- `plan_items` : id, plan_id, user_id, exercise_id, position, personalized_instructions, status (todo / done / skipped / too_hard), proof_value, rating, completed_at

Cohérence du `user_id` recopié dans `habit_logs` et `plan_items` (pour des politiques RLS simples) : clés étrangères composites `habit_logs (user_habit_id, user_id) → user_habits (id, user_id)` et `plan_items (plan_id, user_id) → daily_plans (id, user_id)`. Un utilisateur ne peut donc pas écrire de log sur l'habitude d'un autre.

Droits par table : CRUD complet sur ses lignes pour `goals`, `user_habits`, `habit_logs`, `checkins`, `favorites` ; lecture seule pour `subscriptions`, `daily_plans`, `profile_stats` (écrites côté serveur) ; modification limitée à certaines colonnes pour `profiles` (jamais `role`), `plan_items` (status, proof_value, rating, completed_at) et `weekly_reviews` (accepted).
- `weekly_reviews` : id, user_id, week_start, summary, proposals (jsonb), accepted (jsonb)
- `favorites` : user_id, entity_type, entity_id
- `profile_stats` : user_id, completion_7d, completion_by_domain (jsonb), energy_trend, avg_minutes, level, updated_at (recalculée chaque nuit)

Moteur : `engine_decisions` : id, user_id, plan_id, rules_fired[], candidates (jsonb), llm_model, llm_input_hash, llm_output (jsonb), fallback_used, latency_ms, created_at. Lecture réservée aux admins.

Dates utilisateur stockées en date locale, calculées avec `profiles.timezone`. Similarité entre exercices (pgvector) : reportée après la V1, le score d'affinité V1 se fonde sur les notes par domaine.

## 7. RGPD et sécurité

- Consentements explicites et séparés (check-in ; IA) ; l'app fonctionne sans.
- Hébergement et traitement dans l'UE ; fournisseur LLM sans réutilisation des données pour l'entraînement, DPA signé.
- Le LLM ne reçoit jamais l'historique brut ni d'identifiant direct.
- Export JSON en libre-service, suppression sous 30 jours, rectification dans les réglages.
- Journal du moteur purgé après 12 mois ; comptes inactifs 24 mois supprimés après préavis.
- RLS sur toutes les tables utilisateur, aucune clé de service dans l'app, MFA pour l'admin, sauvegardes quotidiennes.
- Positionnement : coaching, sans promesse thérapeutique, médicale ou financière ; pas de mécanique culpabilisante.

## 8. Données de démonstration

Un utilisateur de démo (Entrepreneur, PR1, jour 10) avec 10 jours d'historique réaliste : check-ins, exercices faits ou sautés, habitudes cochées, pour que Progression et Bilan soient remplis dès le départ. Script séparé du seed de contenu, jamais exécuté en production.

## 9. Indicateurs (cibles bêta)

Onboarding terminé 80 % · rétention J7 40 % · J30 25 % · check-in les jours actifs 50 % · réalisation des exercices 60 % · note moyenne ≥ 3,8 · ajustements acceptés 50 % · coût IA < 0,30 € par utilisateur actif et par mois.

Calendrier indicatif : V1 publique en juin 2027, conditionnée aux résultats de la bêta.
