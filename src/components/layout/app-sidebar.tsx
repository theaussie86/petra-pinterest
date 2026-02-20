import { version } from '../../../package.json';
import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, FolderOpen, FileText, Pin, Calendar, LogOut, ChevronsUpDown, Globe, PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AuthUser } from "@/lib/auth";
import { signOut } from "@/lib/auth";
import { useActiveProject } from "@/lib/hooks/use-active-project";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/ui/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectPicker } from "@/components/layout/project-picker";

interface AppSidebarProps {
  user: AuthUser;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  const { t, i18n } = useTranslation();
  const { activeProjectId } = useActiveProject();

  const globalNavItems = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("nav.projects"), url: "/projects", icon: FolderOpen },
  ];

  const projectNavItems = activeProjectId
    ? [
        { title: t("nav.articles"), url: `/projects/${activeProjectId}/articles`, icon: FileText, section: 'articles' },
        { title: t("nav.pins"), url: `/projects/${activeProjectId}/pins`, icon: Pin, section: 'pins' },
        { title: t("nav.createPin"), url: `/projects/${activeProjectId}/create-pin`, icon: PlusCircle, section: 'create-pin' },
        { title: t("nav.calendar"), url: `/projects/${activeProjectId}/calendar`, icon: Calendar, section: 'calendar' },
      ]
    : [];

  const handleSignOut = async () => {
    try {
      await signOut();
      await navigate({ to: "/" });
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "de" ? "en" : "de";
    i18n.changeLanguage(newLang);
  };

  // Get user initials for avatar
  const initials = user.display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Sidebar collapsible="icon" className="backdrop-blur-md bg-white/65 dark:bg-[#0E0A1F]/80 border-r border-purple-100/50 dark:border-white/5">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard" onClick={closeMobile}>
                  <Logo className="size-8! text-primary" />
                {state === "expanded" ? <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="bg-gradient-to-r from-violet-600 to-rose-600 bg-clip-text text-transparent font-extrabold text-lg" style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}>
                    Pinfinity
                  </span>
                  <span className="text-[10px] text-sidebar-foreground/40 font-mono tracking-wide">
                    v{version}
                  </span>
                </div> : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Global navigation */}
        <SidebarGroup>
          <SidebarMenu>
            {globalNavItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild>
                  <Link
                    to={item.url}
                    activeProps={{
                      className: "bg-sidebar-accent text-sidebar-accent-foreground",
                    }}
                    onClick={closeMobile}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* Mobile-only project picker */}
        <SidebarGroup className="md:hidden">
          {state === "expanded" && (
            <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {t("nav.selectProject")}
            </SidebarGroupLabel>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <ProjectPicker variant="sidebar" />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Project-scoped navigation */}
        <SidebarGroup>
          <SidebarMenu>
            {projectNavItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild>
                  <Link
                    to={item.url}
                    activeOptions={{ exact: false }}
                    activeProps={{
                      className: "bg-sidebar-accent text-sidebar-accent-foreground",
                    }}
                    onClick={closeMobile}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleLanguage}>
                <Globe />
                {state === "expanded" ? (
                  <span>
                    <span className={i18n.language === "de" ? "font-bold" : ""}>DE</span>
                    {" / "}
                    <span className={i18n.language === "en" ? "font-bold" : ""}>EN</span>
                  </span>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                      {initials}
                    </div>
                    {state === "expanded" ? (
                      <>
                        <span>{user.display_name}</span>
                        <ChevronsUpDown className="ml-auto h-4 w-4" />
                      </>
                    ) : null}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.display_name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {t("common.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
