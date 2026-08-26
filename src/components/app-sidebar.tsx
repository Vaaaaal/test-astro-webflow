import * as React from "react";
import { SearchIcon, UsersIcon, TagIcon, DatabaseIcon, TerminalIcon } from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { roleAtLeast, type Role } from "@/config/roles";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  base: string;
  currentPath: string;
  user: { email: string; role: Role };
}

export function AppSidebar({ base, currentPath, user, ...props }: AppSidebarProps) {
  const isAdmin = roleAtLeast(user.role, "admin");

  const navMain = [
    { title: "Contenu de recherche", url: `${base}/admin`, icon: <SearchIcon /> },
    ...(isAdmin
      ? [
          { title: "Utilisateurs", url: `${base}/admin/users`, icon: <UsersIcon /> },
          { title: "Catégories", url: `${base}/admin/categories`, icon: <TagIcon /> },
          { title: "Collections CMS", url: `${base}/admin/collections`, icon: <DatabaseIcon /> },
        ]
      : []),
  ];

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href={`${base}/admin`}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <TerminalIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Minisearch</span>
                  <span className="truncate text-xs">Admin</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} currentPath={currentPath} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser base={base} email={user.email} />
      </SidebarFooter>
    </Sidebar>
  );
}
