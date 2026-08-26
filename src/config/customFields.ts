/**
 * Extra fields for search entries, beyond title/summary/category — declared
 * here, not editable via an admin UI. Adding a field is a one-time config
 * edit per clone, not new component code: EditPageDialog renders these
 * dynamically. Empty by default.
 */

export interface CustomFieldOption {
  key: string; // stable, stored as-is
  adminLabel: string; // shown in our admin UI, one reference language
  localeLabels?: Partial<Record<string, string>>; // for the public search widget, per locale tag; falls back to adminLabel
}

export interface CustomFieldConfig {
  key: string;
  label: string; // field label in the edit form
  type: "text" | "select";
  options?: CustomFieldOption[]; // required if type === "select"
  /**
   * Does the VALUE itself vary by language (editorial text, or a select
   * whose choice genuinely differs per language) — stored per locale, same
   * mechanism as title/summary — or is there one value for the whole page
   * (a setting/flag, e.g. "priority") — stored at the page level, same as
   * category/visibleInSearch?
   */
  perLocale: boolean;
}

export const CUSTOM_FIELDS: CustomFieldConfig[] = [];

export function getCustomFieldConfig(key: string): CustomFieldConfig | undefined {
  return CUSTOM_FIELDS.find((f) => f.key === key);
}

/**
 * Resolves the display label for a select field's chosen option, for the
 * future public search widget. Falls back to the option's admin label (or
 * the raw stored value if the option itself is unknown) when the locale tag
 * has no translation set.
 */
export function getCustomFieldOptionLabel(
  field: CustomFieldConfig,
  value: string,
  localeTag: string
): string {
  const option = field.options?.find((o) => o.key === value);
  if (!option) return value;
  return option.localeLabels?.[localeTag] ?? option.adminLabel;
}
