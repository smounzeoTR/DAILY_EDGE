# Catalogue de contenu

Source de vérité du contenu en V1 : le Sheet « Daily Edge — Catalogue de contenu » (https://claude.ai/artifact/4bfNUVXH5XZNWNoseD295L).

## Export
Ouvrir le Sheet, le télécharger au format .xlsx et l'enregistrer ici sous `catalogue.xlsx`. À refaire à chaque modification du contenu, puis relancer l'import (`scripts/import-catalog`) et `supabase db reset`.

## Feuilles et colonnes (en-têtes en français)

| Feuille | Colonnes |
| --- | --- |
| Sources (15) | ID, Auteur, Titre (FR), Titre original, Année |
| Principes (115) | ID, Domaine, Principe (FR), Résumé (FR), Sources, Statut, Principle (EN), Summary (EN) |
| Exercices (287) | ID, titre FR, consigne FR, domaine, principes, durée (min), difficulté (1–5), énergie, moment, type, personas, blocages, prérequis, délai de répétition (jours ou « Non »), preuve, statut, titre EN, consigne EN — vérifier l'ordre exact dans l'export |
| Habitudes (42) | ID, Habitude (FR), Description (FR), Domaine, Principes, Fréquence, Moment, Signal par défaut (FR), Version minimale (FR), Personas, Statut, Habit (EN), Description (EN), Default cue (EN), Minimal version (EN) |
| Programmes (4) | ID, Nom (FR), Persona, Durée (jours), Description (FR), Statut, Name (EN), Description (EN) |
| Étapes des programmes (112) | Programme, Jour, Thème (FR), Principe, Exercice principal, Titre de l'exercice (formule, à ignorer), Exercice minimal, Habitude introduite, Theme (EN) |

Conventions : « — » = aucun ; listes séparées par « , » (ex. « S01, S04 ») ; « Tous » = tous les personas ; statuts Brouillon / En relecture / Validé / Rejeté.
