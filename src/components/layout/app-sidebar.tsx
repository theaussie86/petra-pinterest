import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderOpen, FileText, Pin, Calendar, LogOut, ChevronsUpDown, Globe, ChevronDown, PlusCircle } from "lucide-react";
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

interface AppSidebarProps {
  user: AuthUser;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { t, i18n } = useTranslation();
  const { activeProjectId, setActiveProject, projects } = useActiveProject();
  const location = useRouterState({ select: (s) => s.location });

  const activeProject = projects?.find((p) => p.id === activeProjectId);

  // Detect which project-scoped section the user is currently on
  const getCurrentSection = (): string | undefined => {
    if (location.pathname.includes('/create-pin')) return 'create-pin';
    if (location.pathname.includes('/articles')) return 'articles';
    if (location.pathname.includes('/pins')) return 'pins';
    if (location.pathname.includes('/calendar')) return 'calendar';
    return undefined;
  };

  const currentSection = getCurrentSection();

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

  const handleProjectSwitch = (projectId: string) => {
    setActiveProject(projectId, currentSection);
  };

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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                  <Logo className="size-8! text-primary" />
                {state === "expanded" ? <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">PinMa</span>
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
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* Project selector + project-scoped navigation */}
        <SidebarGroup>
          {state === "expanded" && (
            <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {t("nav.selectProject")}
            </SidebarGroupLabel>
          )}
          <SidebarMenu>
            {/* Project dropdown */}
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="w-full">
                    {activeProject ? (
                      <>
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary shrink-0">
                          {activeProject.name.charAt(0).toUpperCase()}
                        </div>
                        {state === "expanded" && (
                          <>
                            <span className="truncate flex-1">{activeProject.name}</span>
                            <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <FolderOpen className="h-4 w-4 shrink-0 opacity-50" />
                        {state === "expanded" && (
                          <>
                            <span className="truncate flex-1 text-muted-foreground">
                              {projects?.length === 0 ? t("nav.noProjects") : t("nav.selectProject")}
                            </span>
                            <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                          </>
                        )}
                      </>
                    )}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" className="w-56">
                  {projects?.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleProjectSwitch(p.id)}
                      className={p.id === activeProjectId ? "bg-accent" : ""}
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary mr-2 shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{p.name}</span>
                    </DropdownMenuItem>
                  ))}
                  {projects && projects.length > 0 && (
                    <DropdownMenuItem onClick={() => navigate({ to: "/projects" })}>
                      <FolderOpen className="h-4 w-4 mr-2 opacity-50" />
                      {t("nav.manageProjects")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>

            {/* Project-scoped nav items */}
            {projectNavItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild>
                  <Link
                    to={item.url}
                    activeOptions={{ exact: false }}
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
