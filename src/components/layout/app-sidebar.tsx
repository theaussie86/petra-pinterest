import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Calendar, LogOut, ChevronsUpDown } from "lucide-react";
import type { AuthUser } from "@/lib/auth";
import { signOut } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppSidebarProps {
  user: AuthUser;
}

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Calendar", url: "/calendar", icon: Calendar },
];

export function AppSidebar({ user }: AppSidebarProps) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      await navigate({ to: "/" });
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  // Get user initials for avatar
  const initials = user.display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-4">
          <span className="text-xl font-bold">Petra</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <Link
                  to={item.url}
                  activeProps={{
                    className: "bg-sidebar-accent text-sidebar-accent-foreground",
                  }}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-medium text-white">
                    {initials}
                  </div>
                  <span>{user.display_name}</span>
                  <ChevronsUpDown className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.display_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
