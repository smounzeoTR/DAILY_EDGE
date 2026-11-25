# Migration de la zone DNS dailyedge.fr d'OVH vers Cloudflare

Le domaine reste **enregistré chez OVH** ; seuls les serveurs de noms changent (offre gratuite de Cloudflare). Le site n'est branché qu'**après** la migration (§ 7).

Fichiers :

- `docs/dns/dailyedge.fr.cloudflare.zone` : copie fidèle de la zone OVH, à importer chez Cloudflare.
- `scripts/dns/records.txt` : la liste des noms et types comparés.
- `scripts/dns/dns-compare.sh` : compare chaque enregistrement entre deux serveurs (avant, puis après la bascule).

Deux exports de la zone OVH du 23 novembre 2026, contrôlés le même jour sur `dns17.ovh.net` et au registre `.fr` (`d.nic.fr`) : la zone **initiale** (numéro de série `2095433896`) et la zone **actuelle** (`2095448114`). L'inventaire les fusionne : tout ce qui est dans la zone actuelle, plus les MX de la zone initiale, supprimés depuis.

## 1. Constats préalables (à régler avant la bascule)

1. **Les MX de la messagerie ont été supprimés.** La zone initiale contenait `MX 1 mx1.mail.ovh.net.`, `MX 5 mx2.mail.ovh.net.` et `MX 100 mx3.mail.ovh.net.` ; la zone actuelle n'en a plus (constaté sur `dns17.ovh.net` et `ns17.ovh.net`), sans doute supprimés lors de l'ajout des enregistrements Scaleway. **Depuis, aucun e-mail envoyé à `contact@dailyedge.fr` ou `support@dailyedge.fr` ne peut arriver**, et les rapports DMARC (`rua=mailto:contact@dailyedge.fr`) sont perdus. À faire **chez OVH, avant tout** : Zone DNS > Ajouter une entrée > MX, les trois entrées ci-dessus (priorités 1, 5 et 100), TTL 300. Puis envoyer un e-mail de test à `contact@`. Les deux zones ne contenaient aucun enregistrement de configuration automatique de la messagerie (autodiscover, autoconfig, SRV) : rien à reprendre.
2. **Rien pour Brevo sur `news.dailyedge.fr`.** Ni SPF, ni DKIM, ni code de vérification. Avec `sp=quarantine` sur la racine, un e-mail marketing envoyé depuis `news.dailyedge.fr` sans authentification serait mis en indésirables. À ajouter depuis Brevo (Paramètres > Expéditeurs, domaines et IP dédiées > Domaines) **avant** le premier envoi marketing ; idéalement chez OVH avant la bascule, pour que l'export les contienne.
3. **DMARC de la racine déjà en `p=quarantine; sp=quarantine`**, alors que le cahier des charges du site (§ 12) prévoit `p=none` au départ, puis `quarantine` après 4 semaines de rapports propres. Le fichier de zone reprend la valeur actuelle telle quelle ; à toi de décider s'il faut revenir à `p=none` tant que la messagerie et Brevo ne sont pas authentifiés (le sous-domaine `auth` a sa propre politique, `p=none`).
4. **DNSSEC est actif chez OVH** : DS `50041 8 2 8F0238…CAABF229` publié au registre `.fr` avec un TTL de 3600 s. Il faut le retirer avant de changer de serveurs de noms (§ 4).
5. **Le site actuel est le serveur d'accueil et de redirection d'OVH** (`213.186.33.5`, HTTP seulement, aucun HTTPS) ; les deux TXT `1|www.dailyedge.fr` et `3|welcome` sont ses réglages. `ftp` est un reste de l'hébergement OVH. Tout cela est copié tel quel pendant la migration, puis supprimé au branchement du site (§ 7).

## 2. Inventaire et équivalents chez Cloudflare

