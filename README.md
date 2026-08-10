# SKOPE Cockpit

Interne Steuerzentrale für den Warenprozess gebrauchter E-Scooter — vom
Wareneingang über Prüfung und Aufbereitung bis zu Veröffentlichung, Verkauf
und Umsatzdokumentation.

**Aktueller Stand: funktionsfähiger Prototyp.** Der komplette Geschäftsprozess
läuft mit realistischen, erfundenen Daten. Alle externen Systeme sind durch
Demo-Adapter ersetzt, die sich verhalten wie echte Integrationen (Latenz,
Idempotenz, Fehlerzustände, Wiederholung) — aber nichts nach außen senden.

## Starten

```bash
npm install
npm run dev        # http://localhost:3000
```

Weitere Skripte: `npm run build`, `npm run typecheck`, `npm run lint`.

## Architekturprinzip

Das Cockpit ist die führende Datenquelle. Shopify, Kleinanzeigen und Google
Sheets sind angebundene Kanäle, keine Datenbanken.

```
                    AVIDES
                      ↓
               SKOPE COCKPIT
                      ↓
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
     SHOPIFY    KLEINANZEIGEN   GOOGLE SHEETS
```

## Aufbau

| Verzeichnis           | Inhalt                                                          |
| --------------------- | --------------------------------------------------------------- |
| `lib/domain/`         | Fachliches Modell: Typen, Status, Regeln, Kennzahlen. Frei von UI und Storage. |
| `lib/data/`           | Repository-Interfaces (`repository.ts`) und deren Demo-Implementierung. Hier liegen die Geschäftsabläufe. |
| `lib/store/`          | Persistenz des Prototyps (Zustand + localStorage). Nimmt später die Rolle von Supabase ein. |
| `lib/integrations/`   | Verträge zu den externen Systemen plus Mock-Adapter.             |
| `lib/demo/`           | Beispielbestand.                                                  |
| `hooks/use-cockpit.ts`| Reaktiver Lesezugriff für Komponenten.                            |
| `components/`         | Oberfläche, nach Bereichen gegliedert.                            |
| `app/(app)/`          | Routen innerhalb der Cockpit-Shell.                               |

**Regel:** Komponenten lesen über die Hooks und schreiben über
`repositories.*`. Kein Zugriff auf Mock-Arrays oder den Store aus der
Oberfläche heraus. Dadurch bleibt der Wechsel auf Supabase lokal begrenzt.

## Statusmodell

Drei unabhängige Dimensionen statt eines vermischten Status:

- **`workflow_status`** — `EINGEGANGEN → IN_PRUEFUNG → AUFBEREITUNG → VERKAUFSBEREIT → ARCHIVIERT`
- **`sale_status`** — `VERFUEGBAR | RESERVIERT | VERKAUFT`
- **Listing-Status je Kanal** — `NICHT_VEROEFFENTLICHT | VEROEFFENTLICHT | SYNC_AUSSTEHEND | FEHLER | DEAKTIVIERT`

Reparaturen sind eigene Datensätze; „in Reparatur" ist daraus ableitbar und
kein eigener Status.

## Was echt ist, was simuliert

**Echt umgesetzt:** Bestandsführung, automatische Scooter-Nummer,
Prüfprotokoll, Reparaturen und Reinigung, Bilder inklusive Optimierung und
Reihenfolge, Freigaberegeln, Verkauf mit Bestandsabbau und Kanalabschaltung,
Audit Log, CSV-Import mit Mapping und Dublettenprüfung, Fehler- und
Wiederholungslogik.

**Simuliert:** Shopify (Veröffentlichung, Aktualisierung, Bestand, eingehende
Bestellung), Google Sheets (Verkaufszeilen), Avides (Beispiel-Lieferliste).
Kleinanzeigen ist bewusst *nicht* automatisiert — dafür ist keine
Schnittstelle bestätigt; das Cockpit führt nur den internen Inseratsstatus.

## Später benötigte Zugänge

- Supabase-Projekt (URL, anon key, service role key)
- Shopify Custom App mit Admin-API-Token, Webhook-Secret und ein separater
  Development Store zum Testen
- Google Service Account (JSON) plus Freigabe der Zieltabelle
- Eine echte Avides-Exportdatei zur Festlegung des Standard-Mappings

Zugangsdaten gehören ausschließlich in Umgebungsvariablen und niemals ins
Repository.

## Offene fachliche Frage

Bei gebrauchter Ware greift häufig die Differenzbesteuerung nach § 25a UStG.
Die im Cockpit angezeigte Marge ist ausdrücklich eine **operative
Rechengröße** (Verkaufspreis − Einkauf − Reparaturen − weitere Kosten) und
kein steuerlicher Gewinn. Bevor die Zahlen in die Buchhaltung fließen, muss
geklärt werden, ob und je Gerät differenzbesteuert wird.
