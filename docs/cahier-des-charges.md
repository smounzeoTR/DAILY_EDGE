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

Situation non renseignée (Q5 passée) → Entrepreneur, PR1. Sur l'écran « Ton programme », « Changer de programme » affiche les programmes publiés ; le choix remplace le persona et le programme. Le persona est un point de départ, modifiable ensuite.

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

Toutes les questions sauf la 1 peuvent être passées (Q8 passée → 15 minutes ; rappels par défaut 07:30 et 21:00). L'échéance (Q3), si elle est donnée, doit être dans le futur. Les réponses en cours sont gardées sur l'appareil si l'app est fermée. Ensuite :
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

Précisions du 23 novembre 2026 (lot 4) :
- L'écran charge le plan de la date du jour dans le fuseau du profil ; s'il n'existe pas, il appelle `generate-plan` puis l'affiche.
- Saisie selon `proof_type` : « Fait » exige une preuve (texte non vide pour un texte libre, nombre pour une valeur chiffrée, rien pour une case à cocher), puis propose une note de 1 à 5, facultative. « Pas le temps » = `skipped`, « Trop dur » = `too_hard`. Un résultat peut être corrigé (entre fait, pas le temps et trop dur, jamais retour à « à faire ») tant que la journée n'est pas finie, via `set_plan_item_result`, qui refuse tout autre jour.
- À chaque changement de résultat, l'app appelle `generate-plan` pour demain ; la fonction ne recalcule que si ce plan existe et n'a pas été touché.
- Habitude introduite par l'étape : carte « Nouvelle habitude proposée » avec « Ajouter » (`add_habit_from_template`, textes vides affichés depuis le modèle, fréquence copiée) ou « Plus tard » (masquée pour la journée ; proposée à nouveau si l'étape se répète).
- Habitudes affichées selon leur fréquence (fonction pure `habitStatusOn`, réutilisée pour les taux) : quotidienne tous les jours ; jours ouvrés du lundi au vendredi ; hebdomadaire (semaine du lundi au dimanche), toutes les 2 semaines (périodes de 14 jours à partir de la date d'ajout) et mensuelle (mois civil) affichées chaque jour de la période jusqu'à ce qu'elles soient cochées, puis « Faite cette semaine / sur ces 2 semaines / ce mois-ci » ; « À l'occasion » toujours accessible, sans attente de réalisation, jamais comptée dans les taux.
- Cocher : un toucher (retoucher le même jour décoche). « Version minimale » coche en un geste et l'enregistre comme telle (`habit_logs.minimal`). Une coche n'est possible que pour le jour même ou la veille (RLS).
- Le bouton du check-in est mis en avant à partir de l'heure du rappel du soir (21 h par défaut).

### 3.3 Check-in du soir (60 secondes)
Énergie 1–5, humeur 1–5, temps disponible demain (5 / 15 / 30 min), question de réflexion (« Qu'est-ce qui m'a rapproché de mon objectif aujourd'hui ? »), note libre facultative. La validation déclenche la génération du plan du lendemain.

Précisions du 23 novembre 2026 (lot 4) : le check-in porte sur la date du jour dans le fuseau de l'utilisateur ; il est modifiable le soir même et chaque enregistrement (`upsert_checkin`) relance `generate-plan` pour demain, dont le résultat est affiché (« Demain : … », avec « Version courte » si le plan est minimal). Si `consent_checkin` est faux, l'énergie et l'humeur ne sont ni demandées ni enregistrées (le serveur les ignore) : seulement le temps disponible demain, la réflexion et la note ; le moteur utilise alors ses valeurs par défaut.

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

Le plan du lendemain est créé à la validation du check-in du soir, sinon par pg_cron à 2 h (heure locale de l'utilisateur), sinon à la première ouverture de la journée. Règles précisées le 22 novembre 2026 (lot 3) ; implémentation : `supabase/functions/_shared/engine/`.

### 5.0 Principes du moteur
- `buildPlan(input)` est une fonction pure et déterministe : la date du plan est passée en entrée, jamais lue dans l'horloge. Toutes les dates sont des dates locales dans le fuseau de l'utilisateur.
- Le check-in pris en compte est celui de la veille (J-1). Sans check-in la veille : temps disponible = `daily_minutes` du profil (15 s'il est vide ; « 45 et plus » compte pour 45), énergie supposée à 3. Sans consentement au check-in, l'énergie et l'humeur sont vides et l'énergie vaut aussi 3.
- Énergie du jour → énergie requise acceptée : 1–2 → Basse uniquement ; 3 → Basse ou Moyenne ; 4–5 → toutes.
- Niveau → difficulté maximale : débutant 2, intermédiaire 3, avancé 4 (5 au plus après une montée de niveau).
- « Activité » d'une journée = au moins un exercice fait, une habitude cochée ou un check-in. Le jour de l'onboarding compte comme une activité.

### 5.1 Choix du mode
Ordre : reprise, sinon minimal, sinon normal.
1. **Reprise** (code `recovery`, affichée « Reprise ») : aucune activité pendant les 3 jours complets qui précèdent la date du plan (J-1, J-2 et J-3). Un compte onboardé à J-3 ou après n'est jamais en reprise. Exercice minimal de l'étape en cours ; le programme n'avance pas.
2. **Minimal** si l'une des conditions est vraie : énergie de la veille ≤ 2 ; temps disponible ≤ 5 min ; réalisation < 50 % calculée sur les jours qui avaient un plan parmi les 3 derniers (règle non appliquée s'il y en a moins de 2) ; humeur ≤ 2 les 5 derniers jours (le message bienveillant et les ressources d'aide viendront plus tard). « Charge réduite d'un cran » = ce mode minimal.
3. **Normal** sinon.

**Pendant un programme** : un seul exercice (principal en mode normal, minimal en mode minimal ou reprise) et le principe de l'étape (`program_steps.principle_id`). Si l'exercice principal dépasse le temps disponible, l'exercice minimal le remplace et le mode passe à minimal. Le filtre d'énergie ne s'applique pas aux exercices du programme.

**Remplacement d'un exercice du programme** s'il a été sauté 2 fois ou plus (« Trop dur » compte comme un saut), noté 1/5 il y a moins de 60 jours, s'il lui manque un prérequis (par exemple si seule la version minimale d'un jour précédent a été faite) ou s'il n'est pas publié. Ordre : exercice plus court partageant le principe de l'étape et passant tous les filtres du § 5.2 ; sinon l'exercice minimal de l'étape ; sinon le meilleur candidat du catalogue. Le principe du jour reste celui de l'étape.

**Habitude introduite** : le jour où une étape introduit une habitude, le plan la propose (`daily_plans.introduced_habit_id`), sauf si l'utilisateur l'a déjà.

**Avancement du programme** : seul le serveur le fait avancer. Le jour couvert par un plan est déduit du plan précédent : jour du plan précédent + 1 si son exercice (normal ou minimal) est « fait » et si ce n'était pas un plan de reprise, sinon le même jour. Recalculer un plan ne fait donc jamais avancer deux fois. `profiles.program_day` suit le plan le plus récent ; `program_day` et `program_start_date` ne sont écrits que par le serveur (et par `complete_onboarding`). Après le dernier jour du programme : mode catalogue.

### 5.2 Mode catalogue (après le jour 28 ou sans programme)
Filtres éliminatoires :
- jamais levés : exercice publié ; pas noté 1/5 depuis moins de 60 jours ; prérequis déjà faits ; durée ≤ temps disponible ;
- assouplissables : persona de l'utilisateur ou « Tous » ; énergie acceptée ; difficulté ≤ maximum du niveau ; délai de répétition respecté depuis la dernière réalisation (« Non » = jamais refait) ; exclusion des exercices sautés 2 fois.

**Assouplissement** si aucun candidat ne passe : lever dans cet ordre en s'arrêtant dès qu'il y a un candidat : délai de répétition, puis exclusion des exercices sautés 2 fois, puis difficulté maximale +1, puis énergie, puis persona. En dernier recours : tout exercice de 5 min au plus passant les filtres jamais levés. Chaque étape est une règle journalisée (`relaxed_*`).

Score des candidats (poids de départ, à recalibrer après 4 semaines de bêta) :

`score = 0,30 × domaine + 0,25 × blocage + 0,15 × affinité + 0,15 × nouveauté + 0,15 × équilibre`
- domaine : 1 / 0,75 / 0,5 selon le rang dans les domaines prioritaires, 0 sinon ;
- blocage : 1 si l'exercice traite un blocage de l'utilisateur ;
- affinité : note moyenne des exercices du même domaine ramenée entre 0 et 1 ; valeur neutre 0,5 tant qu'il y a moins de 10 exercices notés ;
- nouveauté : 1 si jamais proposé, sinon min(1, jours depuis la dernière proposition / 30) ;
- équilibre : 1 − part du domaine dans les exercices proposés sur 14 jours.
Égalité départagée par l'identifiant (déterminisme).

Nombre d'exercices : 1, ou 2 si le mode est normal et le temps disponible d'au moins 30 min (le second différent et tenant dans le temps restant). En mode minimal ou reprise : 1 exercice de 5 min au plus. Principe du jour : premier principe de l'exercice principal.

### 5.3 Règles d'ajustement
| Condition | Action |
| --- | --- |
| Réalisation < 50 % sur les jours avec plan parmi les 3 derniers (≥ 2 jours) | Mode minimal |
| Réalisation > 85 % sur les 7 derniers jours, tous avec plan | Difficulté maximale +1 ce jour-là en mode catalogue (montée durable via `profile_stats` au lot 5) |
| Énergie ≤ 2 la veille | Mode minimal ; deux jours de suite : règle journalisée |
| Humeur ≤ 2 pendant 5 jours | Mode minimal dès le lot 3 ; message bienveillant + ressources d'aide (en France, le 3114), sans diagnostic, au lot 8 |
| Habitude < 30 % sur 14 jours | Le bilan propose de la simplifier ou de la remplacer (lot 6) |
| Exercice sauté 2 fois (« Trop dur » compris) | Remplacé par un exercice plus court du même principe |
| 3 jours complets sans activité | Plan de reprise doux |
| Objectif en retard de plus de 20 % (valeur actuelle < 80 % de la trajectoire linéaire de 0 à la cible entre la création et l'échéance) | Détecté et journalisé dès le lot 3 ; le bilan propose de réviser l'échéance (lot 6) |

Principe du jour (décision du 20 novembre 2026) :
- **Pendant un programme**, le principe de l'étape fait foi (`program_steps.principle_id`), même s'il ne fait pas partie des principes de l'exercice principal. L'import signale ces cas par un avertissement (actuellement PR2 J5, PR2 J14 et PR3 J16).
- **En mode catalogue** (après le jour 28 ou sans programme), c'est le premier principe de l'exercice principal (`exercise_principles.position = 1`).

### 5.4 « Pourquoi aujourd'hui » et IA
- Gratuit : phrase construite par des modèles FR et EN, choisis selon la règle déclenchée la plus prioritaire (reprise, énergie basse, peu de temps, humeur basse, réalisation faible, remplacement, montée de niveau, thème de la semaine, programme terminé, domaine prioritaire, variété). Exemples : « Ton énergie était basse hier : voici une version courte pour garder le rythme. », « Semaine 2 de ton programme : priorités et focus. ». Le texte est enregistré dans la langue du profil (`daily_plans.why_today`) ; la clé du modèle et ses paramètres sont conservés dans `engine_decisions.why`.
- Premium avec consentement IA : le LLM reçoit un profil résumé et pseudonymisé (ni nom ni e-mail), les 3 derniers check-ins et les 10 meilleurs candidats ; il choisit 1 à 3 exercices parmi les identifiants fournis, personnalise la consigne et rédige le « pourquoi aujourd'hui » en 2 phrases maximum, dans la langue de l'utilisateur. Sortie JSON validée par schéma ; en cas d'échec, repli sur le meilleur score sans personnalisation.
- Bilan hebdo premium : le LLM résume la semaine et propose 1 à 3 ajustements ; en gratuit, résumé et propositions par règles.

Chaque calcul écrit une ligne dans `engine_decisions` (règles déclenchées, 10 meilleurs candidats avec le détail du score, pourquoi aujourd'hui, modèle, sortie, repli, latence).

### 5.4 bis Edge Function `generate-plan`
- L'utilisateur est identifié par son JWT, jamais par un paramètre ; le corps n'accepte que `{ "date" }` (aujourd'hui ou demain dans son fuseau, aujourd'hui par défaut). Profil non onboardé : erreur 409.
- Idempotente : si le plan de la date existe et qu'aucun de ses exercices n'a été touché, il est recalculé (même identifiant) ; sinon il est renvoyé tel quel.
- `daily_plans`, `plan_items`, `engine_decisions` et `profiles.program_day` sont écrits en une seule transaction (`save_daily_plan`, réservée au serveur).
- Recalcul après réalisation : quand l'exercice du jour J passe à « fait », le plan de J+1 doit être recalculé s'il existe et n'a pas été touché ; c'est ce qui fait avancer le programme si l'exercice est fait après le check-in. L'appel est déclenché par l'app (lot 4).

### 5.5 Rappels
Matin à `notify_morning` (« Ton exercice du jour est prêt »), soir à `notify_evening` (« 60 secondes pour ton check-in »).

Notifications locales (`expo-notifications`). L'autorisation est demandée une seule fois, à la première ouverture d'Aujourd'hui, après un écran d'explication ; « Plus tard » ou un refus ne déclenchent jamais de nouvelle demande et l'app fonctionne normalement. Les rappels sont replanifiés à chaque ouverture et à chaque changement d'heure ou de langue. Toucher le rappel du soir ouvre le check-in.

### 5.6 Génération de secours (pg_cron)
- Toutes les heures, pg_cron appelle (pg_net) l'Edge Function `generate-plans-batch`, protégée par un secret serveur (en-tête `x-batch-secret`, valeur dans Vault et dans le secret de fonction `PLANS_BATCH_SECRET`) ; elle n'accepte pas de JWT utilisateur. `generate-plan` reste réservée à l'utilisateur.
- Elle retient les utilisateurs onboardés pour qui il est entre 2 h et 5 h (5 h exclue) dans leur fuseau et qui n'ont pas de plan pour leur date locale (`users_due_for_plan`) : une exécution manquée est rattrapée l'heure suivante, sans doublon grâce à l'idempotence. Au plus 200 utilisateurs par exécution, le reste passe à l'heure suivante.
- Chaque plan est généré avec le même code que `generate-plan` (`_shared/plans/generatePlan.ts`).

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
- `user_habits` : id, user_id, template_id (nullable), title, cue, minimal_version, frequency, active. Décision du 21 novembre 2026 : pour une habitude issue d'un modèle, title, cue et minimal_version restent NULL tant que l'utilisateur ne les modifie pas, et l'app affiche le texte du modèle dans la langue courante ; seul ce qui a été personnalisé est enregistré (par exemple un signal). Une habitude sans modèle doit avoir son propre titre (contrainte `template_id is not null or title is not null`). La fréquence est copiée du modèle à la création.
- `habit_logs` : user_habit_id, user_id, date, done, minimal (coche en version minimale). Écriture limitée au jour même et à la veille dans le fuseau du profil (RLS).
- `checkins` : user_id, date, energy, mood, minutes_tomorrow, reflection, note. Écriture uniquement via `upsert_checkin` (date du jour, énergie et humeur vidées sans consentement).
- `daily_plans` : id, user_id, date (unique par utilisateur), principle_id, mode (normal / minimal / recovery, affiché « Reprise »), program_day (NULL en mode catalogue), why_today, introduced_habit_id (habitude proposée par l'étape du jour)
- `plan_items` : id, plan_id, user_id, exercise_id, position, personalized_instructions, status (todo / done / skipped / too_hard), proof_value, rating, completed_at

Cohérence du `user_id` recopié dans `habit_logs` et `plan_items` (pour des politiques RLS simples) : clés étrangères composites `habit_logs (user_habit_id, user_id) → user_habits (id, user_id)` et `plan_items (plan_id, user_id) → daily_plans (id, user_id)`. Un utilisateur ne peut donc pas écrire de log sur l'habitude d'un autre.

Fin de l'onboarding : fonction `complete_onboarding` (security invoker), qui écrit en une transaction l'objectif, le profil (réponses, persona déduit du programme choisi, programme, `program_start_date` = date du jour dans le fuseau de l'utilisateur, `program_day = 1`, consentements, `onboarded_at`) et les 3 habitudes. Elle refuse une échéance qui n'est pas dans le futur, un programme non publié, autre chose que 3 modèles d'habitude distincts et publiés, et un second appel.

Droits par table : CRUD complet sur ses lignes pour `goals`, `user_habits`, `habit_logs` (jour même et veille seulement), `favorites` ; lecture seule pour `checkins` (écriture via `upsert_checkin`) ; lecture seule pour `subscriptions`, `daily_plans`, `profile_stats` (écrites côté serveur) ; modification limitée à certaines colonnes pour `profiles` (jamais `role`, `program_day` ni `program_start_date`) et `weekly_reviews` (accepted). Depuis le lot 4, `plan_items` et `checkins` ne sont plus modifiables directement : résultats via `set_plan_item_result` (plan du jour seulement), check-in via `upsert_checkin`.
- `weekly_reviews` : id, user_id, week_start, summary, proposals (jsonb), accepted (jsonb)
- `favorites` : user_id, entity_type, entity_id
- `profile_stats` : user_id, completion_7d, completion_by_domain (jsonb), energy_trend, avg_minutes, level, updated_at (recalculée chaque nuit)

Moteur : `engine_decisions` : id, user_id, plan_id, rules_fired[], candidates (jsonb), why (jsonb : clé, paramètres, texte), llm_model, llm_input_hash, llm_output (jsonb), fallback_used, latency_ms, created_at. Lecture réservée aux admins. Fonctions serveur (service_role uniquement) : `save_daily_plan` (enregistrement transactionnel et idempotent d'un plan) et `engine_exercise_history` (historique agrégé par exercice).

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
