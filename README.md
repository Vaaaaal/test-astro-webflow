# Minisearch — Admin de contenu de recherche

App [Astro](https://astro.build) + React (Cloudflare adapter) déployée sur [Webflow Cloud](https://webflow.com/cloud). Elle fournit une interface d'admin (`/admin`) pour curer les métadonnées de recherche (titre, résumé, catégorie, visibilité) des pages d'**un** site Webflow, à partir d'un document JSON stocké dans Cloudflare R2 qui sert de source de vérité pour une recherche plus riche que la recherche native Webflow.

Ce repo est pensé comme un **template à cloner par site** : un déploiement (un Worker, un bucket R2) = un site Webflow. Pour ajouter un nouveau site, clone ce repo et suis la checklist ci-dessous plutôt que de modifier ce déploiement existant.

## Comment ça marche

- **Automatique** : `POST /api/webhooks/webflow` reçoit les événements Webflow et synchronise deux types de contenu distincts (`kind: "page" | "cms"` sur chaque entrée, cf. section CMS ci-dessous) :
  - `site_publish` — re-liste **toutes** les pages statiques du site, pour chaque langue configurée (slug, titre SEO natif, meta-description) via l'API Webflow Data v2.
  - `collection_item_published` / `collection_item_unpublished` / `collection_item_deleted` — upsert ou suppression **incrémentale** d'un seul item CMS.

  Dans tous les cas, seuls les champs techniques sont créés/actualisés — jamais les champs éditoriaux.
- **Manuel** : `/admin` liste les pages et items CMS déjà connus (badge "Page"/"CMS" dans le tableau, recherche par chemin/titre) et permet d'éditer, pour chacun, le titre, le résumé et les champs personnalisés (par langue si le site est multilingue), la catégorie et la visibilité en recherche (ces deux derniers au niveau de l'entrée, pas par langue). Aucune page/item ne peut être créé ou supprimé depuis cette interface — seul le webhook fait apparaître/disparaître des entrées. La **taxonomie** elle-même (catégories, collections CMS synchronisées) se gère sur `/admin/categories` et `/admin/collections` (réservées aux `admin`), voir sections dédiées ci-dessous.
- **Public** : `GET /api/search-index` (pas d'authentification, CORS ouvert) renvoie les entrées avec `visibleInSearch: true` uniquement (pages et items CMS mélangés, indistincts pour le consommateur), aplaties pour une langue donnée — c'est ce qu'un widget de recherche externe consomme. Paramètre `?locale=<tag>` optionnel (ex. `en-US`) ; sans lui, renvoie la langue primaire du site. Réponse : `[{ url, title, summary, category }]`, avec repli automatique titre/résumé sur les valeurs Webflow natives si pas de surcharge éditoriale, et libellé de catégorie déjà traduit pour la langue demandée.

## Catégories

Gérées depuis `/admin/categories` (réservé aux `admin`) — plus un fichier de config statique. Stockées dans `categories.json` (R2, `src/lib/categoriesStore.ts`) : `key` (stable, immuable une fois créée — la renommer orphelinerait les pages déjà taguées), `adminLabel` (affiché dans l'admin Astro, une seule langue de référence, jamais traduit dans notre UI), `localeLabels` (par tag de locale, ex. `en-US` — pour un futur widget de recherche public, aucune API ne les expose encore), `prefixes` (préfixe de slug pour l'assignation automatique à la création d'une page — `"*"` par défaut, ou par tag de locale si un site traduit ses segments de dossier différemment selon la langue).

Supprimer une catégorie repasse à `null` (pas de réassignation, pas de blocage) toutes les pages qui l'utilisaient — état déjà pleinement supporté partout (affiché "—", filtrable).

`category` sur une page/item n'est **pas** un type TypeScript vérifié à la compilation — juste une clé validée à l'exécution contre la liste courante (lue depuis R2 côté API), puisque la liste est maintenant éditable en base. Compromis assumé pour la flexibilité multi-clients.

Lecture (`GET /api/categories`) accessible aux `editor` (nécessaire pour éditer une page) ; création/édition/suppression réservées aux `admin`.

## Items CMS

Une collection CMS est une ressource Webflow différente des pages statiques (`GET /v2/collections/{id}/items`, pas `GET /v2/sites/{id}/pages`) — invisible au webhook `site_publish`. Gérées depuis `/admin/collections` (réservé aux `admin`), qui liste en direct les collections du site via `GET /api/webflow-collections` (proxy vers `GET /v2/sites/{id}/collections`) — pas besoin de connaître un `collectionId` à la main. Seules les collections explicitement configurées là sont synchronisées (stocké dans `cmsCollections.json`, R2, `src/lib/cmsCollectionsStore.ts`) — pas d'auto-découverte qui synchroniserait des collections non destinées à la recherche comme témoignages ou équipe.

En dev sans `WEBFLOW_API_TOKEN`/`WEBFLOW_SITE_ID` configurés dans `.dev.vars`, `GET /api/webflow-collections` renvoie des données simulées (deux collections d'exemple, dont une sans chemin détecté) au lieu d'appeler l'API Webflow — même principe que `request-magic-link` qui n'appelle jamais Resend en dev. Si ces identifiants sont renseignés, même en dev, l'appel réel est utilisé.

Contrairement aux pages statiques, un item CMS n'a **aucun champ SEO standardisé** exposé par l'API (le titre/la description affichés sur le site sont liés à des champs dynamiques au niveau du template de page de collection, pas retournés tels quels) — `summaryField` (choisi dans `/admin/collections` parmi les vrais champs de la collection) indique quelle clé `fieldData` utiliser comme résumé, à défaut le résumé reste vide jusqu'à édition manuelle. `defaultCategory` assigne une catégorie de départ à la création (toujours modifiable ensuite) — l'identité de la collection suffit comme signal, pas besoin de préfixe d'URL comme pour les pages.

L'URL d'un item (`{publishedPath de la page-template de la collection}/{slug de l'item}`) est résolue en lisant le `publishedPath` de la page-template de collection parmi les pages du site (`getCollectionPagePath`, `src/lib/webflowClient.ts`) — **vérifié contre un vrai site** : le slug de la collection seul ne suffit pas et peut donner une URL fausse. Si la page de collection n'a jamais été construite/publiée dans le Designer (juste créée via l'API), aucun chemin n'est détecté et l'item n'est pas synchronisé tant que ça n'est pas fait.

Chaque webhook Webflow enregistré (un par `triggerType`) génère sa propre clé de signature — `WEBFLOW_WEBHOOK_SECRETS` (au pluriel) accepte une liste séparée par des virgules, une par webhook enregistré.

## Champs personnalisés

Pour ajouter un champ (texte ou select) au-delà de titre/résumé/catégorie sans retoucher `EditPageDialog.tsx` à chaque fois : déclarer le champ dans [`src/config/customFields.ts`](src/config/customFields.ts) (vide par défaut, config de code — pas de CRUD en admin, volontairement, pour éviter la complexité d'un schema-builder complet). Le formulaire d'édition rend les champs dynamiquement à partir de cette liste.

Chaque champ a `perLocale: boolean` : `true` pour du contenu éditorial qui varie par langue (stocké par locale, même mécanisme que titre/résumé, avec le sélecteur de langue déjà en place) ; `false` pour un réglage/flag unique pour toute la page (stocké au niveau page, même mécanisme que catégorie/visibilité). Un champ `select` a des options à clé stable (`options[].key`) avec un libellé admin (`adminLabel`, une langue de référence) et, optionnellement, des libellés traduits par locale (`localeLabels`) — même modèle que les catégories — exposés par `/api/search-index` (jamais dans notre UI admin, qui reste toujours dans la langue de référence).

## Multilingue

Une page Webflow garde le même ID à travers toutes ses langues (Webflow ne duplique pas les pages par locale) — seuls le slug, le titre SEO et la meta-description sont propres à chaque langue. Le webhook récupère la liste des langues du site via `GET /v2/sites/{site_id}` (stockée dans `locales.json`) puis synchronise chaque page pour chaque langue. `/admin` affiche un sélecteur de langue dans la modal d'édition uniquement si le site a plus d'une langue configurée — un site mono-langue n'a aucun sélecteur.

## Authentification et rôles

Connexion par **magic link** (email → lien de connexion à usage unique, sans mot de passe), pas d'auto-inscription. Trois rôles, `editor < admin < super_admin` :

- **editor** — accède à `/admin` et édite le contenu des pages (y compris choisir une catégorie existante), en lecture seule sur les catégories/collections CMS elles-mêmes.
- **admin** — idem + gère les comptes `editor`/`admin` (ajout, changement de rôle, suppression) sur `/admin/users`, mais ne peut jamais créer/modifier/supprimer un compte `super_admin`, ni se promouvoir lui-même + gère la taxonomie (`/admin/categories`, `/admin/collections`).
- **super_admin** — accès total, y compris la gestion d'autres `super_admin`. Réservé au propriétaire du site / futurs devs. Accordé de façon permanente aux emails listés dans le secret `SUPER_ADMIN_EMAILS`, indépendamment du fichier utilisateurs — c'est ce qui amorce le tout premier accès (pas de page d'inscription).

Envoi des emails via [Resend](https://resend.com).

## Compte

Chaque utilisateur connecté gère son propre profil depuis `/admin/account` (lien "Mon compte" dans le menu du profil, bas de la sidebar) : nom complet, photo de profil, adresse email — en libre-service, sans passer par un `admin`.

Nom et photo sont stockés dans `profiles.json` (R2, `src/lib/profilesStore.ts`), **volontairement séparé** de `users.json` et sans aucun champ de rôle : ce store est purement descriptif et ne peut jamais accorder d'accès, y compris pour un `super_admin` bootstrap (accordé via `SUPER_ADMIN_EMAILS`, sans entrée dans `users.json`) qui édite son profil pour la première fois. La photo elle-même est un objet R2 dédié (`avatars/<email>`, servi par `GET /api/account/avatar/:email`), redimensionnée/compressée côté client avant l'envoi (256×256, WebP) — aucun traitement d'image côté Worker.

Changer d'adresse email réutilise l'infrastructure du lien magique de connexion : un lien de confirmation est envoyé à la **nouvelle** adresse (`POST /api/account/request-email-change` → `GET /api/auth/confirm-email-change`, même TTL 15 min/usage unique que la connexion) — le changement n'est appliqué qu'après ce clic, jamais immédiatement, pour éviter qu'une session compromise permette de détourner un compte en le rattachant à une autre adresse. Cette route de confirmation n'exige **pas** de session active (contrairement au reste de `/api/account`) puisqu'elle est cliquée depuis la boîte mail de la nouvelle adresse, potentiellement sur un autre appareil. Un `super_admin` bootstrap ne peut pas changer son adresse ainsi : son accès dépend de `SUPER_ADMIN_EMAILS`, hors de portée du self-service — le formulaire l'indique plutôt que de le masquer.

## Journal d'activité

`/admin/activity` (réservé aux `admin`/`super_admin`) liste qui a fait quoi : édition de page (seule ou en masse), création/édition/suppression de catégorie, configuration/édition/retrait de collection CMS, ajout/changement de rôle/suppression d'utilisateur. Volontairement **hors périmètre** : les changements de profil personnel (`/admin/account`), les événements de connexion, et la synchronisation webhook Webflow (automatique, pas une action humaine).

Contrairement à tous les autres stores de ce repo (des ensembles bornés d'entités "état courant", réécrits en entier à chaque modification), le journal est **non borné et append-only** — un seul document grossirait indéfiniment. Stocké à la place **un document R2 par mois** (`activity/2026-08.json`, `src/lib/activityLogStore.ts`) : seul le mois courant subit des écritures fréquentes, les mois précédents deviennent naturellement immuables une fois clos. L'écriture d'une entrée (`recordActivity`) est **best-effort** — appelée après que l'action principale a déjà réussi, une panne du journal ne fait jamais échouer la requête d'origine.

Pas de rétention/purge automatique : l'historique reste disponible indéfiniment, mois par mois, sans Cron de nettoyage.

## Checklist : cloner pour un nouveau site

À faire à chaque nouveau clonage, avant le premier déploiement réel :

1. **Renommer le Worker** — `wrangler.json` → `name` (actuellement `minisearch-admin`).
2. **Créer et renommer le bucket R2** — `wrangler.json` → `r2_buckets[0].bucket_name` (actuellement `minisearch-pages`). Sur Webflow Cloud, pas besoin de créer le bucket toi-même au préalable : il suffit de déclarer `binding`/`bucket_name` et de commit + push, Webflow Cloud le provisionne automatiquement au déploiement (confirmé — cf. dashboard "Storage quick start" → Object Storage). En Cloudflare Workers classique (hors Webflow Cloud), il faut le créer avant via `wrangler r2 bucket create <nom-du-bucket>`.
3. **Créer DEUX namespaces KV, AVANT le premier déploiement** — contrairement au bucket R2, un namespace KV doit déjà exister : son `id` est **obligatoire** dans `wrangler.json`, ce n'est pas auto-provisionné.
   - `AUTH_TOKENS` — nos liens de connexion à usage unique.
   - `SESSION` — **requis par le support de sessions natif de l'adaptateur Cloudflare d'Astro** (le cookie de connexion), même si aucun code du projet ne le référence directement. Sans lui, chaque connexion plante avec `[unstorage] [cloudflare] Invalid binding "SESSION": "undefined"` — et comme le lien magique est à usage unique, le clic suivant tombe sur "lien expiré" au lieu de reproduire l'erreur, ce qui peut brouiller le diagnostic.

   Sur Webflow Cloud : dashboard → "Storage quick start" → Key-value store, une fois par namespace. En CLI (si accès direct au compte Cloudflare) : `wrangler kv namespace create <nom>`. Colle chaque `id` obtenu dans `wrangler.json` → `kv_namespaces[...].id`, en remplaçant les placeholders `REPLACE_WITH_..._NAMESPACE_ID`.

   ⚠️ **Piège confirmé** : si un `id` est absent ou invalide, le build Webflow Cloud échoue la validation de schéma de `wrangler.json` et **remplace silencieusement tout le fichier par un template générique** pour ce déploiement — le bucket R2, les KV, les `vars` custom disparaissent tous sans message d'erreur visible côté dashboard (ce template générique de secours a par ailleurs son propre binding `SESSION` par défaut, ce qui peut faire croire à tort que la connexion fonctionne alors que rien de notre config custom n'est réellement déployé). Vérifier dans les logs de build la ligne `schema validation failed` / `copying wrangler template for astro` si un déploiement semble "ne rien connecter".
4. **Renseigner `WEBFLOW_SITE_ID`** dans `wrangler.json` (clé `vars`), l'ID du site Webflow ciblé.
5. **Créer les catégories** depuis `/admin/categories` une fois déployé (voir section "Catégories" ci-dessus) — plus un fichier de config à éditer. **(Optionnel)** configurer aussi les collections CMS destinées à la recherche depuis `/admin/collections` — voir section "Items CMS" ci-dessus. **(Optionnel)** déclarer des champs personnalisés dans [`src/config/customFields.ts`](src/config/customFields.ts) — voir section "Champs personnalisés" ci-dessus.
6. **Créer un token API Webflow** (Site settings → Apps & Integrations → API access, lecture des pages) et définir le secret `WEBFLOW_API_TOKEN` (jamais commité) — en local dans `.dev.vars`, en production via `wrangler secret put WEBFLOW_API_TOKEN` ou le dashboard Webflow Cloud.
7. **Enregistrer le(s) webhook(s) côté Webflow** (Site settings → Webhooks → Add webhook) pointant vers `https://<ton-app>/api/webhooks/webflow` — seulement une fois l'app déployée et son URL connue. Un webhook par `triggerType` à enregistrer :
   - `site_publish` — toujours nécessaire.
   - `collection_item_published`, `collection_item_unpublished`, `collection_item_deleted` — uniquement si des collections CMS sont configurées depuis `/admin/collections` (voir section "Items CMS" ci-dessus).

   Webflow **génère lui-même** une clé de signature à chaque création de webhook (affichée une seule fois, à copier immédiatement) — ce n'est pas une valeur qu'on choisit, et chaque webhook a la sienne. Concatène toutes les clés dans le secret `WEBFLOW_WEBHOOK_SECRETS` (au pluriel, séparées par des virgules — même emplacement que `WEBFLOW_API_TOKEN` ci-dessus). Chaque webhook signe ses requêtes (headers `x-webflow-signature` / `x-webflow-timestamp`, HMAC-SHA256) — `verifyWebflowSignature` (`src/lib/webhookSignature.ts`) accepte une requête si elle matche N'IMPORTE LAQUELLE des clés listées ; les requêtes non signées ou mal signées sont rejetées en 401.
8. **Configurer Resend** — vérifier un domaine d'envoi, renseigner `EMAIL_FROM_ADDRESS` dans `wrangler.json` (`vars`), et définir le secret `RESEND_API_KEY`.
9. **Définir `SUPER_ADMIN_EMAILS`** (secret, liste d'emails séparés par des virgules) — amorce le tout premier accès super_admin.
10. **(Optionnel) Adapter les seeds locaux** dans `seed/` — servent uniquement à peupler le R2/KV simulés en dev, sans impact en production.

## Seed de données en local

D'abord, copier le template de secrets locaux et le compléter :
```
cp .dev.vars.copy .dev.vars
```
`.dev.vars.copy` est commité (c'est un template, sans vraies valeurs) ; `.dev.vars` lui-même est gitignoré — ne jamais y mettre de vrais secrets sans vérifier qu'il reste bien ignoré. Renseigne au minimum `SUPER_ADMIN_EMAILS` avec ton email pour pouvoir te connecter ; `WEBFLOW_API_TOKEN`/`WEBFLOW_WEBHOOK_SECRETS` ne sont nécessaires que si tu testes le webhook ou `/admin/collections` contre un vrai site (sinon cette dernière page fonctionne avec des données simulées, voir section "Items CMS").

Sans appel webhook réel ni email envoyé, on peut ensuite peupler le R2 simulé localement :
```
npm run dev            # démarre le serveur (crée l'état Miniflare local)
wrangler r2 object put <nom-du-bucket>/pages.json --file=./seed/pages.local.json --local
wrangler r2 object put <nom-du-bucket>/locales.json --file=./seed/locales.local.json --local
wrangler r2 object put <nom-du-bucket>/categories.json --file=./seed/categories.local.json --local
wrangler r2 object put <nom-du-bucket>/cmsCollections.json --file=./seed/cmsCollections.local.json --local
wrangler r2 object put <nom-du-bucket>/users.json --file=./seed/users.local.json --local
wrangler r2 object put <nom-du-bucket>/profiles.json --file=./seed/profiles.local.json --local
# La clé du journal d'activité est datée (activity/<AAAA-MM>.json) — adapter au mois courant :
wrangler r2 object put <nom-du-bucket>/activity/$(date +%Y-%m).json --file=./seed/activity.local.json --local
```
En dev, `POST /api/auth/request-magic-link` n'appelle jamais Resend — il renvoie `devMagicLinkUrl` directement dans la réponse JSON (et l'affiche dans le formulaire de connexion) pour tester sans compte email.

Puis ouvrir `http://localhost:4321/admin`.

## Project structure

```text
.
├── .dev.vars.copy              # template de secrets locaux — copier en .dev.vars (gitignoré) et compléter
├── astro.config.mjs
├── package.json
├── seed/
│   ├── pages.local.json         # données d'exemple pour le dev local
│   ├── locales.local.json       # langues d'exemple pour le dev local
│   ├── categories.local.json    # catégories d'exemple pour le dev local
│   ├── cmsCollections.local.json # config collections CMS d'exemple pour le dev local
│   ├── users.local.json         # comptes d'exemple pour le dev local
│   ├── profiles.local.json      # profils (nom/avatar) d'exemple pour le dev local
│   └── activity.local.json      # entrées de journal d'exemple — clé R2 datée, voir section "Seed"
├── src/
│   ├── config/
│   │   ├── customFields.ts    # champs personnalisés déclarés en code — vide par défaut, à adapter par site
│   │   └── roles.ts           # rôles + règles d'escalade (partagé serveur/UI)
│   ├── components/
│   │   ├── admin/             # PagesAdmin, EditPageDialog, UsersAdmin, AddUserDialog, CategoriesAdmin, CategoryDialog, CmsCollectionsAdmin, CmsCollectionDialog, AccountSettings, ActivityLogAdmin, ConfirmDialog, ResetButton
│   │   ├── auth/               # LoginForm
│   │   └── ui/                # composants shadcn/ui
│   ├── env.d.ts                # types Astro.locals/session + secrets Cloudflare.Env
│   ├── middleware.ts           # résout l'utilisateur courant, protège /admin et /api (lecture editor / écriture admin par rule)
│   ├── layouts/
│   │   ├── Layout.astro
│   │   └── AdminLayout.astro   # header (email, liens users/categories/collections, déconnexion)
│   ├── lib/
│   │   ├── pagesStore.ts          # schéma + lecture/écriture R2 (pages.json)
│   │   ├── localesStore.ts        # schéma + lecture/écriture R2 (locales.json)
│   │   ├── categoriesStore.ts     # schéma + lecture/écriture R2 (categories.json) — taxonomie éditable en admin
│   │   ├── cmsCollectionsStore.ts # schéma + lecture/écriture R2 (cmsCollections.json)
│   │   ├── usersStore.ts          # schéma + lecture/écriture R2 (users.json)
│   │   ├── profilesStore.ts       # schéma + lecture/écriture R2 (profiles.json) — nom/avatar, jamais de rôle
│   │   ├── activityLogStore.ts    # schéma + lecture/écriture R2 (activity/<mois>.json), append-only par mois
│   │   ├── auth.ts                 # résolution email → rôle + profil (bootstrap + users.json + profiles.json)
│   │   ├── authTokens.ts           # tokens magic-link + changement d'email à usage unique (KV)
│   │   ├── resendClient.ts         # envoi d'email via Resend
│   │   ├── resizeImage.ts         # redimensionnement avatar côté client (canvas)
│   │   ├── webflowClient.ts       # client Webflow Data API v2
│   │   └── utils.ts
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── index.astro       # interface d'admin (contenu)
│   │   │   ├── users/index.astro       # interface d'admin (utilisateurs)
│   │   │   ├── categories/index.astro  # interface d'admin (catégories)
│   │   │   ├── collections/index.astro # interface d'admin (collections CMS)
│   │   │   ├── account/index.astro     # profil personnel (nom, avatar, email) — libre-service, tout rôle
│   │   │   └── activity/index.astro    # journal d'activité (admin/super_admin)
│   │   ├── login/
│   │   │   └── index.astro    # connexion par magic link
│   │   ├── api/
│   │   │   ├── auth/               # request-magic-link, verify, logout, confirm-email-change
│   │   │   ├── account/             # PATCH nom, POST/DELETE/GET avatar, POST request-email-change (self)
│   │   │   ├── users/               # GET/POST liste, PATCH/DELETE un utilisateur
│   │   │   ├── pages/               # GET liste / PATCH une page (avec localeId, customFields)
│   │   │   ├── locales/             # GET liste des langues du site
│   │   │   ├── categories/          # GET/POST liste, PATCH/DELETE une catégorie
│   │   │   ├── cms-collections/     # GET/POST liste, PATCH/DELETE une config de collection
│   │   │   ├── webflow-collections/ # GET proxy live vers les collections Webflow du site
│   │   │   ├── activity/            # GET journal d'activité, filtrable par mois/utilisateur
│   │   │   ├── search-index/       # GET public, index de recherche pour le widget externe
│   │   │   └── webhooks/
│   │   │       └── webflow.ts      # récepteur webhook Webflow
│   │   └── index.astro        # redirige vers /admin
│   └── styles/
│       └── global.css
├── tsconfig.json
├── webflow.json
├── wrangler.json
└── worker-configuration.d.ts   # généré par `wrangler types`, ne pas éditer à la main
```

## Commands

| Command | Action |
| :------ | :----- |
| `npm install` | Installs dependencies |
| `npm run dev` | Starts the Astro dev server at `http://localhost:4321` |
| `npm run build` | Builds the production site |
| `npm run preview` | Runs `astro build` then `wrangler dev` for a local preview |
| `npm run deploy` | Deploys with `webflow cloud deploy` |
| `npm run astro` | Runs the Astro CLI (e.g. `astro add`, `astro check`) |
| `npm run cf-typegen` | Generates Wrangler TypeScript types (`wrangler types`) |

## Learn more

- [Astro documentation](https://docs.astro.build)
- [Webflow Cloud](https://webflow.com/cloud)
