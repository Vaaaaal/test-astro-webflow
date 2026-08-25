# Minisearch — Admin de contenu de recherche

App [Astro](https://astro.build) + React (Cloudflare adapter) déployée sur [Webflow Cloud](https://webflow.com/cloud). Elle fournit une interface d'admin (`/admin`) pour curer les métadonnées de recherche (titre, résumé, catégorie, visibilité) des pages d'**un** site Webflow, à partir d'un document JSON stocké dans Cloudflare R2 qui sert de source de vérité pour une recherche plus riche que la recherche native Webflow.

Ce repo est pensé comme un **template à cloner par site** : un déploiement (un Worker, un bucket R2) = un site Webflow. Pour ajouter un nouveau site, clone ce repo et suis la checklist ci-dessous plutôt que de modifier ce déploiement existant.

## Comment ça marche

- **Automatique** : `POST /api/webhooks/webflow` reçoit l'événement de publication Webflow (`site_publish`) et synchronise, pour chaque langue configurée sur le site, les champs techniques de chaque page (slug, titre SEO natif, meta-description) via l'API Webflow Data v2. Il ne crée/actualise que les champs techniques — jamais les champs éditoriaux.
- **Manuel** : `/admin` liste les pages déjà connues et permet d'éditer, pour chacune, le titre et le résumé (par langue si le site est multilingue), la catégorie et la visibilité en recherche (ces deux derniers au niveau de la page, pas par langue). Aucune page ne peut être créée ou supprimée depuis cette interface — seul le webhook fait apparaître de nouvelles entrées.

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
2. **Créer et renommer le bucket R2** — `wrangler.json` → `r2_buckets[0].bucket_name` (actuellement `minisearch-pages`), puis :
   ```
   wrangler r2 bucket create <nom-du-bucket>
   ```
3. **Renseigner `WEBFLOW_SITE_ID`** dans `wrangler.json` (clé `vars`), l'ID du site Webflow ciblé.
4. **Adapter les catégories** dans [`src/config/categories.ts`](src/config/categories.ts) — clés stables + libellé admin (une seule langue). Les traductions par langue (`CATEGORY_LOCALE_LABELS`) sont à compléter séparément, plus tard, quand le widget de recherche public existera. `DEFAULT_CATEGORY_RULES` assigne une catégorie de départ (toujours modifiable ensuite en admin) à une page selon un préfixe de son slug, testé sur chaque langue — `"*"` est le préfixe utilisé par défaut, à préciser par tag de locale (`"fr-FR"`, `"de-DE"`, ...) uniquement si un site traduit ses segments de dossier différemment selon la langue.
5. **Créer un token API Webflow** (Site settings → Apps & Integrations → API access, lecture des pages) et définir les secrets (jamais commités) :
   - En local, dans `.dev.vars` (gitignoré) :
     ```
     WEBFLOW_API_TOKEN=...
     WEBHOOK_SHARED_SECRET=...
     ```
   - En production : `wrangler secret put WEBFLOW_API_TOKEN` / `wrangler secret put WEBHOOK_SHARED_SECRET` (ou l'équivalent via le dashboard Webflow Cloud si les secrets Worker n'y sont pas gérés en CLI directe — à vérifier selon la configuration du projet Cloud).
6. **Enregistrer le webhook** côté Webflow (trigger `site_publish`) pointant vers `https://<ton-app>/api/webhooks/webflow`, avec un header `X-Webhook-Secret` égal à `WEBHOOK_SHARED_SECRET`.
7. **Créer le namespace KV pour les liens de connexion** :
   ```
   wrangler kv namespace create AUTH_TOKENS
   ```
   Le binding `AUTH_TOKENS` dans `wrangler.json` n'a volontairement pas d'`id` (comme le binding `SESSION` d'Astro) — Wrangler le provisionne automatiquement au déploiement. Si `webflow cloud deploy` ne relaie pas cet auto-provisioning, créer le namespace manuellement avec la commande ci-dessus et ajouter l'`id` retourné dans `wrangler.json`.
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
