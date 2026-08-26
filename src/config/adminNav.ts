import { DatabaseIcon, SearchIcon, TagIcon, UsersIcon, type LucideIcon } from "lucide-react";
import type { Role } from "@/config/roles";

export interface AdminNavItem {
  title: string;
  path: string; // relative to BASE_URL, e.g. "/admin/users"
  icon: LucideIcon;
  minRole?: Role; // omit = any logged-in user (editor+)
}

// Single source of truth for the sidebar nav and the header breadcrumb, so
// a page's title/icon/role gate can't drift between the two.
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { title: "Contenu de recherche", path: "/admin", icon: SearchIcon },
  { title: "Utilisateurs", path: "/admin/users", icon: UsersIcon, minRole: "admin" },
  { title: "Catégories", path: "/admin/categories", icon: TagIcon, minRole: "admin" },
  { title: "Collections CMS", path: "/admin/collections", icon: DatabaseIcon, minRole: "admin" },
];
