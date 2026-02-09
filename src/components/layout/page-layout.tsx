import { type ReactNode } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "./loading-spinner";
import { ErrorState } from "./error-state";

const containerVariants = cva(
  "mx-auto px-4 sm:px-6 lg:px-8 py-8",
  {
    variants: {
      maxWidth: {
        narrow: "max-w-3xl",
        medium: "max-w-5xl",
        wide: "max-w-7xl",
        full: "",
      },
    },
    defaultVariants: {
      maxWidth: "wide",
    },
  }
);

interface PageLayoutProps {
  children: ReactNode;
  maxWidth?: "narrow" | "medium" | "wide" | "full";
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

export function PageLayout({
  children,
  maxWidth,
  isLoading,
  error,
  onRetry,
  className,
}: PageLayoutProps) {
  const containerClass = cn(containerVariants({ maxWidth }), className);

  if (isLoading) {
    return (
      <div className={containerClass}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerClass}>
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  }

  return <div className={containerClass}>{children}</div>;
}
