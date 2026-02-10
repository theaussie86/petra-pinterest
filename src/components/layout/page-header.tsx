import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export interface BreadcrumbItemType {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItemType[];
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="border-b bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <BreadcrumbItem key={index}>
                    {item.href && !isLast ? (
                      <>
                        <BreadcrumbLink asChild>
                          <Link to={item.href}>{item.label}</Link>
                        </BreadcrumbLink>
                        {!isLast && <BreadcrumbSeparator />}
                      </>
                    ) : (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {description && (
            <p className="text-sm text-slate-600 mt-1">{description}</p>
          )}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    </header>
  );
}
