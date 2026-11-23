# Réponses pour App Store Connect (bêta)

Ces réponses sont à reporter dans App Store Connect avant le premier envoi sur TestFlight. Elles décrivent l'app telle qu'elle est au lot 10b. Elles sont à revoir si une collecte change (paiement, nouveau prestataire, nouvel événement de mesure d'audience).

## 1. Chiffrement (export)

`app.json` déclare `usesNonExemptEncryption: false`, ce qui produit `ITSAppUsesNonExemptEncryption = NO` dans le build. App Store Connect ne pose donc plus la question à chaque build.

Ce que l'app utilise :

- HTTPS (TLS) fourni par iOS pour tous les échanges avec Supabase, Sentry et PostHog ;
- un chiffrement AES standard des données stockées sur le téléphone (session, brouillon, cache hors ligne), avec une clé gardée dans le trousseau iOS. Il sert uniquement à protéger les données de l'utilisateur sur son appareil.

Il n'y a aucun algorithme propriétaire ni de fonction de chiffrement proposée à l'utilisateur. Cela correspond au cas des apps grand public qui n'utilisent qu'un chiffrement standard pour protéger leurs propres données.

**Point à faire confirmer** par la personne qui relit les textes légaux. Le chiffrement AES local est fait par l'app elle-même (bibliothèque `aes-js`), et non par iOS. Il faut confirmer que l'exemption s'applique, aussi pour la déclaration française des moyens de cryptologie (ANSSI). Si ce n'est pas le cas, passer `usesNonExemptEncryption` à `true` et fournir les documents demandés par Apple.

## 2. Étiquettes de confidentialité (« Confidentialité de l'app »)

**Pistage (tracking)** : non. Aucune donnée n'est utilisée pour du pistage ni partagée avec des courtiers en données, et il n'y a ni publicité ni IDFA.

| Type de donnée Apple                                             | Ce que c'est dans Daily Edge                                         | Finalités à cocher                                                                              | Liée à l'identité | Pistage |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- | ------- |
| Coordonnées > Adresse e-mail                                     | connexion par code                                                   | Fonctionnalités de l'app                                                                        | Oui               | Non     |
| Santé et forme > Santé                                           | humeur et énergie du check-in (avec consentement)                    | Fonctionnalités de l'app ; Personnalisation du produit                                          | Oui               | Non     |
| Contenu utilisateur > Autre contenu                              | objectif, notes, réflexions, messages au coach                       | Fonctionnalités de l'app ; Personnalisation du produit (coach et IA premium, avec consentement) | Oui               | Non     |
| Contenu utilisateur > Service client                             | retours « Donner mon avis »                                          | Autres finalités (amélioration du service)                                                      | Oui               | Non     |
| Identifiants > Identifiant utilisateur                           | identifiant du compte                                                | Fonctionnalités de l'app                                                                        | Oui               | Non     |
| Utilisation > Interactions avec le produit                       | événements anonymes (app ouverte, exercice fait…), avec consentement | Analyses                                                                                        | Non               | Non     |
| Diagnostics > Données de plantage ; Autres données de diagnostic | erreurs (Sentry), sans identifiant ni texte saisi                    | Fonctionnalités de l'app                                                                        | Non               | Non     |

À ne pas déclarer : localisation, contacts, photos, historique de navigation, achats (pas de paiement en V1), données financières, données sensibles au sens d'Apple autres que la santé.

Remarques :

- Une collecte facultative soumise à consentement (mesure d'audience, humeur et énergie) doit quand même être déclarée.
- Classer l'humeur et l'énergie en « Santé » est le choix prudent. C'est aussi ainsi que la politique de confidentialité les présente (données pouvant révéler l'état de santé).
- Les traitements par le fournisseur d'IA font partie de « Personnalisation du produit » : c'est un prestataire qui agit pour Daily Edge, pas un tiers qui réutilise les données.

## 3. Autres champs de la fiche

- URL de la politique de confidentialité : `https://dailyedge.trasenel.com/fr/confidentialite.html`.
- Classification par âge : 17+ ou 18+ selon le questionnaire. Répondre « aucun » à tous les contenus sensibles. L'app est réservée aux adultes par ses CGU, avec une case obligatoire à l'inscription.
- Catégorie : Santé et forme ou Productivité. Productivité évite toute ambiguïté « santé », ce qui est cohérent avec « pas un service de soin » dans les CGU.
- Informations pour la vérification d'Apple : fournir un compte de démonstration sur la production (connexion par code e-mail, donc une adresse que tu lis) et expliquer que le code arrive par e-mail.
- Testeurs internes TestFlight : jusqu'à 100 membres de l'équipe App Store Connect, sans vérification d'Apple. Les testeurs externes passent par une vérification bêta.
