# Daily Edge — Cahier des charges du site dailyedge.fr

Version 1 · 23 novembre 2026 · À donner à Claude Code dans le repo DAILY_EDGE.

Références : stratégie marketing, tunnel de vente (§ 3 « Capter »), architecture d'automatisation (flux 1 et 2), identité visuelle (`identite-visuelle.md`), visuels de lancement.

## 1. Objectif

Un site d'une page qui transforme chaque visite en **inscription à la liste d'attente** (jusqu'au 3 janvier 2027), puis en **diagnostic + téléchargement de l'app** (à partir du 4 janvier 2027).

Indicateurs visés :
- visite → inscription : ≥ 25 % sur le trafic venu de LinkedIn et des podcasts, ≥ 5 % sur la publicité ;
- diagnostic commencé → terminé : ≥ 70 % ;
- 1 000 inscrits avant le 4 janvier.

## 2. Deux modes, un seul site

| Mode | Période | Bouton principal | Ce qui se passe |
|---|---|---|---|
| `waitlist` | jusqu'au 3 janvier 2027 | « Réserver ma place » | E-mail seul, rang dans la liste, lien de parrainage |
| `launch` | à partir du 4 janvier 2027 | « Faire mon diagnostic (2 min) » | 6 questions, résultat, e-mail, boutons App Store et Google Play |

Le mode est piloté par une variable de configuration (`SITE_MODE`), changeable sans redéploiement de code. Les deux modes partagent la même page et les mêmes sections.

## 3. Choix techniques

- **Cadre** : site statique, Astro + TypeScript, dans un dossier `site/` du repo. Aucun framework lourd côté client ; îlots interactifs uniquement pour le formulaire et le diagnostic.
- **Données** : le projet Supabase existant (région UE). Écriture uniquement via des Edge Functions ; aucune clé de service côté navigateur.
- **E-mails** : Scaleway TEM pour les e-mails transactionnels (confirmation d'inscription, résultat du diagnostic), depuis `auth.dailyedge.fr`. Brevo pour le marketing (newsletter, séquence de la liste d'attente), depuis `news.dailyedge.fr`.
- **Synchronisation Brevo** : des triggers Postgres (`pg_net`) déclenchent deux scénarios Make (déjà créés) qui créent ou mettent à jour le contact Brevo dans la bonne liste. Contrat détaillé au § 14.
- **Mesure** : PostHog (hébergement UE). Sans consentement, mode sans cookie ; avec consentement, suivi complet. Bandeau de consentement conforme aux recommandations de la CNIL (refuser aussi simple qu'accepter).
- **Anti-abus** : Cloudflare Turnstile ou hCaptcha (invisible) sur les formulaires, limitation de débit par IP dans les Edge Functions.
- **Hébergement** : à trancher par Steeven. Recommandation : Scaleway, par cohérence avec TEM et l'hébergement européen ; alternative plus rapide à mettre en place : Vercel ou Cloudflare Pages. HTTPS obligatoire, redirection `www.` → racine.

## 4. Structure de la page

1. **En-tête** : logo soleil levant + logotype « dailyedge », lien discret « Daily Edge Équipes ».
2. **Accroche** : « Tu as lu les livres. Maintenant, applique-les. » Sous-titre : « Un principe, un exercice, trois habitudes. 10 minutes par jour, ajustées chaque soir. »
3. **Bouton principal** selon le mode, et en mode `launch`, les badges App Store et Google Play.
4. **Comment ça marche** : trois cartes reprenant les captures App Store 1 à 3 (principe du jour, plan qui s'ajuste, habitudes minuscules).
5. **Preuves** : 115 principes, 287 exercices, 42 habitudes, 4 programmes de 28 jours ; témoignages réels de la bêta quand ils existeront (jamais de faux témoignage).
6. **Coach Edge** : capture App Store 4, mention « Premium ».
7. **Prix** : Gratuit ; Premium 119 €/an ou 14,99 €/mois ; « 14 jours de Premium offerts, sans carte bancaire ». En janvier, encart offre Fondateurs (249 € à vie, 500 places, compteur de places restantes réel).
8. **Confiance** : données hébergées en Europe, notes jamais lues par l'IA, résiliation en deux gestes.
9. **Questions fréquentes** : 6 à 8 questions (gratuit ou payant, données, IA, différence avec une app de résumés, durée par jour, annulation).
10. **Pied de page** : mentions légales, CGU, politique de confidentialité, contact `contact@dailyedge.fr`, réseaux sociaux.

Page secondaire : `/equipes` (offre B2B : bénéfices, tableau de bord anonymisé, 79 € HT par utilisateur et par an, minimum 10, bouton « Prendre rendez-vous » vers Google Agenda ou un formulaire).
Pages d'atterrissage par source : `/gdiy`, `/martingale`, `/linkedin`… (même page, accroche et code adaptés, UTM préremplis).

## 5. Identité visuelle

Reprendre exactement les jetons de `identite-visuelle.md` : bleu électrique #2F5BFF, orange aube #FF5A1F (réservé au soleil, aux séries et aux offres), encre #0B1B3F, nuage #F3F5FB, nuit #0A1230 ; titres en Space Grotesk 700, texte en Inter ; boutons en pilule de 56 px de haut ; thèmes clair et sombre selon le réglage du système. Pas de dégradé, pas de photo d'ambiance, pas de couverture de livre.

## 6. Mode `waitlist`

### Parcours
1. Saisie de l'e-mail + case de consentement non cochée : « J'accepte de recevoir les e-mails de Daily Edge (lancement, principe de la semaine). Désinscription en un clic. » + lien vers la politique de confidentialité.
2. Envoi → e-mail de confirmation (double opt-in) via Scaleway TEM.
3. Clic de confirmation → page « Ta place est réservée » : rang, lien de parrainage personnel, boutons de partage (LinkedIn, WhatsApp, copie du lien), premier principe offert.
4. Contact créé dans Brevo uniquement après confirmation.

### Parrainage
- Chaque inscrit reçoit un code (`?ref=XXXXXX`).
- Un filleul **confirmé** fait gagner 10 places à son parrain ; affichage du rang mis à jour.
- Les 100 premiers rangs reçoivent l'accès à la bêta en priorité, puis l'offre Fondateurs 48 heures avant tout le monde.

### Données (Supabase)
Table `waitlist_entries` : `id`, `email` (unique, en minuscules), `status` (`pending` / `confirmed` / `unsubscribed`), `referral_code` (unique), `referred_by` (code du parrain), `confirmed_referrals` (entier), `rank` (calculé), `utm_source`, `utm_medium`, `utm_campaign`, `landing_path`, `consent_marketing` (booléen), `consent_at`, `confirmed_at`, `created_at`, `locale`.
RLS : aucune lecture ni écriture directe depuis le navigateur ; tout passe par les Edge Functions `waitlist-join`, `waitlist-confirm` et `waitlist-status`.

## 7. Mode `launch` : le diagnostic

Mis à jour le 23 novembre 2026 (lot S3a) : 7 questions, confirmation du consentement marketing, un e-mail de résultat par adresse et par 24 h.

### Les 7 questions
Une question par écran, barre de progression, retour possible, réponses enregistrées localement jusqu'à l'envoi (jamais l'e-mail).

| # | Question | Réponses (valeurs de l'app) |
|---|---|---|
| 1 | Quel est ton objectif principal pour les 3 prochains mois ? | Les 7 domaines de l'onboarding (`domain`) : repris comme premier domaine prioritaire |
| 2 | Ta situation | Les 5 situations de l'onboarding (`situation`) |
| 3 | Qu'est-ce qui te bloque le plus aujourd'hui ? | Motivation · Organisation · Constance · Peur de passer à l'action |
| 4 | Combien de temps peux-tu y consacrer par jour ? | 5 min · 15 min · 30 min (`daily_minutes`) |
| 5 | Quel est ton meilleur moment de la journée ? | Matin · Midi · Soir (`chronotype`) |
| 6 | Quels auteurs as-tu déjà lus ? | Facultative (bouton « Passer ») ; choix multiple : Hill, Kiyosaki, Clear, Covey, Robbins, Carnegie, aucun. Sert à personnaliser la newsletter |
| 7 | Ton e-mail, pour recevoir ton plan | E-mail + consentement marketing séparé et facultatif |

Les valeurs des questions 1, 2, 4 et 5 sont **strictement identiques** à celles de l'onboarding de l'app (module partagé `supabase/functions/_shared/diagnostic/values.ts`). Préremplissage des freins de l'app : Motivation → `motivation`, Organisation → `organisation`, Peur → `fear` ; « Constance » n'a pas d'équivalent (aucun préremplissage).

### Le résultat
- **Profil** selon la question 3 : Motivation → « Le rêveur en attente » ; Organisation → « Le bâtisseur dispersé » ; Constance → « Le sprinteur » ; Peur → « Le stratège prudent ». Deux phrases par profil (libellés à valider).
- **Programme recommandé** : même règle d'attribution que l'écran « Ton programme » de l'onboarding (premier domaine « Argent & patrimoine » → PR4, sinon la situation), partagée dans `supabase/functions/_shared/onboarding/program.ts`.
- **Premier principe et exercice court** : principe et exercice minimal du jour 1 du programme, tirés du catalogue publié, affichés avec leur durée réelle (2 min pour PR1 et PR2, 5 min pour PR3 et PR4).
- Le résultat s'affiche à l'écran. L'e-mail de résultat (Scaleway TEM, HTML et texte) part **au plus une fois par adresse et par 24 h** (l'adresse n'est pas vérifiée) ; le message affiché est le même dans tous les cas : « Ton plan part par e-mail (un envoi par adresse et par jour) ». Les boutons App Store et Google Play n'apparaissent que si leurs liens sont renseignés.

### Consentement marketing
L'adresse n'étant pas vérifiée, le consentement marketing doit être confirmé : quand la case est cochée, l'e-mail de résultat contient un bouton de confirmation (lien valable 48 heures, à usage unique). Le clic renseigne `marketing_confirmed_at` ; c'est seulement à ce moment que le contact part vers Brevo (§ 14). Sans ce clic, la personne ne reçoit que l'e-mail de résultat.

### Le préremplissage dans l'app (lot S3b, après le lot 10)
On ne crée **pas** de compte depuis le site (les consentements de l'app restent recueillis dans l'app). Les réponses sont stockées avec l'e-mail ; quand un utilisateur se connecte dans l'app avec la même adresse, l'onboarding lui propose : « On a retrouvé ton diagnostic. Reprendre avec ces réponses ? » (Oui / Recommencer). Les réponses non réclamées sont supprimées au bout de 90 jours.

### Données (Supabase)
Table `web_diagnostics` : `id`, `email`, `answers` (JSON validé par un schéma zod partagé avec l'app), `profile`, `recommended_program_id`, `consent_marketing`, `marketing_confirmed_at`, `utm_*`, `landing_path`, `referral_code`, `claimed_by_user_id` (nul tant que non réclamé), `result_email_sent_at`, `locale`, `created_at`, `updated_at`, `expires_at`. Un seul diagnostic non réclamé par adresse : un nouvel envoi le remplace (un consentement déjà confirmé est conservé). Jetons de confirmation dans `web_diagnostic_tokens` (hachés).
Edge Functions `diagnostic-submit` (valide, calcule profil et programme côté serveur, enregistre, envoie l'e-mail de résultat, renvoie le résultat à afficher) et `diagnostic-confirm-marketing` (confirme le consentement avec le jeton du lien).

## 8. Événements PostHog

`landing_view` (avec `landing_path` et UTM), `cta_clicked`, `waitlist_joined`, `waitlist_confirmed`, `referral_shared` (canal), `quiz_started`, `quiz_step` (numéro), `quiz_completed` (profil, programme), `email_captured`, `store_clicked` (iOS / Android), `equipes_view`, `equipes_meeting_requested`.

## 9. Référencement et partage

- Titre : « Daily Edge — Les grands livres de réussite, en 10 minutes par jour ».
- Méta-description, image de partage 1200 × 630 aux couleurs de la marque, `sitemap.xml`, `robots.txt`, données structurées `SoftwareApplication`.
- Balise `lang="fr"` ; structure prête pour une version anglaise (`/en`) plus tard.

## 10. Exigences de qualité

- Lighthouse ≥ 90 sur les quatre axes, sur mobile.
- Accessibilité WCAG 2.1 AA : contrastes, libellés visibles, navigation au clavier, zones tactiles ≥ 44 px.
- Poids de la page < 500 Ko hors polices ; polices auto-hébergées.
- Aucune donnée personnelle dans les URL ni dans PostHog (pas d'e-mail en propriété d'événement).

## 11. Pages légales

Mentions légales, CGU et politique de confidentialité (en cours de rédaction) : à intégrer telles quelles, avec ajout des traitements du site (liste d'attente, diagnostic, mesure d'audience, Brevo, Scaleway, PostHog, Make).

## 12. Zone DNS (OVH)

| Enregistrement | Rôle |
|---|---|
| Racine et `www` | Site, selon l'hébergeur retenu |
| `auth` : SPF, DKIM, DMARC Scaleway TEM | E-mails transactionnels |
| `news` : SPF, DKIM Brevo | E-mails marketing |
| MX de la boîte Zimbra incluse | `contact@` et `support@` |
| DMARC sur la racine | Politique `p=none` au départ, puis `quarantine` après 4 semaines de rapports propres |
| DNSSEC | Laisser activé |

Les valeurs exactes sont fournies par chaque service au moment de la vérification du domaine.

## 13. Lots pour Claude Code

| Lot | Contenu | Acceptation |
|---|---|---|
| S0 | Dossier `site/`, Astro, jetons de l'identité visuelle, polices, composants (bouton, carte, champ) | La page vide s'affiche en clair et en sombre avec le logo |
| S1 | Toutes les sections de la page (mode `waitlist`) et la page `/equipes`, textes en dur | Relecture visuelle validée par Steeven |
| S2 | Liste d'attente : table, Edge Functions, double opt-in Scaleway, parrainage, page « Ta place est réservée » | Une inscription de test reçoit l'e-mail, se confirme, obtient un rang ; un filleul confirmé fait gagner 10 places |
| S3a | Diagnostic, serveur et site : table, schéma et règle d'attribution partagés, Edge Functions, écrans, e-mail de résultat, confirmation du consentement marketing | Un diagnostic de test produit le bon programme ; la confirmation du consentement envoie le contact à Brevo |
| S3b | Préremplissage dans l'app (après le lot 10) ; suppression de la copie de la règle d'attribution dans l'app | La même adresse dans l'app retrouve les réponses |
| S4 | PostHog, bandeau de consentement, événements, anti-abus | Tous les événements du § 8 remontent ; aucun cookie avant consentement |
| S5 | Mise en ligne : hébergement, DNS, HTTPS, pages légales, référencement | dailyedge.fr répond en HTTPS, Lighthouse ≥ 90 |

Comme pour l'app, Claude Code propose le plan de chaque lot et attend la validation de Steeven avant de coder.

## 14. Côté Make (déjà en place, à brancher)

Dossier Make « Daily Edge » (organisation TRASENEL), deux scénarios créés et **désactivés** :

| Scénario | Webhook Make | Déclencheur Supabase à créer | Liste Brevo |
|---|---|---|---|
| « Daily Edge – Liste d'attente confirmée → Brevo » | « Daily Edge – Liste d'attente confirmée (Supabase) » | Trigger `pg_net` sur `waitlist_entries`, événement **UPDATE** | « Daily Edge – Liste d'attente » (id 4) |
| « Daily Edge – Diagnostic web → Brevo » | « Daily Edge – Diagnostic web (Supabase) » | Trigger `pg_net` sur `web_diagnostics`, événement **UPDATE** quand `marketing_confirmed_at` passe de vide à renseignée | « Daily Edge – Diagnostic web » (id 5) |

Contrat d'interface :
- Format : celui des webhooks de base de Supabase (`type`, `table`, `record`, `old_record`), en POST JSON.
- Envoi depuis un trigger Postgres avec `pg_net` ; URL et secret lus dans Supabase Vault (`make_hook_waitlist`, `make_hook_diagnostic`, `make_webhook_secret`), jamais dans une migration ni dans le code.
- Chaque appel porte l'en-tête `x-webhook-secret`. Sa valeur est visible dans le filtre du module Brevo de chaque scénario ; Steeven la copie lui-même dans Vault.
- Champs lus dans `record` : `email`, `status`, `referral_code`, `rank`, `utm_source`, `utm_medium`, `utm_campaign` (liste d'attente) ; `email`, `consent_marketing`, `marketing_confirmed_at`, `profile`, `recommended_program_id`, `answers.authors`, `utm_*` (diagnostic). Les noms de colonnes du § 6 et du § 7 doivent donc être respectés à l'identique.
- Le scénario liste d'attente n'agit que si `record.status` vaut `confirmed` et `old_record.status` ne le valait pas ; le scénario diagnostic n'agit que si `consent_marketing` est vrai, `record.marketing_confirmed_at` présent et `old_record.marketing_confirmed_at` absent.
- Attributs Brevo créés : `SOURCE`, `UTM_SOURCE`, `UTM_MEDIUM`, `UTM_CAMPAIGN`, `REFERRAL_CODE`, `RANK`, `PROFIL`, `PROGRAMME`.

Les URL des webhooks sont visibles dans Make (rubrique Webhooks). Activer les scénarios une fois le lot S2 (puis S3) testé.
