"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Download, RotateCcw, ShieldCheck, Upload, User } from "lucide-react"

import { Modal } from "@/components/skope/modal"
import {
  DataField,
  DataGrid,
  DemoTag,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import {
  useActivity,
  useArticles,
  useCurrentUser,
  useSales,
  useUnits,
} from "@/hooks/use-cockpit"

/** Systemeinstellungen, Benutzerinfo und Demo-Verwaltung. */
export function SettingsView() {
  const user = useCurrentUser()
  const articles = useArticles()
  const units = useUnits()
  const sales = useSales()
  const activity = useActivity()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function reset() {
    setResetting(true)
    await runAction(repositories.demo.resetDemoData(), {
      success: "Demo-Daten zurückgesetzt",
      failure: "Zurücksetzen fehlgeschlagen",
    })
    setResetting(false)
    setResetOpen(false)
  }

  /**
   * Sicherung herunterladen.
   *
   * Im Prototyp hängt der gesamte Bestand an einem Browserprofil. Ohne diesen
   * Weg wäre ein geleerter Cache gleichbedeutend mit Totalverlust — und für
   * die spätere Übernahme nach Supabase gäbe es keinen Ausgang.
   */
  async function exportData() {
    setBusy(true)
    const data = await runAction(repositories.settings.exportSnapshot(), {
      failure: "Export fehlgeschlagen",
    })
    setBusy(false)
    if (!data) return

    const blob = new Blob([data.json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = data.fileName
    anchor.click()
    // Die Objekt-URL wieder freigeben, sonst hält sie den Blob im Speicher.
    URL.revokeObjectURL(url)
    toast.success("Sicherung heruntergeladen", { description: data.fileName })
  }

  async function importData(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const summary = await runAction(
        repositories.settings.importSnapshot(text),
        { failure: "Sicherung nicht eingespielt" }
      )
      if (summary) {
        toast.success("Sicherung eingespielt", {
          description:
            `${summary.articles} Artikel, ${summary.units} Einzelstücke und ` +
            `${summary.sales} Verkäufe übernommen.`,
        })
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Einstellungen"
        description="Benutzer, Demo-Daten und Hinweise zum aktuellen Ausbaustand."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                <User className="size-4 text-muted-foreground" />
                Benutzer
              </span>
            }
            action={<DemoTag>Demo-Konto</DemoTag>}
          />
          <PanelBody>
            <DataGrid className="grid-cols-2 lg:grid-cols-2">
              <DataField label="Name" value={user.name} />
              <DataField
                label="Rolle"
                value={user.role === "admin" ? "Administrator" : "Mitarbeiter"}
              />
            </DataGrid>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Im Prototyp gibt es kein Login. Für die Produktion ist
              Supabase Auth mit zwei Rollen vorgesehen: Administrator
              (Einstellungen, Integrationen, Verkaufskorrekturen) und
              Mitarbeiter (Scooter, Prüfung, Aufbereitung, Verkauf).
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                Datenhaltung
              </span>
            }
          />
          <PanelBody>
            <DataGrid className="grid-cols-2 lg:grid-cols-4">
              <DataField label="Artikel" value={String(articles.length)} />
              <DataField label="Einzelstücke" value={String(units.length)} />
              <DataField label="Verkäufe" value={String(sales.length)} />
              <DataField label="Ereignisse" value={String(activity.length)} />
            </DataGrid>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Alle Daten liegen ausschließlich in diesem Browser
              (localStorage) und verlassen das Gerät nicht. In der Produktion
              übernimmt Supabase PostgreSQL diese Rolle — die Datenschicht ist
              dafür bereits hinter Repository-Interfaces gekapselt.
            </p>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Datensicherung"
          description="Der gesamte Bestand liegt in diesem Browser. Ein Export ist die einzige Kopie."
        />
        <PanelBody>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11 gap-2 px-4"
              onClick={exportData}
              disabled={busy}
            >
              <Download className="size-4" />
              Alle Daten exportieren
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-2 px-4"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload className="size-4" />
              Sicherung einspielen
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => importData(event.target.files?.[0])}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Der Export enthält Bestand, Verkäufe, Aktivitäten und Importläufe als
            JSON-Datei. Beim Einspielen wird der aktuelle Stand vollständig
            ersetzt — vorher exportieren. Dieselbe Datei ist später die Grundlage
            für die einmalige Übernahme nach Supabase.
          </p>
        </PanelBody>
      </Panel>

      <Panel className="border-state-error/20">
        <PanelHeader
          title="Demo-Daten"
          description="Setzt Bestand, Verkäufe, Aktivitäten und Integrationsschalter auf den Auslieferungszustand zurück."
        />
        <PanelBody>
          <Button
            variant="outline"
            className="h-11 gap-2 px-4"
            onClick={() => setResetOpen(true)}
            disabled={busy}
          >
            <RotateCcw className="size-4" />
            Demo-Daten zurücksetzen
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Alle im Demo angelegten Scooter, Prüfungen, Reparaturen, Bilder und
            Verkäufe gehen dabei verloren. Vorher exportieren, wenn der Stand
            erhalten bleiben soll.
          </p>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Ausbaustand" />
        <PanelBody>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="type-label">Funktioniert bereits vollständig</p>
              <ul className="mt-3 space-y-1.5 text-sm text-foreground/85">
                {[
                  "Bestandsführung mit Nummernvergabe",
                  "Prüfprotokoll und Reparaturen",
                  "Bilder inkl. Optimierung und Reihenfolge",
                  "Statuslogik und Freigaberegeln",
                  "Verkauf, Bestandsabbau, Kanalabschaltung",
                  "Audit Log über alle Vorgänge",
                  "CSV-Import mit Mapping und Dublettenprüfung",
                ].map((entry) => (
                  <li key={entry} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-state-ready" />
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="type-label">Simuliert</p>
              <ul className="mt-3 space-y-1.5 text-sm text-foreground/85">
                {[
                  "Shopify: Veröffentlichung, Update, Bestand",
                  "Shopify: eingehende Bestellung (Webhook)",
                  "Google Sheets: Verkaufszeilen",
                  "Avides: Beispiel-Lieferliste",
                  "Kleinanzeigen: nur interner Status, keine Automatik",
                ].map((entry) => (
                  <li key={entry} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-skope-accent" />
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PanelBody>
      </Panel>

      <Modal
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Demo-Daten zurücksetzen?"
        description="Diese Aktion lässt sich nicht rückgängig machen."
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              className="h-10 px-4"
              onClick={() => setResetOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              className="h-10 px-4"
              onClick={reset}
              disabled={resetting}
            >
              {resetting ? "Wird zurückgesetzt …" : "Zurücksetzen"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-foreground/85">
          Der gesamte Demo-Bestand wird neu aufgebaut. Alle Änderungen, die du
          in dieser Sitzung vorgenommen hast — angelegte Scooter, Prüfungen,
          Reparaturen, Bilder und Verkäufe — werden dabei verworfen.
        </p>
      </Modal>
    </div>
  )
}
