# Minisearch — Admin de contenu de recherche

App [Astro](https://astro.build) + React (Cloudflare adapter) déployée sur [Webflow Cloud](https://webflow.com/cloud). Elle fournit une interface d'admin (`/admin`) pour curer les métadonnées de recherche (titre, résumé, catégorie, visibilité) des pages d'**un** site Webflow, à partir d'un document JSON stocké dans Cloudflare R2 qui sert de source de vérité pour une recherche plus riche que la recherche native Webflow.

Ce repo est pensé comme un **template à cloner par site** : un déploiement (un Worker, un bucket R2) = un site Webflow. Pour ajouter un nouveau site, clone ce repo et suis la checklist ci-dessous plutôt que de modifier ce déploiement existant.

## Comment ça marche

- **Automatique** : `POST /api/webhooks/webflow` reçoit les événements Webflow et synchronise deux types de contenu distincts (`kind: "page" | "cms"` sur chaque entrée, cf. section CMS ci-dessous) :
  - `site_publish` — re-liste **toutes** les pages statiques du site, pour chaque langue configurée (slug, titre SEO natif, meta-description) via l'API Webflow Data v2.
  - `collection_item_published` / `collection_item_unpublished` / `collection_item_deleted` — upsert ou suppression **incrémentale** d'un seul item CMS.

  Dans tous les cas, seuls les champs techniques sont créés/actualisés — jamais les champs éditoriaux.
- **Manuel** : `/admin` liste les pages et items CMS déjà connus (badge "Page"/"CMS" dans le tableau) et permet d'éditer, pour chacun, le titre et le résumé (par langue si le site est multilingue), la catégorie et la visibilité en recherche (ces deux derniers au niveau de l'entrée, pas par langue). Rien ne peut être créé ou supprimé depuis cette interface — seul le webhook fait apparaître/disparaître des entrées.
- **Public** : `GET /api/search-index` (pas d'authentification, CORS ouvert) renvoie les entrées avec `visibleInSearch: true` uniquement (pages et items CMS mélangés, indistincts pour le consommateur), aplaties pour une langue donnée — c'est ce qu'un widget de recherche externe consomme. Paramètre `?locale=<tag>` optionnel (ex. `en-US`) ; sans lui, renvoie la langue primaire du site. Réponse : `[{ url, title, summary, category }]`, avec repli automatique titre/résumé sur les valeurs Webflow natives si pas de surcharge éditoriale, et libellé de catégorie déjà traduit pour la langue demandée.

## Items CMS

Une collection CMS est une ressource Webflow différente des pages statiques (`GET /v2/collections/{id}/items`, pas `GET /v2/sites/{id}/pages`) — invisible au webhook `site_publish`. Seules les collections listées dans [`src/config/cmsCollections.ts`](src/config/cmsCollections.ts) sont synchronisées (vide par défaut, à compléter par site — même philosophie que `CATEGORIES`, pas d'auto-découverte qui synchroniserait des collections non destinées à la recherche comme témoignages ou équipe).

Contrairement aux pages statiques, un item CMS n'a **aucun champ SEO standardisé** exposé par l'API (le titre/la description affichés sur le site sont liés à des champs dynamiques au niveau du template de page de collection, pas retournés tels quels) — `summaryField` dans la config indique quelle clé `fieldData` utiliser comme résumé, à défaut le résumé reste vide jusqu'à édition manuelle. `defaultCategory` assigne une catégorie de départ à la création (toujours modifiable ensuite) — l'identité de la collection suffit comme signal, pas besoin de préfixe d'URL comme pour les pages.

L'URL d'un item (`{sous-répertoire de langue}/{slug de la collection}/{slug de l'item}`) est reconstruite manuellement — Webflow ne l'expose pas directement pour les items CMS comme il le fait pour les pages (`publishedPath`). **Non vérifié empiriquement contre un vrai site avec une vraie collection** — à confirmer dès qu'un cas réel existe.

Chaque webhook Webflow enregistré (un par `triggerType`) génère sa propre clé de signature — `WEBFLOW_WEBHOOK_SECRETS` (au pluriel) accepte une liste séparée par des virgules, une par webhook enregistré.

## Multilingue

Une page Webflow garde le même ID à travers toutes ses langues (Webflow ne duplique pas les pages par locale) — seuls le slug, le titre SEO et la meta-description sont propres à chaque langue. Le webhook récupère la liste des langues du site via `GET /v2/sites/{site_id}` (stockée dans `locales.json`) puis synchronise chaque page pour chaque langue. `/admin` affiche un sélecteur de langue dans la modal d'édition uniquement si le site a plus d'une langue configurée — un site mono-langue n'a aucun sélecteur.

Les **catégories** sont des clés stables (`src/config/categories.ts`), pas des libellés — l'admin Astro les affiche toujours dans une seule langue de référence (`CATEGORY_ADMIN_LABELS`), quelle que soit la langue de la page éditée. La traduction des libellés par langue (`CATEGORY_LOCALE_LABELS`, une entrée par tag de locale comme `en-US`, toutes les catégories de cette langue regroupées ensemble) est prévue pour un futur widget de recherche public — un exemple fr-FR/en-US est déjà rempli, à adapter par site ; `getCategoryLabel(category, localeTag)` fait le lookup avec repli automatique sur `CATEGORY_ADMIN_LABELS` si une langue/catégorie n'a pas encore de traduction. Aucune API ne l'expose encore, aucun consommateur n'existe pour l'instant.

## Authentification et rôles

Connexion par **magic link** (email → lien de connexion à usage unique, sans mot de passe), pas d'auto-inscription. Trois rôles, `editor < admin < super_admin` :

- **editor** — accède à `/admin` et édite le contenu des pages.
- **admin** — idem + gère les comptes `editor`/`admin` (ajout, changement de rôle, suppression) sur `/admin/users`, mais ne peut jamais créer/modifier/supprimer un compte `super_admin`, ni se promouvoir lui-même.
- **super_admin** — accès total, y compris la gestion d'autres `super_admin`. Réservé au propriétaire du site / futurs devs. Accordé de façon permanente aux emails listés dans le secret `SUPER_ADMIN_EMAILS`, indépendamment du fichier utilisateurs — c'est ce qui amorce le tout premier accès (pas de page d'inscription).

Envoi des emails via [Resend](https://resend.com).

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
5. **Adapter les catégories** dans [`src/config/categories.ts`](src/config/categories.ts) — clés stables + libellé admin (une seule langue). Les traductions par langue (`CATEGORY_LOCALE_LABELS`) sont à compléter séparément, plus tard, quand le widget de recherche public existera. `DEFAULT_CATEGORY_RULES` assigne une catégorie de départ (toujours modifiable ensuite en admin) à une page selon un préfixe de son slug, testé sur chaque langue — `"*"` est le préfixe utilisé par défaut, à préciser par tag de locale (`"fr-FR"`, `"de-DE"`, ...) uniquement si un site traduit ses segments de dossier différemment selon la langue. **(Optionnel)** configurer aussi les collections CMS destinées à la recherche dans [`src/config/cmsCollections.ts`](src/config/cmsCollections.ts) — voir section "Items CMS" ci-dessus.
6. **Créer un token API Webflow** (Site settings → Apps & Integrations → API access, lecture des pages) et définir le secret `WEBFLOW_API_TOKEN` (jamais commité) — en local dans `.dev.vars`, en production via `wrangler secret put WEBFLOW_API_TOKEN` ou le dashboard Webflow Cloud.
7. **Enregistrer le(s) webhook(s) côté Webflow** (Site settings → Webhooks → Add webhook) pointant vers `https://<ton-app>/api/webhooks/webflow` — seulement une fois l'app déployée et son URL connue. Un webhook par `triggerType` à enregistrer :
   - `site_publish` — toujours nécessaire.
   - `collection_item_published`, `collection_item_unpublished`, `collection_item_deleted` — uniquement si des collections CMS sont listées dans `src/config/cmsCollections.ts` (voir section "Items CMS" ci-dessus).

   Webflow **génère lui-même** une clé de signature à chaque création de webhook (affichée une seule fois, à copier immédiatement) — ce n'est pas une valeur qu'on choisit, et chaque webhook a la sienne. Concatène toutes les clés dans le secret `WEBFLOW_WEBHOOK_SECRETS` (au pluriel, séparées par des virgules — même emplacement que `WEBFLOW_API_TOKEN` ci-dessus). Chaque webhook signe ses requêtes (headers `x-webflow-signature` / `x-webflow-timestamp`, HMAC-SHA256) — `verifyWebflowSignature` (`src/lib/webhookSignature.ts`) accepte une requête si elle matche N'IMPORTE LAQUELLE des clés listées ; les requêtes non signées ou mal signées sont rejetées en 401.
8. **Configurer Resend** — vérifier un domaine d'envoi, renseigner `EMAIL_FROM_ADDRESS` dans `wrangler.json` (`vars`), et définir le secret `RESEND_API_KEY`.
9. **Définir `SUPER_ADMIN_EMAILS`** (secret, liste d'emails séparés par des virgules) — amorce le tout premier accès super_admin.
10. **(Optionnel) Adapter les seeds locaux** dans [`seed/pages.local.json`](seed/pages.local.json), [`seed/locales.local.json`](seed/locales.local.json) et [`seed/users.local.json`](seed/users.local.json) — servent uniquement à peupler le R2/KV simulés en dev, sans impact en production.

## Seed de données en local

Sans appel webhook réel ni email envoyé, on peut peupler le R2 simulé localement :
```
npm run dev            # démarre le serveur (crée l'état Miniflare local)
wrangler r2 object put <nom-du-bucket>/pages.json --file=./seed/pages.local.json --local
wrangler r2 object put <nom-du-bucket>/locales.json --file=./seed/locales.local.json --local
wrangler r2 object put <nom-du-bucket>/users.json --file=./seed/users.local.json --local
```
Dans `.dev.vars`, définir `SUPER_ADMIN_EMAILS=<ton email>` pour te connecter sans être dans `users.json`. En dev, `POST /api/auth/request-magic-link` n'appelle jamais Resend — il renvoie `devMagicLinkUrl` directement dans la réponse JSON (et l'affiche dans le formulaire de connexion) pour tester sans compte email.

Puis ouvrir `http://localhost:4321/admin`.

## Project structure

```text
.
├── astro.config.mjs
├── package.json
├── seed/
│   ├── pages.local.json       # données d'exemple pour le dev local
│   ├── locales.local.json     # langues d'exemple pour le dev local
│   └── users.local.json       # comptes d'exemple pour le dev local
├── src/
│   ├── config/
│   │   ├── categories.ts      # taxonomie de recherche — à adapter par site
│   │   ├── cmsCollections.ts  # collections CMS synchronisées — vide par défaut, à adapter par site
│   │   └── roles.ts           # rôles + règles d'escalade (partagé serveur/UI)
│   ├── components/
│   │   ├── admin/             # PagesAdmin, EditPageDialog, UsersAdmin, AddUserDialog
│   │   ├── auth/               # LoginForm
│   │   └── ui/                # composants shadcn/ui
│   ├── env.d.ts                # types Astro.locals/session + secrets Cloudflare.Env
│   ├── middleware.ts           # résout l'utilisateur courant, protège /admin et /api
│   ├── layouts/
│   │   ├── Layout.astro
│   │   └── AdminLayout.astro   # header (email, lien users, déconnexion)
│   ├── lib/
│   │   ├── pagesStore.ts      # schéma + lecture/écriture R2 (pages.json)
│   │   ├── localesStore.ts    # schéma + lecture/écriture R2 (locales.json)
│   │   ├── usersStore.ts      # schéma + lecture/écriture R2 (users.json)
│   │   ├── auth.ts             # résolution email → rôle (bootstrap + users.json)
│   │   ├── authTokens.ts       # tokens magic-link à usage unique (KV)
│   │   ├── resendClient.ts     # envoi d'email via Resend
│   │   ├── webflowClient.ts   # client Webflow Data API v2
│   │   └── utils.ts
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── index.astro    # interface d'admin (contenu)
│   │   │   └── users/
│   │   │       └── index.astro # interface d'admin (utilisateurs)
│   │   ├── login/
│   │   │   └── index.astro    # connexion par magic link
│   │   ├── api/
│   │   │   ├── auth/          # request-magic-link, verify, logout
│   │   │   ├── users/         # GET/POST liste, PATCH/DELETE un utilisateur
│   │   │   ├── pages/         # GET liste / PATCH une page (avec localeId)
│   │   │   ├── locales/       # GET liste des langues du site
│   │   │   ├── search-index/  # GET public, index de recherche pour le widget externe
│   │   │   └── webhooks/
│   │   │       └── webflow.ts # récepteur webhook Webflow
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
