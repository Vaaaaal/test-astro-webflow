import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ADMIN_NAV_ITEMS } from "@/config/adminNav";
import type { Role } from "@/config/roles";

interface AdminShellProps {
  base: string;
  currentPath: string;
  user: { email: string; role: Role };
  children: ReactNode;
}

// SidebarInset/SidebarTrigger need the same SidebarProvider context as
// AppSidebar (collapse state, mobile sheet) — they must be one React tree,
// so this mounts as a single client:load island wrapping the page content
// (passed in as Astro slot content -> React children).
export function AdminShell({ base, currentPath, user, children }: AdminShellProps) {
  const currentTitle = ADMIN_NAV_ITEMS.find((item) => `${base}${item.path}` === currentPath)?.title;

  return (
    <SidebarProvider>
      <AppSidebar base={base} currentPath={currentPath} user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {currentTitle && (
            <>
              {/* Visible page title lives here instead of repeating as an <h1> in
                  every page body — an sr-only h1 keeps the a11y landmark. */}
              <h1 className="sr-only">{currentTitle}</h1>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-medium text-foreground">{currentTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </>
          )}
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
