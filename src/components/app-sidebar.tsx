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
import { roleAtLeast, type Role } from "@/config/roles";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  base: string;
  currentPath: string;
  user: { email: string; role: Role };
}

export function AppSidebar({ base, currentPath, user, ...props }: AppSidebarProps) {
  const navGroups = ADMIN_NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.minRole || roleAtLeast(user.role, item.minRole))
      .map((item) => ({ title: item.title, url: `${base}${item.path}`, icon: <item.icon /> })),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar variant="inset" {...props}>
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
        <NavUser base={base} email={user.email} role={user.role} />
      </SidebarFooter>
    </Sidebar>
  );
}
