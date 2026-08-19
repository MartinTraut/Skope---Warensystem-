"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  ClipboardList,
  Download,
  RotateCcw,
  ShieldCheck,
  Table2,
  Upload,
  User,
} from "lucide-react"

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
  useAllSales,
  useArticles,
  useArticleViews,
  useCategories,
  useCurrentUser,
  useLocations,
  useMovements,
  useSales,
  useTeardowns,
  useUnits,
} from "@/hooks/use-cockpit"
import {
  csvFileName,
  downloadCsv,
  movementsCsv,
  salesCsv,
  stockCsv,
  stocktakeCsv,
  teardownsCsv,
  unitsCsv,
} from "@/lib/domain/export-csv"

/** Systemeinstellungen, Benutzerinfo und Demo-Verwaltung. */
export function SettingsView() {
  const user = useCurrentUser()
  const articles = useArticles()
  const units = useUnits()
  const sales = useSales()
  const activity = useActivity()
  const views = useArticleViews()
  const categories = useCategories()
  const locations = useLocations()
  const movements = useMovements()
  const teardowns = useTeardowns()
  const allSales = useAllSales()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
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
  async function downloadSnapshot(): Promise<string | null> {
    const data = await runAction(repositories.settings.exportSnapshot(), {
      failure: "Export fehlgeschlagen",
    })
    if (!data) return null

    const blob = new Blob([data.json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = data.fileName
    anchor.click()
    // Die Objekt-URL wieder freigeben, sonst hält sie den Blob im Speicher.
    URL.revokeObjectURL(url)
    return data.fileName
  }

  /**
   * Eine Tabelle als CSV herunterladen.
   *
   * Bewusst ohne Umweg über das Repository: Hier wird nichts geändert,
   * sondern nur der Stand ausgeschrieben, den die Ansicht ohnehin hält.
   */
  function exportTable(kind: (typeof EXPORTS)[number]["kind"]) {
    const content =
      kind === "bestand"
        ? stockCsv(views, categories, locations)
        : kind === "geraete"
          ? unitsCsv(units, articles, categories, locations)
          : kind === "journal"
            ? movementsCsv(movements, articles, units, locations)
            : kind === "verkaeufe"
              ? salesCsv(allSales)
              : kind === "ausschlachtungen"
                ? teardownsCsv(teardowns, articles, locations)
                : stocktakeCsv(views, categories, locations, null)

    const fileName = csvFileName(kind)
    downloadCsv(fileName, content)
    toast.success("Tabelle heruntergeladen", { description: fileName })
  }

  async function exportData() {
    setBusy(true)
    const fileName = await downloadSnapshot()
    setBusy(false)
    if (fileName) toast.success("Sicherung heruntergeladen", { description: fileName })
  }

  /**
   * Datei nur vormerken.
   *
   * Das Einspielen ersetzt den kompletten Bestand und ist der einzige Weg im
   * System, der alles auf einmal löscht. Ein Fehlgriff im Dateidialog darf
   * das nicht auslösen — bestätigt wird in `confirmImport`.
   */
  function chooseImportFile(file: File | undefined) {
    if (!file) return
    setPendingFile(file)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function confirmImport() {
    const file = pendingFile
    if (!file) return
    setBusy(true)
    try {
      // Rückfallpunkt vor dem Überschreiben: Wer den falschen Stand einspielt,
      // hat den eigenen dann wenigstens noch als Datei.
      const backup = await downloadSnapshot()
      if (!backup) {
        toast.error("Sicherung nicht eingespielt", {
          description:
            "Der Rückfallpunkt konnte nicht erzeugt werden. Es wurde nichts überschrieben.",
        })
        return
      }

      const text = await file.text()
      const summary = await runAction(
        repositories.settings.importSnapshot(text),
        { failure: "Sicherung nicht eingespielt" }
      )
      if (summary) {
        toast.success("Sicherung eingespielt", {
          description:
            `${summary.articles} Artikel, ${summary.units} Einzelstücke und ` +
            `${summary.sales} Verkäufe übernommen. Vorheriger Stand: ${backup}`,
        })
        setPendingFile(null)
      }
    } finally {
      setBusy(false)
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
              size="lg"
              onClick={exportData}
              disabled={busy}
            >
              <Download className="size-4" />
              Alle Daten exportieren
            </Button>
            <Button
              variant="outline"
              size="lg"
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
              onChange={(event) => chooseImportFile(event.target.files?.[0])}
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

      {/*
        Die Vollsicherung ist ein Rückfallpunkt für das System, kein Bericht
        für Menschen. Wer den Lagerwert zum Stichtag an die Buchhaltung gibt
        oder mit dem Klemmbrett zählen geht, kann mit einer JSON-Datei nichts
        anfangen — hier liegen die Tabellen dafür.
      */}
      <Panel>
        <PanelHeader
          title="Tabellen exportieren"
          description="Für Buchhaltung, Inventur und Auswertung. Öffnet sich in Excel und Numbers ohne Zwischenschritt."
        />
        <PanelBody>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {EXPORTS.map((entry) => (
              <Button
                key={entry.kind}
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3 text-left"
                onClick={() => exportTable(entry.kind)}
              >
                <entry.icon className="size-4 shrink-0 text-skope-accent" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">
                    {entry.label}
                  </span>
                  <span className="type-caption block truncate text-muted-foreground">
                    {entry.hint}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Semikolon als Trennzeichen, Komma als Dezimaltrenner — die
            Schreibweise, die deutsche Tabellenprogramme erwarten. Beträge
            stehen ohne Währungszeichen, damit sich damit rechnen lässt.
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
            size="lg"
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
        open={pendingFile !== null}
        onOpenChange={(open) => {
          if (!open) setPendingFile(null)
        }}
        title="Sicherung einspielen?"
        description="Der gesamte aktuelle Stand wird ersetzt und lässt sich danach nur über eine Datei zurückholen."
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setPendingFile(null)}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={confirmImport}
              disabled={busy}
            >
              {busy ? "Wird eingespielt …" : "Sicherung einspielen"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Datei:{" "}
            <span className="font-mono text-foreground">{pendingFile?.name}</span>
          </p>
          <p>
            Ersetzt werden{" "}
            <span className="text-foreground">{articles.length} Artikel</span>,{" "}
            <span className="text-foreground">{units.length} Einzelstücke</span> und{" "}
            <span className="text-foreground">{sales.length} Verkäufe</span>.
          </p>
          <p>
            Der aktuelle Stand wird vorher automatisch als Datei heruntergeladen,
            damit es einen Weg zurück gibt.
          </p>
        </div>
      </Modal>

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
              onClick={() => setResetOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
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

/* ------------------------------------------------------------------ */
/* Verfügbare Tabellen                                                 */
/* ------------------------------------------------------------------ */

const EXPORTS = [
  {
    kind: "bestand",
    label: "Bestandsliste",
    hint: "Menge, Einstand, Lagerwert je Artikel",
    icon: Table2,
  },
  {
    kind: "geraete",
    label: "Geräteliste",
    hint: "Jedes Einzelstück mit Seriennummer",
    icon: Table2,
  },
  {
    kind: "journal",
    label: "Bewegungsjournal",
    hint: "Jede Buchung mit Grund und Bearbeiter",
    icon: Table2,
  },
  {
    kind: "verkaeufe",
    label: "Verkäufe",
    hint: "Umsatz und Marge, Stornos gekennzeichnet",
    icon: Table2,
  },
  {
    kind: "ausschlachtungen",
    label: "Ausschlachtungen",
    hint: "Je Zeile ein Teil mit seinem Spender",
    icon: Table2,
  },
  {
    kind: "inventur",
    label: "Zählliste",
    hint: "Soll steht drin, Zählspalte bleibt leer",
    icon: ClipboardList,
  },
] as const
