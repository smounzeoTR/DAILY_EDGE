# Mise en ligne de la bêta (lot 10b)

Ordre imposé : **recette d'abord**, production seulement après un déploiement complet de la recette contrôlé ensemble. Le local reste l'environnement de développement.

| Environnement | Projet Supabase                    | Profil EAS    | Public         |
| ------------- | ---------------------------------- | ------------- | -------------- |
| Local         | `supabase start`                   | `development` | développement  |
| Recette       | projet « daily-edge-recette » (UE) | `preview`     | tests internes |
| Production    | projet « daily-edge » (UE)         | `production`  | bêta-testeurs  |

Les deux projets sont au plan gratuit de Supabase : pas de sauvegarde gérée, et mise en pause après 7 jours sans activité. La production a une activité au moins horaire (tâches pg_cron), ce qui devrait éviter la pause. La recette peut être mise en pause et se relance depuis le tableau de bord. Les sauvegardes se font par `deploy backup` (voir `docs/exploitation.md`).

## 1. Ce que tu fais toi-même

### Comptes et achats

- [ ] Apple Developer Program, au nom de l'entreprise : 99 $ par an et un numéro D-U-N-S. Le nom du vendeur affiché sur l'App Store sera celui du compte.
- [ ] App Store Connect : créer l'app (`com.trasenel.daily-edge`, nom « Daily Edge », langue principale français) et ajouter les testeurs internes.
- [ ] Expo : compte et organisation. Dans `app/`, lancer `npx eas-cli@latest login` puis `npx eas-cli@latest init` : l'`projectId` est écrit dans `app.json`.
- [ ] Supabase : les deux projets en région UE (Francfort `eu-central-1` ou Paris `eu-west-3`). Garder le mot de passe de base de chacun.
- [ ] Anthropic : deux espaces de travail (« daily-edge-recette », « daily-edge-production »), une clé par espace et un plafond de dépense mensuel par espace (§ 4).
- [ ] Scaleway : projet, Transactional Email, domaine `dailyedge.trasenel.com`, clé API (Secret Key) avec les droits Transactional Email.
- [ ] Sentry : projet React Native en région UE (`*.de.sentry.io`), DSN et jeton d'authentification (`SENTRY_AUTH_TOKEN`).
- [ ] PostHog : projet sur l'instance UE (`eu.i.posthog.com`) et clé de projet.
- [ ] GitHub Pages pour `legal/` : sur un dépôt privé, il faut un abonnement GitHub qui l'autorise (Pro, Team ou Enterprise).

### Domaine et DNS (`trasenel.com`)

| Enregistrement              | Valeur                                               | Pour                                                                        |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `CNAME dailyedge`           | `<compte-github>.github.io`                          | pages légales (GitHub Pages)                                                |
| `TXT dailyedge` (SPF)       | valeur donnée par Scaleway (`v=spf1 include:… ~all`) | e-mails de connexion et d'alertes                                           |
| DKIM (`TXT` ou `CNAME`)     | nom et valeur donnés par Scaleway                    | signature des e-mails                                                       |
| `TXT _dmarc.dailyedge`      | `v=DMARC1; p=quarantine; rua=mailto:<ton adresse>`   | politique DMARC (passer à `p=reject` après quelques semaines sans incident) |
| MX (si Scaleway le demande) | valeur donnée par Scaleway                           | retours (bounces)                                                           |

La documentation de Scaleway n'a pas pu être lue automatiquement. Relève les valeurs exactes dans la console Scaleway (Transactional Email > Domaine > Configuration DNS) et attends que le domaine soit « vérifié » avant le premier envoi.

### Textes

- [ ] CGU, politique de confidentialité et mentions légales relues, en FR puis en EN. Je les intègre dans `legal/`.

## 2. Fichiers d'environnement

```
cp .env.deploy.example .env.recette      # puis .env.production plus tard
```

Remplir chaque clé (le fichier est ignoré par Git). Le secret du batch se génère avec `openssl rand -hex 32` et doit être différent dans chaque environnement. Dans `.env.recette`, mettre `OPS_ENV_NAME=recette`.

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
npm run deploy -- check --env recette            # région UE, clés, extensions, aucun compte de démo, migrations
npm run deploy -- db --env recette --apply       # migrations (supabase db push)
npm run deploy -- functions --env recette --apply
npm run deploy -- secrets --env recette --apply  # noms affichés, valeurs jamais affichées
npm run deploy -- vault --env recette --apply    # URL et secret de la génération de secours et des alertes
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

Mêmes étapes avec `--env production --apply --confirm-production`. Les étapes `db` et `functions` refusent une version qui n'est pas passée en recette (empreintes de `deploy/history.json`). Puis build avec `--profile production`.

## 7. Android (pas pour la bêta)

`com.trasenel.dailyedge` est réservé dans `app.json`. Il faudra plus tard un compte Google Play Console (25 $), le formulaire « Sécurité des données », le questionnaire de classification, le profil EAS Android et, pour un compte personnel récent, un test fermé de 12 testeurs pendant 14 jours avant la production.
