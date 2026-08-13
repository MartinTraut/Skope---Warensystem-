import { Panel } from "./primitives"
import { cn } from "@/lib/utils"

/**
 * Ladezustände.
 *
 * Sie erscheinen, während der persistierte Demo-Zustand aus dem Browser
 * geladen wird, und später während der echte Datenabruf läuft. Die Formen
 * entsprechen bewusst dem späteren Inhalt, damit das Layout nicht springt.
 */

function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-3 animate-pulse rounded bg-surface-raised", className)}
      aria-hidden
    />
  )
}

export function MetricGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Panel key={index} className="p-4 sm:p-5">
          <Bar className="w-20" />
          <Bar className="mt-4 h-7 w-24" />
          <Bar className="mt-3 h-2.5 w-16" />
        </Panel>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-skope-line">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <Bar className="w-28" />
            <Bar className="mt-2 h-2.5 w-40" />
          </div>
          <Bar className="hidden h-6 w-24 rounded-full sm:block" />
          <Bar className="hidden h-6 w-20 rounded-full md:block" />
          <Bar className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex gap-3">
          <div className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-surface-track" />
          <div className="min-w-0 flex-1">
            <Bar className="w-44" />
            <Bar className="mt-2 h-2.5 w-28" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-5", className)}>
      <Bar className="w-32" />
      <Bar className="mt-4 h-2.5 w-full" />
      <Bar className="mt-2 h-2.5 w-4/5" />
      <Bar className="mt-2 h-2.5 w-2/3" />
    </Panel>
  )
}
