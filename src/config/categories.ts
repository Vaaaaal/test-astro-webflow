/**
 * Search content categories for THIS site. Edit this list when cloning the
 * project for a new Webflow site — it drives the category `<select>` in the
 * admin UI and the validation on `PATCH /api/pages/:id`.
 *
 * Values are stable keys, not display strings — they're stored on pages and
 * must never change once in use (renaming a key here silently orphans any
 * page already tagged with the old one). Edit CATEGORY_ADMIN_LABELS to
 * change how a category is displayed.
 */
export const CATEGORIES = [
  "plateformes",
  "solutions",
  "etudes-de-cas",
  "documentation",
  "livres-blancs",
  "guides",
  "blog",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Label shown in the Astro admin UI — a single reference language, never
 * per-locale (the admin always displays categories in this one language,
 * regardless of which page locale is being edited). */
export const CATEGORY_ADMIN_LABELS: Record<Category, string> = {
  "plateformes": "Plateformes",
  "solutions": "Solutions",
  "etudes-de-cas": "Études de cas",
  "documentation": "Documentation",
  "livres-blancs": "Livres blancs",
  "guides": "Guides",
  "blog": "Blog",
};

/**
 * Per-locale labels for the future public search widget (not built yet, no
 * consumer of this map exists in this repo today) — keyed by Webflow locale
 * `tag` (e.g. "en-US"), not `localeId`. Add one object key per locale tag the
 * site actually has (see `locales.json` / GET /api/locales); a locale with no
 * entry here falls back to CATEGORY_ADMIN_LABELS via getCategoryLabel below.
 */
export const CATEGORY_LOCALE_LABELS: Partial<Record<string, Partial<Record<Category, string>>>> = {
  "fr-FR": {
    "plateformes": "Plateformes",
    "solutions": "Solutions",
    "etudes-de-cas": "Études de cas",
    "documentation": "Documentation",
    "livres-blancs": "Livres blancs",
    "guides": "Guides",
    "blog": "Blog",
  },
  "en-US": {
    "plateformes": "Platforms",
    "solutions": "Solutions",
    "etudes-de-cas": "Case studies",
    "documentation": "Documentation",
    "livres-blancs": "White papers",
    "guides": "Guides",
    "blog": "Blog",
  },
};

/**
 * Resolves the display label for a category in a given locale, for the
 * future public search widget. Falls back to CATEGORY_ADMIN_LABELS when the
 * locale tag isn't in CATEGORY_LOCALE_LABELS, or when that locale hasn't set
 * a translation for this particular category yet.
 */
export function getCategoryLabel(category: Category, localeTag: string): string {
  return CATEGORY_LOCALE_LABELS[localeTag]?.[category] ?? CATEGORY_ADMIN_LABELS[category];
}

export interface CategoryRule {
  category: Category;
  /**
   * Slug prefix to match, per locale tag (e.g. "fr-FR", "en-US") — needed
   * because full slug localization can translate folder segments too (e.g.
   * "blog/" -> "artikel/" in German), not just the leaf page slug. "*" is
   * the fallback prefix used for any locale not explicitly listed; omit it
   * if a rule should only ever apply to the locales listed explicitly.
   */
  prefixes: Partial<Record<string, string>>;
}

/**
 * Default category assigned to a page the first time the webhook sees it,
 * based on its URL slug — first matching rule wins. Only applied at page
 * creation (see webhooks/webflow.ts); never re-applied on later publishes,
 * so it never overrides an editor's later choice, including clearing it back
 * to "no category".
 */
export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  { category: "blog", prefixes: { "*": "blog/" } },
  { category: "documentation", prefixes: { "*": "documentation/" } },
  { category: "guides", prefixes: { "*": "guides/" } },
  { category: "etudes-de-cas", prefixes: { "*": "etudes-de-cas/" } },
  { category: "livres-blancs", prefixes: { "*": "livres-blancs/" } },
];

/**
 * Resolves the default category for a newly-seen page from its slug across
 * every locale it exists in (not just the primary locale) — a site can
 * localize slugs per language on some Webflow plans, but the folder-level
 * prefix usually survives translation even when the leaf segment doesn't,
 * so checking every locale catches that common case. When a rule specifies
 * a prefix for a particular locale, that prefix is used for that locale
 * instead of "*" — for sites where folder segments genuinely do get
 * translated differently per language. Returns null (today's default) when
 * no rule matches any locale.
 */
export function resolveDefaultCategory(
  slugsByLocale: { localeTag: string; slug: string }[]
): Category | null {
  for (const rule of DEFAULT_CATEGORY_RULES) {
    for (const { localeTag, slug } of slugsByLocale) {
      const prefix = rule.prefixes[localeTag] ?? rule.prefixes["*"];
      if (prefix !== undefined && slug.startsWith(prefix)) {
        return rule.category;
      }
    }
  }
  return null;
}