Tous les enregistrements restent **« DNS only »** (nuage gris) pendant la migration. Seuls la racine, `www` et `recette` passeront par le proxy au branchement du site (§ 7).

| Nom                                                    | Type       | TTL  | Valeur (OVH)                                                                     | Rôle                                    | Chez Cloudflare (migration)                  | Au branchement du site                                                                             |
| ------------------------------------------------------ | ---------- | ---- | -------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@`                                                    | SOA, NS    | —    | `dns17.ovh.net`, `ns17.ovh.net`                                                  | zone OVH                                | non importés (Cloudflare écrit les siens)    | —                                                                                                  |
| `@`                                                    | A          | 3600 | `213.186.33.5`                                                                   | page d'accueil OVH                      | identique, DNS only                          | **supprimé**, remplacé par le domaine personnalisé Pages (proxy)                                   |
| `@`                                                    | TXT        | 3600 | `1\|www.dailyedge.fr`                                                            | réglage de la redirection OVH           | identique                                    | **supprimé**                                                                                       |
| `@`                                                    | TXT        | 3600 | `v=spf1 include:mx.ovh.com -all`                                                 | SPF de la messagerie OVH                | identique                                    | identique                                                                                          |
| `@`                                                    | MX         | —    | **absent**                                                                       | messagerie (`contact@`, `support@`)     | à ajouter (constat 1)                        | identique                                                                                          |
| `www`                                                  | A          | 3600 | `213.186.33.5`                                                                   | page d'accueil OVH                      | identique, DNS only                          | **supprimé**, remplacé par `CNAME www → dailyedge.fr` (proxy) et une redirection 301               |
| `www`                                                  | TXT        | 3600 | `3\|welcome`                                                                     | réglage de la page d'accueil OVH        | identique                                    | **supprimé**                                                                                       |
| `ftp`                                                  | CNAME      | 3600 | `dailyedge.fr.`                                                                  | reste de l'hébergement OVH              | identique                                    | **supprimé**                                                                                       |
| `_dmarc`                                               | TXT        | 300  | `v=DMARC1; p=quarantine; rua=mailto:contact@dailyedge.fr; sp=quarantine; aspf=r` | DMARC de la racine et des sous-domaines | identique (constat 3)                        | identique                                                                                          |
| `auth`                                                 | MX         | 300  | `10 blackhole.tem.scaleway.com.`                                                 | retours (bounces) de Scaleway TEM       | identique                                    | identique                                                                                          |
| `auth`                                                 | TXT        | 300  | `v=spf1 include:_spf.tem.scaleway.com -all`                                      | SPF de Scaleway TEM                     | identique                                    | identique                                                                                          |
| `_dmarc.auth`                                          | TXT        | 300  | `v=DMARC1; p=none`                                                               | DMARC de `auth`                         | identique                                    | identique                                                                                          |
| `b20000a8-076f-4aab-9d36-c03d2f87e5f9._domainkey.auth` | TXT        | 300  | `v=DKIM1; h=sha256; k=rsa; p=MIIBIjAN…EjQIDAQAB` (420 caractères, deux chaînes)  | DKIM de Scaleway TEM                    | identique (vérifié caractère pour caractère) | identique                                                                                          |
| `news`                                                 | TXT, CNAME | —    | **absents**                                                                      | Brevo (SPF, DKIM, vérification)         | à ajouter (constat 2)                        | identique                                                                                          |
| `recette`                                              | CNAME      | —    | absent                                                                           | recette du site                         | —                                            | **ajouté** par le domaine personnalisé Pages (proxy : obligatoire pour Pages et Cloudflare Access) |

L'export OVH contenait le DKIM en double (deux lignes identiques) ; OVH n'en publie qu'un, le fichier de zone n'en garde qu'un.

## 3. Préparation (avant la bascule)

1. Rétablir les trois MX chez OVH (constat 1) et vérifier la réception sur `contact@`. Ajouter chez OVH les enregistrements Brevo (constat 2) ; s'ils sont ajoutés, refaire l'export pour que je complète le fichier de zone et `records.txt`.
2. **J − 2** : chez OVH, passer le TTL de chaque enregistrement à 300 s (la plupart sont à 3600 s), pour qu'un retour arrière se propage vite.
3. Cloudflare : Add a domain > `dailyedge.fr` > offre Free. Si Cloudflare propose des enregistrements détectés automatiquement, les supprimer tous.
4. DNS > Records > Import and Export : importer `docs/dns/dailyedge.fr.cloudflare.zone` en **décochant « Proxy imported DNS records »**. Vérifier ensuite que chaque enregistrement est en nuage gris (DNS only).
5. Relever les deux serveurs de noms attribués par Cloudflare (Overview), par exemple `xxx.ns.cloudflare.com`.
6. Comparer chaque enregistrement entre OVH et Cloudflare, qui répond déjà pour la zone :

   ```
   scripts/dns/dns-compare.sh dns17.ovh.net <serveur-cloudflare-1>
   ```

   Il doit afficher « Aucune différence ». Corriger toute différence chez Cloudflare avant d'aller plus loin.

## 4. DNSSEC chez OVH : désactivation et attente

Un DS laissé au registre pendant que Cloudflare (dont les clés diffèrent) sert la zone rendrait le domaine introuvable pour les résolveurs qui valident DNSSEC. Ordre impératif :

1. OVH > Web Cloud > Noms de domaine > `dailyedge.fr` > **DNSSEC : désactiver**.
2. Attendre que le DS ait disparu du registre :

   ```
   dig +short DS dailyedge.fr @d.nic.fr
   ```

   La réponse doit être vide (la mise à jour par OVH peut prendre jusqu'à 24 h).

3. Attendre ensuite au moins le TTL du DS (3600 s) plus une marge : **2 heures** après la disparition constatée. Les résolveurs qui avaient le DS en cache l'ont alors oublié.

## 5. Bascule des serveurs de noms

1. OVH > Noms de domaine > `dailyedge.fr` > Serveurs DNS > Modifier : remplacer `dns17.ovh.net` et `ns17.ovh.net` par les deux serveurs Cloudflare. **Ne pas supprimer la zone chez OVH** : elle sert au retour arrière.
2. Cloudflare passe la zone en « Active » quand il voit la délégation (de quelques minutes à quelques heures).
3. Vérifier la délégation et les réponses publiques :

   ```
   dig +noall +authority NS dailyedge.fr @d.nic.fr
   scripts/dns/dns-compare.sh dns17.ovh.net 1.1.1.1
   scripts/dns/dns-compare.sh dns17.ovh.net 8.8.8.8
   ```

   (Les résolveurs publics peuvent garder l'ancienne délégation jusqu'à l'expiration de son TTL ; refaire le contrôle après quelques heures.)

**Pendant les 48 h qui suivent**, toute modification faite chez Cloudflare doit aussi être faite chez OVH, pour que le retour arrière reste sans perte.

## 6. Contrôles après la bascule

| Contrôle                           | Comment                                                      | Attendu                                                                              |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Enregistrements                    | `dns-compare.sh` contre 1.1.1.1 et 8.8.8.8                   | aucune différence                                                                    |
| Réception `contact@` et `support@` | e-mail depuis une boîte extérieure (Gmail, par exemple)      | reçu (suppose le constat 1 réglé)                                                    |
| Envoi depuis `contact@`            | réponse vers la boîte extérieure                             | reçu ; en-têtes : `spf=pass`, `dmarc=pass`                                           |
| Code de connexion de l'app         | connexion dans l'app de recette                              | e-mail de `connexion@auth.dailyedge.fr` reçu ; `spf=pass`, `dkim=pass`, `dmarc=pass` |
| E-mail de la liste d'attente       | inscription sur la recette                                   | e-mail de `bonjour@auth.dailyedge.fr` reçu ; mêmes résultats                         |
| E-mail Brevo                       | Brevo > envoi d'un e-mail de test depuis `news.dailyedge.fr` | reçu ; `dkim=pass` (suppose le constat 2 réglé)                                      |
| Site actuel                        | `http://dailyedge.fr`                                        | toujours la page d'OVH (le site n'est pas encore branché)                            |

