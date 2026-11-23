# Mise en ligne de la bêta (lot 10b)

Ordre imposé : **recette d'abord**, production seulement après un déploiement complet de la recette contrôlé ensemble. Le local reste l'environnement de développement.

| Environnement | Projet Supabase                  | Profil EAS    | Public         |
| ------------- | -------------------------------- | ------------- | -------------- |
| Local         | `supabase start`                 | `development` | développement  |
| Recette       | projet `daily_edge_staging` (UE) | `preview`     | tests internes |
| Production    | projet `daily_edge` (UE)         | `production`  | bêta-testeurs  |

Les deux projets sont au plan gratuit de Supabase : pas de sauvegarde gérée, et mise en pause après 7 jours sans activité. La production a une activité au moins horaire (tâches pg_cron), ce qui devrait éviter la pause. La recette peut être mise en pause et se relance depuis le tableau de bord. Les sauvegardes se font par `deploy backup` (voir `docs/exploitation.md`).

## 1. Ce que tu fais toi-même

### Comptes et achats

- [ ] Apple Developer Program, au nom de l'entreprise : 99 $ par an et un numéro D-U-N-S. Le nom du vendeur affiché sur l'App Store sera celui du compte.
- [ ] App Store Connect : créer l'app (`com.trasenel.daily-edge`, nom « Daily Edge », langue principale français) et ajouter les testeurs internes.
- [ ] Expo : compte et organisation. Dans `app/`, lancer `npx eas-cli@latest login` puis `npx eas-cli@latest init` : l'`projectId` est écrit dans `app.json`.
- [x] Supabase : les deux projets, `daily_edge_staging` (recette) et `daily_edge` (production), en région UE `eu-west-1` (Irlande). Garder le mot de passe de base de chacun.
- [ ] Anthropic : deux espaces de travail (« daily-edge-recette », « daily-edge-production »), une clé par espace et un plafond de dépense mensuel par espace (§ 4).
- [ ] Scaleway : projet, Transactional Email, domaine `auth.dailyedge.fr` (expéditeur des e-mails de connexion de l'app, des alertes et de la liste d'attente), clé API (Secret Key) avec les droits Transactional Email.
- [ ] Brevo : domaine d'envoi `news.dailyedge.fr` (newsletter et séquence de la liste d'attente), listes « Daily Edge – Liste d'attente » (id 4) et « Daily Edge – Diagnostic web » (id 5).
- [ ] Make : dossier « Daily Edge », scénarios « Daily Edge – Liste d'attente confirmée → Brevo » et « Daily Edge – Diagnostic web → Brevo », désactivés jusqu'au test du § 8.
- [ ] Sentry : projet React Native en région UE (`*.de.sentry.io`), DSN et jeton d'authentification (`SENTRY_AUTH_TOKEN`).
- [ ] PostHog : projet sur l'instance UE (`eu.i.posthog.com`) et clé de projet.
- [ ] GitHub Pages pour `legal/` : sur un dépôt privé, il faut un abonnement GitHub qui l'autorise (Pro, Team ou Enterprise). Domaine personnalisé : `legal.dailyedge.fr` (Settings > Pages > Custom domain, puis « Enforce HTTPS »), en attendant l'intégration des pages légales au site (lot S5).

### Domaine et DNS (zone `dailyedge.fr` chez OVH)

Toutes les valeurs sont données par chaque console au moment de la vérification du domaine : les relever là, n'en inventer aucune.

