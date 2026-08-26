import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ADMIN_NAV_ITEMS } from "@/config/adminNav";
import type { AuthenticatedUser } from "@/lib/auth";

interface AdminShellProps {
  base: string;
  currentPath: string;
  user: AuthenticatedUser;
  title?: string;
  children: ReactNode;
}

// SidebarInset/SidebarTrigger need the same SidebarProvider context as
// AppSidebar (collapse state, mobile sheet) — they must be one React tree,
// so this mounts as a single client:load island wrapping the page content
// (passed in as Astro slot content -> React children).
export function AdminShell({ base, currentPath, user, title, children }: AdminShellProps) {
  const currentTitle = title ?? ADMIN_NAV_ITEMS.find((item) => `${base}${item.path}` === currentPath)?.title;

  return (
    // dark here (not just on AppSidebar) is what makes the SidebarProvider
    // wrapper's own "inset variant" gap background pick up the dark sidebar
    // color instead of leaking the light one — and it's also what lets
    // text-sidebar-foreground (set on the sidebar's true outer root, inside
    // AppSidebar) resolve to the dark value in the first place, since color
    // is fixed at the ancestor that sets it and just inherits from there.
    // SidebarInset counters back to light immediately below.
    <SidebarProvider className="dark">
      <AppSidebar base={base} currentPath={currentPath} user={user} />
      <SidebarInset className="light">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          {/* self-stretch (the Separator default for vertical orientation) can't
              actually stretch a height-capped item, and falls back to flex-start
              instead of the row's centered alignment — self-center overrides that. */}
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
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