Un contrôle en échec : corriger chez Cloudflare si la cause est évidente, sinon retour arrière (§ 8).

## 7. Branchement du site (après 48 h sans incident)

Le site se branche une fois la migration stable (procédure : `docs/mise-en-ligne.md` § 11).

1. Cloudflare : supprimer `@ A 213.186.33.5`, `@ TXT "1|www.dailyedge.fr"`, `www A 213.186.33.5`, `www TXT "3|welcome"` et `ftp CNAME`.
2. Pages : domaine personnalisé `dailyedge.fr` sur le projet `dailyedge-site` (Cloudflare crée l'enregistrement de la racine, proxifié) et `recette.dailyedge.fr` sur `dailyedge-site-recette` (proxifié, ce que Pages et Cloudflare Access exigent).
3. `www` : `CNAME www → dailyedge.fr`, **proxifié**, et la règle de redirection 301 vers `https://dailyedge.fr`.
4. Tout le reste reste en DNS only (messagerie, Scaleway, Brevo, DMARC, vérifications).
5. À partir de là, la comparaison avec OVH montre ces différences attendues (racine, `www`, `ftp`, `recette`) ; un retour arrière ramènerait la page d'accueil d'OVH.

## 8. Retour arrière

**Tant que DNSSEC n'est pas réactivé chez Cloudflare** (§ 9), le retour arrière est sans risque :

1. OVH > Serveurs DNS : remettre `dns17.ovh.net` et `ns17.ovh.net`.
2. Vérifier : `dig +noall +authority NS dailyedge.fr @d.nic.fr`, puis `dns-compare.sh dns17.ovh.net 1.1.1.1` (après expiration des caches).
3. Réactiver DNSSEC chez OVH seulement quand la situation est stable.

**Après la réactivation de DNSSEC chez Cloudflare**, d'abord retirer le DS chez OVH (DNSSEC > supprimer l'enregistrement), attendre sa disparition au registre plus 2 heures, puis remettre les serveurs d'OVH. Sinon, le domaine devient introuvable pour les résolveurs qui valident DNSSEC.