| Hôte                      | Type                              | Valeur                                                                               | Pour                                                     |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| racine et `www`           | selon l'hébergeur                 | à définir avec l'hébergement du site (lot S5)                                        | site dailyedge.fr                                        |
| `legal`                   | `CNAME`                           | `<compte-github>.github.io.`                                                         | pages légales (GitHub Pages)                             |
| `auth`                    | `TXT` (SPF)                       | valeur donnée par Scaleway                                                           | e-mails de connexion, d'alertes et de la liste d'attente |
| DKIM de Scaleway (`auth`) | `TXT`                             | nom et valeur donnés par Scaleway                                                    | signature des e-mails de `auth.dailyedge.fr`             |
| retours de Scaleway       | `MX` (ou ce que Scaleway indique) | nom et valeur donnés par Scaleway                                                    | retours (bounces) des e-mails de `auth.dailyedge.fr`     |
| `news`                    | `TXT` (SPF)                       | valeur donnée par Brevo                                                              | e-mails marketing (Brevo)                                |
| DKIM de Brevo (`news`)    | `TXT` ou `CNAME`                  | nom(s) et valeur(s) donnés par Brevo (avec le code de vérification s'il est demandé) | signature des e-mails de `news.dailyedge.fr`             |
| `_dmarc`                  | `TXT`                             | `v=DMARC1; p=none; rua=mailto:<adresse qui reçoit les rapports>`                     | DMARC de la racine (s'applique aussi aux sous-domaines)  |
| racine                    | `MX`                              | ceux de la boîte e-mail incluse chez OVH : **laisser tels quels**                    | `contact@` et `support@`                                 |

- Scaleway : console > Transactional Email > Domaines > `auth.dailyedge.fr` > configuration DNS. Attendre l'état « vérifié » avant le premier envoi.
- Brevo : Paramètres > Expéditeurs, domaines et IP dédiées > Domaines > `news.dailyedge.fr`.
- DMARC : `p=none` au départ ; passer à `p=quarantine` après 4 semaines de rapports propres (aucun envoi légitime en échec SPF ou DKIM).
- DNSSEC : laisser activé.
- Une fois la bascule faite, supprimer dans la zone `trasenel.com` les anciens enregistrements de `dailyedge` (CNAME, SPF, DKIM, DMARC) et retirer le domaine `dailyedge.trasenel.com` de Scaleway.

### Textes

- [ ] CGU, politique de confidentialité et mentions légales relues, en FR puis en EN. Je les intègre dans `legal/`.

## 2. Fichiers d'environnement

```
cp .env.deploy.example .env.recette      # puis .env.production plus tard
```

Remplir chaque clé (le fichier est ignoré par Git). Le secret du batch se génère avec `openssl rand -hex 32` et doit être différent dans chaque environnement. Dans `.env.recette`, mettre `OPS_ENV_NAME=recette`.

Expéditeurs : toutes les adresses sont sur `auth.dailyedge.fr` (`SMTP_ADMIN_EMAIL=connexion@auth.dailyedge.fr`, `OPS_ALERT_FROM=alertes@auth.dailyedge.fr`, `WAITLIST_FROM=bonjour@auth.dailyedge.fr`) ; `deploy check` refuse une autre adresse. Liste d'attente et Make : voir le § 8 (en recette, les trois valeurs `MAKE_*` restent vides).

Côté app, les variables publiques sont des variables d'environnement EAS (jamais dans Git) :

```
cd ~/DAILY_EDGE/app
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref-recette>.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SENTRY_DSN --value https://...de.sentry.io/... --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_POSTHOG_KEY --value phc_... --visibility plaintext
npx eas-cli@latest env:create --environment preview --name SENTRY_AUTH_TOKEN --value sntrys_... --visibility secret
```

Même chose avec `--environment production` et les valeurs de production. `EXPO_PUBLIC_APP_ENV` est défini par `eas.json`.

## 3. Déploiement de la recette, étape par étape

Chaque commande montre d'abord ce qu'elle ferait. Il faut ajouter `--apply` pour écrire.

```
cd ~/DAILY_EDGE
npm run deploy -- check --env recette            # région UE, clés, expéditeurs, Make vide, JWT des fonctions, extensions, liste d'attente, migrations
npm run deploy -- db --env recette --apply       # migrations (supabase db push)
npm run deploy -- functions --env recette --apply # affiche le mode JWT de chaque fonction (config.toml)
npm run deploy -- secrets --env recette --apply  # noms affichés, valeurs jamais affichées
npm run deploy -- vault --env recette --apply    # génération de secours et alertes ; aucun secret Make en recette
npm run deploy -- settings --env recette --apply # supabase/settings/recette.json
npm run deploy -- auth --env recette --apply     # modèle d'e-mail OTP, SMTP Scaleway, MFA TOTP, URL du site
npm run deploy -- catalog --env recette          # simulation de l'import du catalogue
npm run deploy -- catalog --env recette --apply
npm run deploy -- check --env recette
```

Ensuite :

1. Créer ton compte dans l'app de recette, puis te nommer admin : la requête de CLAUDE.md, dans l'éditeur SQL du projet. Activer ensuite la double authentification dans l'app.
2. Vérifier dans l'éditeur SQL : `select jobname, schedule from cron.job;` doit lister `generate-plans-batch` et `ops-checks`, et `select * from public.ops_batch_runs order by started_at desc limit 3;` doit montrer un passage `ok` dans l'heure.
3. Faire le test de restauration (`docs/exploitation.md` § 3) et le noter.
4. Committer `deploy/history.json` (empreintes de la recette, nécessaires pour la production).

## 4. IA : modèles, prix, plafonds

- Plan et bilan : `claude-haiku-5-5`. Coach : `claude-sonnet-5-5`.
- Prix vérifiés le 23 novembre 2026 sur la [grille officielle](https://platform.claude.com/docs/en/about-claude/pricing), en dollars par million de tokens :

| Modèle            | Entrée | Sortie | Écriture du cache (5 min) | Lecture du cache |
| ----------------- | ------ | ------ | ------------------------- | ---------------- |
| claude-haiku-5-5  | 0,10   | 0,50   | 0,125                     | 0,01             |
| claude-sonnet-5-5 | 2,00   | 10,00  | 2,50                      | 0,10             |

Ces valeurs sont reportées telles quelles dans `.env.deploy.example` : le coût affiché en euros est donc légèrement surestimé. Pour Haiku, un prompt de plus de 100 000 tokens coûte 5 fois plus cher, ce que le plan n'atteint jamais.

- Plafond de dépense : se règle dans la console Claude (platform.claude.com), espace de travail > limites. Mettre un plafond mensuel bas en recette (par exemple 10 €) et un plafond de production en rapport avec le nombre de bêta-testeurs (par exemple 50 €). La page de tarifs ne décrit pas l'écran : vérifier le libellé dans la console.
- Garde-fous de l'app, en plus : 3 appels par jour et par utilisateur pour le plan et le bilan, 15 messages par jour pour le coach, 2 € par mois et par utilisateur pour le coach, et une alerte quand le coût du jour dépasse le seuil de `supabase/settings/<env>.json`.

## 5. Build iOS et TestFlight (test interne)

```
cd ~/DAILY_EDGE/app
npx eas-cli@latest build --platform ios --profile preview     # recette
npx eas-cli@latest submit --platform ios --profile preview --latest
```

Dans App Store Connect > TestFlight, ajouter le build au groupe de testeurs internes. Le numéro de build est incrémenté par EAS (`appVersionSource: remote`). La version (`1.0.0`) se change dans `app.json`. Avant le premier envoi, remplir le chiffrement et les étiquettes de confidentialité avec les réponses de `docs/app-store.md`.

## 6. Production (après la recette contrôlée ensemble)

Mêmes étapes avec `--env production --apply --confirm-production`. Les étapes `db` et `functions` refusent une version qui n'est pas passée en recette (empreintes de `deploy/history.json`, committé après la recette). Puis build avec `--profile production`.

```
cd ~/DAILY_EDGE
npm run deploy -- check --env production
npm run deploy -- db --env production --apply --confirm-production
npm run deploy -- functions --env production --apply --confirm-production
npm run deploy -- secrets --env production --apply --confirm-production
npm run deploy -- vault --env production                                  # simulation : Make « défini » / « vide »
npm run deploy -- vault --env production --apply --confirm-production     # dont make_hook_waitlist et make_webhook_secret
npm run deploy -- settings --env production --apply --confirm-production
npm run deploy -- auth --env production --apply --confirm-production
npm run deploy -- catalog --env production
npm run deploy -- catalog --env production --apply --confirm-production
npm run deploy -- check --env production
```

Puis le test de la liste d'attente et l'activation du scénario Make (§ 8).

## 7. Android (pas pour la bêta)

`com.trasenel.dailyedge` est réservé dans `app.json`. Il faudra plus tard un compte Google Play Console (25 $), le formulaire « Sécurité des données », le questionnaire de classification, le profil EAS Android et, pour un compte personnel récent, un test fermé de 12 testeurs pendant 14 jours avant la production.

## 8. Liste d'attente du site (lot S2)

Trois Edge Functions publiques, déployées par l'étape `functions` avec le reste :

| Fonction           | Vérification du JWT | Pourquoi                                     |
| ------------------ | ------------------- | -------------------------------------------- |
| `waitlist-join`    | non                 | appelée par le site, sans session ni compte  |
| `waitlist-confirm` | non                 | lien de l'e-mail, ouvert sans session        |
| `waitlist-status`  | non                 | page « Ta place est réservée », sans session |

Le mode vient de `supabase/config.toml` (`verify_jwt = false`) ; `deploy check` et `deploy functions` refusent un écart avec `EXPECTED_VERIFY_JWT` (`scripts/deploy/plan.ts`). Les fonctions n'acceptent que l'origine `SITE_URL` et écrivent avec la clé de service, côté serveur.

### Valeurs à saisir

Dans `.env.production` :

| Clé                                | Valeur                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `MAILER_PROVIDER`                  | `scaleway`                                                                                   |
| `SCW_TEM_REGION`                   | région du domaine Transactional Email (par exemple `fr-par`)                                 |
| `SCW_SECRET_KEY`, `SCW_PROJECT_ID` | déjà renseignées pour les alertes                                                            |
| `SITE_URL`                         | `https://dailyedge.fr`                                                                       |
| `WAITLIST_FROM`                    | `bonjour@auth.dailyedge.fr`                                                                  |
| `MAKE_HOOK_WAITLIST`               | URL du webhook « Daily Edge – Liste d'attente confirmée (Supabase) »                         |
| `MAKE_HOOK_DIAGNOSTIC`             | URL du webhook « Daily Edge – Diagnostic web (Supabase) » (peut rester vide jusqu'au lot S3) |
| `MAKE_WEBHOOK_SECRET`              | secret vérifié par le filtre des scénarios                                                   |

Dans `.env.recette` : mêmes clés, sauf `SITE_URL=http://localhost:4321` (le site n'est pas encore hébergé) et les trois `MAKE_*` **vides**. Seule la production alimente Brevo : `deploy check --env recette` et `deploy vault --env recette` échouent si l'une d'elles est renseignée, et `deploy vault --env recette --apply` retire du Vault de recette tout secret Make.

Où les trouver :

- URL des webhooks : Make > Webhooks, puis le webhook de chaque scénario > copier l'adresse.
- Secret : dans chaque scénario, le filtre placé avant le module Brevo compare l'en-tête `x-webhook-secret` à une valeur ; c'est cette valeur. Elle doit être la même dans les deux scénarios (un seul secret dans Vault).

`deploy secrets` envoie `MAILER_PROVIDER`, `SCW_TEM_REGION`, `SITE_URL` et `WAITLIST_FROM` aux fonctions ; `deploy vault` écrit `make_hook_waitlist`, `make_hook_diagnostic` et `make_webhook_secret` dans Vault. Ces valeurs ne s'affichent jamais, même en simulation : seulement « défini » ou « vide ». Une valeur vide n'est jamais écrite.

Sans URL ou sans secret dans Vault, le trigger ne fait rien et la confirmation réussit ; une erreur du webhook est journalisée en avertissement sans jamais bloquer une inscription. Les réponses non 2xx de Make sur 24 h déclenchent l'alerte d'exploitation `make_webhook_failed` (e-mail d'`ops-alert`).

### Test de bout en bout en recette

Après le déploiement de la recette (§ 3), depuis le Mac :

```
cd ~/DAILY_EDGE/site
PUBLIC_FUNCTIONS_URL=https://<ref-recette>.supabase.co/functions/v1 npm run build
npx astro preview --port 4321
```

1. Sur http://localhost:4321, s'inscrire avec ta propre adresse. L'e-mail arrive de `bonjour@auth.dailyedge.fr` ; dans ses en-têtes, SPF et DKIM sont `pass`.
2. Cliquer sur le lien (`http://localhost:4321/confirmer#t=…`) : « Ta place est réservée » affiche un rang.
3. Ouvrir ton lien de parrainage dans une fenêtre privée, s'inscrire avec une seconde adresse et confirmer.
4. Revenir sur http://localhost:4321/ma-place : le rang du parrain a gagné 10 places (plancher 1) et affiche « Déjà 1 ami confirmé ».
5. Dans l'éditeur SQL de la recette : `select email, status, rank, confirmed_referrals from public.waitlist_entries;` montre les deux inscriptions, et `select count(*) from public.make_webhook_requests;` vaut 0 (rien n'est envoyé à Make en recette).
6. Arrêter la prévisualisation : `npx astro preview stop`.

### Test en production, puis activation du scénario Make

Tant que le site n'est pas hébergé (lot S5), le test passe par `curl`. Le scénario Make reste **désactivé** pendant le test : Make garde dans la file du webhook les appels reçus.

1. Déployer la production (§ 6), étapes `vault` et `secrets` comprises, puis `npm run deploy -- check --env production`.
2. Inscription de test (adresse à toi) :
   ```
   curl -sS -X POST https://<ref-production>.supabase.co/functions/v1/waitlist-join \
     -H 'Content-Type: application/json' \
     -d '{"email":"<ton adresse de test>","consent_marketing":true,"utm_source":"test","utm_medium":"manuel","utm_campaign":"mise-en-ligne"}'
   ```
   Réponse attendue : `{"ok":true}`.
3. L'e-mail contient un lien `https://dailyedge.fr/confirmer#t=<jeton>`. Ne pas l'ouvrir (la page n'est pas encore en ligne) : copier le jeton, les 43 caractères après `#t=`, puis :
   ```
   curl -sS -X POST https://<ref-production>.supabase.co/functions/v1/waitlist-confirm \
     -H 'Content-Type: application/json' -d '{"token":"<jeton>"}'
   ```
   Réponse attendue : `rank` à 1, `referral_code` et `status_token`.
4. Dans l'éditeur SQL de la production : `select r.created_at, r.url_host, h.status_code from public.make_webhook_requests r left join net._http_response h on h.id = r.request_id;` montre un appel vers `hook.eu1.make.com` (ou la région de ton compte Make), avec un statut 2xx.
5. Dans Make, ouvrir le scénario « Daily Edge – Liste d'attente confirmée → Brevo » et le lancer une fois (« Run once ») pour traiter l'appel en file.
6. Dans Brevo, vérifier que le contact est arrivé dans la liste « Daily Edge – Liste d'attente » avec ses attributs (`SOURCE`, `UTM_SOURCE`, `UTM_MEDIUM`, `UTM_CAMPAIGN`, `REFERRAL_CODE`, `RANK`).
7. **Seulement alors**, activer le scénario « Daily Edge – Liste d'attente confirmée → Brevo ». Le scénario « Diagnostic web » attend le lot S3.

### Nettoyage après le test de production

Pour que le premier vrai inscrit ait le rang 1 :

1. Dans l'éditeur SQL de la production :
   ```sql
   delete from public.waitlist_tokens
   where entry_id in (select id from public.waitlist_entries where email = '<ton adresse de test>');
   delete from public.waitlist_entries where email = '<ton adresse de test>';
   select count(*) from public.waitlist_entries;  -- 0
   ```
   (La suppression ne déclenche pas Make : le trigger ne réagit qu'aux mises à jour.)
2. Dans Brevo : Contacts, rechercher l'adresse de test, la retirer de la liste « Daily Edge – Liste d'attente » puis supprimer le contact.
