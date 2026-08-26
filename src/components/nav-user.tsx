import { useRef } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AuthenticatedUser } from "@/lib/auth";
import { ChevronsUpDownIcon, LogOutIcon, UserCogIcon } from "lucide-react";

export function NavUser({ base, user }: { base: string; user: AuthenticatedUser }) {
  const { isMobile } = useSidebar();
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const initial = (user.name || user.email).charAt(0).toUpperCase();
  const avatarSrc = user.hasAvatar ? `${base}/api/account/avatar/${encodeURIComponent(user.email)}` : undefined;
  const primaryLine = user.name || user.email;
  const secondaryLine = user.name ? user.email : user.role;

  return (
    <SidebarMenu>
      {/* Real POST logout, same route as before — triggered programmatically
          from the dropdown item below instead of a visible submit button. */}
      <form ref={logoutFormRef} method="POST" action={`${base}/api/auth/logout`} className="hidden" />
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
                <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{primaryLine}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{secondaryLine}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
                  <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{primaryLine}</span>
                  {user.name && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
                  <Badge variant="outline" className="mt-0.5 w-fit text-[10px]">
                    {user.role}
                  </Badge>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={`${base}/admin/account`}>
                <UserCogIcon />
                Mon compte
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logoutFormRef.current?.requestSubmit()}>
              <LogOutIcon />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