C'est pourquoi DNSSEC reste coupé environ 48 h après une bascule réussie.

## 9. DNSSEC chez Cloudflare (après 48 h sans incident)

1. Cloudflare > DNS > Settings > **DNSSEC : Enable**. Cloudflare affiche l'enregistrement DS (key tag, algorithme 13, type de condensé 2, condensé) et la clé publique (flags 257, algorithme 13).
2. OVH > Noms de domaine > `dailyedge.fr` > DNSSEC : ajouter l'enregistrement avec les valeurs **affichées par Cloudflare** (OVH demande, selon l'écran, le DS ou la clé publique : flags, algorithme, clé).
3. Vérifier que le DS publié au registre correspond à celui de Cloudflare, puis la chaîne de confiance :

   ```
   dig +short DS dailyedge.fr @d.nic.fr
   dig +dnssec dailyedge.fr SOA @1.1.1.1    # le drapeau « ad » doit apparaître
   ```

   et https://dnsviz.net/d/dailyedge.fr/dnssec/ (aucune erreur).

## 10. Vérification HTTPS de chaque sous-domaine (avant `includeSubDomains`)

HSTS avec `includeSubDomains` obligerait les navigateurs à n'utiliser que HTTPS sur **tous** les sous-domaines : il ne faut l'ajouter que si chaque nom qui pointe vers une adresse répond correctement en HTTPS, ou ne sert aucun site.

