import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useActiveProject } from "@/lib/hooks/use-active-project";
import { useSidebar, SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectPickerProps {
  variant: "header" | "sidebar";
}

export function ProjectPicker({ variant }: ProjectPickerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeProjectId, setActiveProject, projects } = useActiveProject();
  const location = useRouterState({ select: (s) => s.location });

  const activeProject = projects?.find((p) => p.id === activeProjectId);

  const getCurrentSection = (): string | undefined => {
    if (location.pathname.includes("/create-pin")) return "create-pin";
    if (location.pathname.includes("/articles")) return "articles";
    if (location.pathname.includes("/pins")) return "pins";
    if (location.pathname.includes("/calendar")) return "calendar";
    return undefined;
  };

  const currentSection = getCurrentSection();

  const handleProjectSwitch = (projectId: string) => {
    setActiveProject(projectId, currentSection);
  };

  const dropdownContent = (
    <DropdownMenuContent
      align={variant === "header" ? "end" : "start"}
      side="bottom"
      className="w-56"
    >
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
  );

  if (variant === "header") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {activeProject ? (
              <>
                <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary shrink-0">
                  {activeProject.name.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[160px] truncate">
                  {activeProject.name}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {projects?.length === 0
                  ? t("nav.noProjects")
                  : t("nav.selectProject")}
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        {dropdownContent}
      </DropdownMenu>
    );
  }

  // Sidebar variant
  const { state } = useSidebar();

  return (
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
                  <span className="truncate flex-1">
                    {activeProject.name}
                  </span>
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
                    {projects?.length === 0
                      ? t("nav.noProjects")
                      : t("nav.selectProject")}
                  </span>
                  <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </>
              )}
            </>
          )}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      {dropdownContent}
    </DropdownMenu>
  );
}
