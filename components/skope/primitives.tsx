import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Wiederkehrende Layout- und Anzeigebausteine des Cockpits.
 *
 * Bewusst klein gehalten und an einem Ort gebündelt, damit Abstände,
 * Kantenradien und Typo-Stufen überall identisch sind.
 */

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

/**
 * Farbliche Einordnung einer Karte.
 *
 * Nicht Dekoration: Der Ton sagt, was die Liste darunter bedeutet. „warn"
 * steht für Arbeit, die noch ansteht, „error" für einen echten Störfall.
 */
export type PanelTone = "warn" | "error"

interface PanelProps extends ComponentProps<"section"> {
  /** Metallische Oberkante im Markenton — nur für die wichtigste Karte je Ansicht. */
  accent?: boolean
  tone?: PanelTone
}

export function Panel({ className, accent, tone, ...props }: PanelProps) {
  return (
    <section
      className={cn(
        "skope-panel",
        accent && "skope-panel-accent",
        tone === "warn" && "skope-panel-warn",
        tone === "error" && "skope-panel-error",
        className
      )}
      {...props}
    />
  )
}

interface PanelHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** Symbol links vom Titel. Trägt zusammen mit `tone` die Einordnung. */
  icon?: ReactNode
  tone?: PanelTone
  className?: string
}

export function PanelHeader({
  title,
  description,
  action,
  icon,
  tone,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-skope-line px-4 py-3.5 sm:px-5",
        /*
          Der gefärbte Kopf ist kein Schmuck, sondern der Unterschied zwischen
          „hier ist eine Liste" und „hier ist eine Liste mit Problemen".
          Deshalb die ganze Fläche und nicht nur der Titel.
        */
        tone === "warn" &&
          "border-state-warn/25 bg-state-warn/8 text-state-warn",
        tone === "error" &&
          "border-state-error/25 bg-state-error/8 text-state-error",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
              tone === "warn" && "bg-state-warn/15 text-state-warn",
              tone === "error" && "bg-state-error/15 text-state-error",
              !tone && "bg-surface-raised text-muted-foreground"
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2
            className={cn(
              "type-section",
              tone ? "text-current" : "text-foreground"
            )}
          >
            {title}
          </h2>
          {description && (
            <p
              className={cn(
                "mt-1 text-sm",
                // Abgeschwächt, aber im selben Ton — sonst zerfällt der Kopf
                // in eine farbige und eine graue Hälfte.
                tone ? "text-current/75" : "text-muted-foreground"
              )}
            >
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />
}

/* ------------------------------------------------------------------ */
/* Seitenkopf                                                          */
/* ------------------------------------------------------------------ */

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Kleine Zeile über dem Titel, z. B. Scooter-Nummer. */
  eyebrow?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="type-page-title text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Feldanzeige                                                         */
/* ------------------------------------------------------------------ */

interface DataFieldProps {
  label: ReactNode
  value: ReactNode
  /** Werte, die technisch sind (IDs, Seriennummern) in Monospace setzen. */
  mono?: boolean
  className?: string
}

export function DataField({ label, value, mono, className }: DataFieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="type-label">{label}</dt>
      {/*
        Eine Größe je Zweig: `text-sm` und `type-body-sm` standen bei
        Monospace-Werten gleichzeitig auf dem Element und trugen beide eine
        Schriftgröße — welche gewann, entschied die Reihenfolge im
        Stylesheet, nicht diese Datei.
      */}
      <dd
        className={cn(
          "mt-1 truncate text-foreground",
          mono ? "font-mono type-body-sm" : "text-sm"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export function DataGrid({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Leerzustand                                                         */
/* ------------------------------------------------------------------ */

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-xl border border-skope-line bg-surface-sunken text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Demo-Kennzeichnung                                                  */
/* ------------------------------------------------------------------ */

/**
 * Markiert alles, was simuliert ist. Wird konsequent überall gesetzt, wo keine
 * echte Integration dahintersteht — die Oberfläche soll nie mehr behaupten,
 * als sie kann.
 */
export function DemoTag({
  children = "Demo",
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        // Bewusst neutral: Ein Meta-Hinweis trägt keine Handlung und soll
        // dem Primärbutton und der Aktivnavigation den Markenakzent nicht
        // streitig machen.
        "inline-flex items-center rounded border border-skope-line-strong bg-surface-raised px-1.5 py-0.5 type-micro font-medium tracking-[0.14em] text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Kennzahl                                                            */
/* ------------------------------------------------------------------ */

interface MetricProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  accent?: boolean
  className?: string
}

export function Metric({
  label,
  value,
  hint,
  icon,
  accent,
  className,
}: MetricProps) {
  return (
    <Panel
      accent={accent}
      className={cn(
        "group p-4 transition-colors duration-fast hover:border-skope-line-strong sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="type-label">{label}</p>
        {icon && (
          <span
            className={cn(
              "shrink-0 transition-colors duration-fast",
              accent ? "text-skope-accent" : "text-muted-foreground/60 group-hover:text-muted-foreground"
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "type-metric mt-3",
          accent ? "text-skope-accent" : "text-foreground"
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      )}
    </Panel>
  )
}