État constaté le 23 novembre 2026, avant la migration :

| Nom                 | Adresse                      | HTTPS | HTTP                                |
| ------------------- | ---------------------------- | ----- | ----------------------------------- |
| `dailyedge.fr`      | `213.186.33.5` (OVH)         | aucun | 302 vers `http://www.dailyedge.fr/` |
| `www.dailyedge.fr`  | `213.186.33.5`               | aucun | 200 (page d'accueil OVH)            |
| `ftp.dailyedge.fr`  | `213.186.33.5`               | aucun | 302 vers `www`                      |
| `auth.dailyedge.fr` | aucune (MX et TXT seulement) | —     | —                                   |
| `news.dailyedge.fr` | aucune                       | —     | —                                   |

Après le branchement du site (§ 7), refaire le contrôle sur **chaque** nom de la zone qui a un A, un AAAA ou un CNAME (y compris ceux que la messagerie ajoutera : autodiscover, autoconfig, webmail) :

```
for h in dailyedge.fr www.dailyedge.fr recette.dailyedge.fr <autres noms>; do
  printf '%-32s ' "$h"; curl -s -o /dev/null -w 'https=%{http_code} ' --max-time 8 "https://$h/"; echo
done
```

Critère pour `includeSubDomains` : chaque nom répond en HTTPS avec un certificat valide (200 ou 30x), ou ne résout vers aucune adresse. Les noms de messagerie servis par OVH (autodiscover, webmail) doivent présenter un certificat valable **pour ce nom** ; sinon, garder HSTS sans `includeSubDomains`. `preload` ne s'envisage qu'ensuite (difficile à retirer).

## 11. Journal de la migration

| Date             | Étape                        | Constat                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23 novembre 2026 | Exports de la zone OVH       | MX de la messagerie supprimés depuis la zone initiale (constat 1), rétablis chez OVH le même jour                                                                                                                                                                                                                                                                                              |
| 25 novembre 2026 | Bascule des serveurs de noms | délégation `.fr` : `jarred.ns.cloudflare.com`, `marissa.ns.cloudflare.com` ; `dns-compare.sh` sans différence contre Cloudflare, 1.1.1.1 et 8.8.8.8                                                                                                                                                                                                                                            |
| 25 novembre 2026 | DNSSEC chez Cloudflare       | DS au registre `2371 13 2 A027C7A1…FEBBE7D7`, identique au DS recalculé depuis la clé publiée par Cloudflare (KSK, flags 257) ; validation (`ad`) par 1.1.1.1 et 8.8.8.8. **Retour arrière : retirer d'abord ce DS chez OVH** (§ 8)                                                                                                                                                            |
| 25 novembre 2026 | Proxy sur la racine et `www` | activé avant le branchement du site : HTTP sert toujours la page d'OVH, HTTPS répond 521 (le serveur d'OVH n'a pas de HTTPS) ; se résout au branchement du site (§ 7) ou en repassant ces deux enregistrements en DNS only                                                                                                                                                                     |
| 25 novembre 2026 | Branchement du site (§ 7)    | supprimés : `@ A`, `@ TXT "1\|www.dailyedge.fr"`, `www A`, `www TXT "3\|welcome"`, `ftp CNAME` ; racine, `www` et `recette` proxifiées (adresses Cloudflare) ; messagerie, Scaleway et DMARC inchangés ; `dns-compare.sh jarred.ns.cloudflare.com 1.1.1.1` sans différence ; DNSSEC validé. Comparaison avec OVH désormais sans objet. Redirection `www` à corriger (`${1}` pris dans `http*`) |
| 25 novembre 2026 | Redirection `www` corrigée   | `https://www.dailyedge.fr/<chemin>?<requête>` → 301 `https://dailyedge.fr/<chemin>?<requête>` ; `http://www` passe d'abord par `https://www` (Always Use HTTPS), soit deux redirections                                                                                                                                                                                                        |
