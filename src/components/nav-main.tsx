import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// Flat nav, no sub-items — this app only has top-level admin sections, so
// the original block's collapsible-with-sub-items structure was dropped in
// favor of a plain list with active-page highlighting.
export function NavMain({
  items,
  currentPath,
}: {
  items: { title: string; url: string; icon: React.ReactNode }[];
  currentPath: string;
}) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild tooltip={item.title} isActive={currentPath === item.url}>
              <a href={item.url}>
                {item.icon}
                <span>{item.title}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
