import * as React from "react";

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
import { ADMIN_NAV_GROUPS } from "@/config/adminNav";
import { roleAtLeast } from "@/config/roles";
import type { AuthenticatedUser } from "@/lib/auth";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  base: string;
  currentPath: string;
  user: AuthenticatedUser;
}

export function AppSidebar({ base, currentPath, user, ...props }: AppSidebarProps) {
  const navGroups = ADMIN_NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.minRole || roleAtLeast(user.role, item.minRole))
      .map((item) => ({ title: item.title, url: `${base}${item.path}`, icon: <item.icon /> })),
  })).filter((group) => group.items.length > 0);

  return (
    // className="dark" here is redundant with AdminShell's SidebarProvider
    // on desktop (already an ancestor), but it's the only thing that reaches
    // the mobile drawer: that variant renders through a Sheet portal, which
    // teleports its DOM near <body> and breaks React-tree-based inheritance
    // from any ancestor .dark — it needs its own, explicit here.
    <Sidebar variant="inset" className="dark" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href={`${base}/admin`}>
                <img src={`${base}/logo.svg`} alt="" className="size-8 shrink-0 rounded-lg" />
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
        {navGroups.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items} currentPath={currentPath} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser base={base} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
