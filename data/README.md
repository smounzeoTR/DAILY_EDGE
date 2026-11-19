# Catalogue de contenu

Source de vérité du contenu en V1 : le Sheet « Daily Edge — Catalogue de contenu » (https://claude.ai/artifact/4bfNUVXH5XZNWNoseD295L).

## Export et import
1. Ouvrir le Sheet, le télécharger au format .xlsx et l'enregistrer ici sous `catalogue.xlsx` (tout en minuscules).
2. `npm run import:catalog` : vérifie le fichier et génère `supabase/seed.sql`. En cas d'erreur, rien n'est écrit et chaque problème est listé.
3. `supabase db reset` : rejoue les migrations et charge le seed.
4. Committer `catalogue.xlsx` et `supabase/seed.sql` ensemble (un test vérifie que le seed est à jour).

## Feuilles et colonnes (en-têtes exacts)

Le script lit les feuilles par leur nom et les colonnes par leur en-tête : l'ordre n'a pas d'importance, mais un en-tête renommé ou manquant bloque l'import.

| Feuille | Colonnes |
| --- | --- |
| Sources (15) | ID, Auteur, Titre (FR), Titre original, Année |
| Principes (115) | ID, Domaine, Principe (FR), Résumé (FR), Sources, Statut, Principle (EN), Summary (EN) |
| Exercices (287) | ID, Titre (FR), Consigne (FR), Domaine, Principes, Durée (min), Difficulté (1-5), Énergie, Moment, Type, Personas, Blocages traités, Prérequis, Délai avant répétition (j), Preuve, Statut, Title (EN), Instructions (EN) |
| Habitudes (42) | ID, Habitude (FR), Description (FR), Domaine, Principes, Fréquence, Moment, Signal par défaut (FR), Version minimale (FR), Personas, Statut, Habit (EN), Description (EN), Default cue (EN), Minimal version (EN) |
| Programmes (4) | ID, Nom (FR), Persona, Durée (jours), Description (FR), Statut, Name (EN), Description (EN) |
| Étapes des programmes (112) | Programme, Jour, Thème (FR), Principe, Exercice principal, Titre de l'exercice (formule, ignorée), Exercice minimal, Habitude introduite, Theme (EN) |

La feuille « Dropdown options » (listes de valeurs du Sheet) est ignorée. Les sources n'ont pas de titre anglais : le titre original sert en anglais.

## Conventions et normalisation

| Dans le Sheet | En base |
| --- | --- |
| « — » ou cellule vide | NULL ou liste vide |
| Listes « S01, S04 » | lignes de tables de liaison, dans l'ordre (le premier principe d'un exercice est son principe principal) |
| Personas « Tous » | `personas = '{}'` (tous). « Tous » ne se combine pas avec d'autres personas. |
| Délai de répétition « Non » | `repeat_after_days = NULL` (jamais répété) |
| Statuts Brouillon / En relecture / Validé / Rejeté | `draft` / `review` / `published` / `retired` |

Libellés acceptés (toute autre valeur est une erreur) :
- **Domaine** : Clarté & objectifs, Discipline & habitudes, Argent & patrimoine, Entreprise & carrière, Mental & croyances, Relations & réseau, Énergie & santé.
- **Personas** : Entrepreneur, Salarié, Reconverti, Débutant financier (ou Tous).
- **Blocages traités** : Procrastination, Peur, Finances, Confiance, Organisation, Motivation.
- **Énergie** : Basse, Moyenne, Haute. **Moment** : Matin, Journée, Soir, Indifférent.
- **Type** : Écriture, Réflexion, Action, Visualisation, Apprentissage, Social.
- **Preuve** : Case à cocher, Texte libre, Valeur chiffrée.
- **Fréquence** (habitudes) : Quotidienne, Jours ouvrés, Hebdomadaire, Toutes les 2 semaines, Mensuelle, À l'occasion.

## Contrôles de l'import

Erreurs (bloquantes) : feuille ou colonne absente, identifiant mal formé ou en double, valeur inconnue, valeur hors plage (difficulté 1–5, durée > 0, jour dans le programme), texte FR ou EN obligatoire vide, référence cassée, programme dont les étapes ne couvrent pas exactement les jours 1 à N, cycle de prérequis.

Avertissements (non bloquants) : principe de l'étape absent des principes de l'exercice principal (le principe de l'étape fait foi ; actuellement PR2 J5, PR2 J14, PR3 J16), exercice minimal de plus de 5 min, étape pointant vers un contenu non publié, prérequis d'un exercice de programme non vu plus tôt dans ce programme, feuille ou colonne inconnue.
