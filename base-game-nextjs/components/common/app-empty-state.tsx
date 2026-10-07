import { cn } from "@/lib/utils"

interface AppEmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function AppEmptyState({ title, description, action, className }: AppEmptyStateProps) {
  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-4 py-16 text-center", className)}>
      <div className="flex flex-col items-center gap-1.5 max-w-sm">
        <p className="text-base font-semibold text-foreground tracking-tight">{title}</p>
        {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
      </div>

      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
