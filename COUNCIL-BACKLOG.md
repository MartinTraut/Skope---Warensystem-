# Council-Backlog

Befunde des Experten-Councils vom 18.08.2026 (fünf Gutachter: Daten/Domäne,
Korrektheit, Bedienung/Barrierefreiheit, Design-System, Warenwirtschaft).
Reihenfolge = Abarbeitungsreihenfolge: erst was falsche Zahlen erzeugt, dann was
Bedienung blockiert, dann System- und Produktlücken.

Erledigt heißt: behoben **und** im Commit begründet.

Stand 19.08.2026: 51 von 58 Befunden behoben. Offen sind ausschließlich
Produktlücken der Warenwirtschaft — sie sind keine Fehler, sondern fehlende
Funktionen. Der erste davon (Ankauf) hat eine offene Designfrage und wartet
auf eine Entscheidung.

## Erledigt

- [x] Sicherung einspielen ohne Rückfrage — Bestätigung, Rückfallpunkt, Feldprüfung (`51b4d07`)
- [x] Zwei Tabs überschreiben sich gegenseitig — `storage`-Abgleich (`51b4d07`)
- [x] `importSnapshot` prüfte nur `articles` — alle Listenfelder (`51b4d07`)
- [x] Mengenverkauf buchte Stückpreis als Gesamterlös (`bf17f7c`)
- [x] `checkAvailability` ließ NaN durch (`bf17f7c`)
- [x] Bestandszähler still bei 0 geklemmt — jetzt `StockLevel.inconsistent` (`bf17f7c`)
- [x] `updateSaleStatus` ohne Zustandsprüfung (`329b088`)
- [x] `markAsSold` ignorierte den Workflow-Status (`329b088`)
- [x] Verkauf war unwiderruflich — `sales.cancel` mit Gegenbuchung (`329b088`)

## Korrektheit und Daten

- [x] **kritisch** `supabase/migrations/20260812120000_init_skope.sql:119` — Schema bildet
      noch das alte Scooter-Modell ab (`scooters` mit Prüfung/Aufbereitung inline);
      Artikel, Einzelstücke, Bewegungen, Verkäufe fehlen. Kein Weg vom Prototyp in die
      Datenbank, solange das so steht.
- [x] **hoch** `components/stock/stocktake-view.tsx:96` — Inventur mit Lagerplatz-Filter:
      `expected()` zeigt die Menge **am Platz**, gebucht wird gegen den Gesamtbestand.
- [x] **hoch** `lib/data/demo-repository.ts:1154` — `removeRepair` löscht die Reparatur,
      storniert die VERBRAUCH-Buchung des Ersatzteils aber nicht. (4b96905)
- [x] **hoch** `lib/data/demo-repository.ts:1402`, `:1291` — `sell`/`issue` prüfen den
      Gesamtbestand, buchen den Abgang aber auf einen Lagerplatz → Negativbestand am Platz. (4b96905)
- [x] **hoch** `lib/data/demo-repository.ts:2276` — `importQuantities` sucht per MPN über
      alle Artikel, ohne Kategorie- oder `stockMode`-Filter.
- [x] **hoch** `lib/domain/status.ts:124` — kein Übergang *nach* AUSGESCHLACHTET; alle
      wertrelevanten Pfade schreiben den Status direkt am Automaten vorbei.
- [x] **mittel** `lib/data/demo-repository.ts:2233` — Einzelstücke entstehen ohne
      ZUGANG-Bewegung, während Verkauf und Ausschlachtung buchen → Journal summiert negativ.
- [x] **mittel** `lib/data/demo-repository.ts:2367` — fehlender Einkaufspreis beim
      Mengenimport wird als 0 gebucht und verwässert den Durchschnittseinstand.
- [x] **mittel** `lib/data/demo-repository.ts:1287` — `issue` prüft den Artikelstatus nicht. (4b96905)
- [x] **mittel** `components/teardown/teardown-view.tsx:277` — kontrolliertes Wertfeld
      lässt sich nicht leeren.
- [x] **mittel** `lib/data/demo-repository.ts:1824` — `refreshProposals` iteriert je Artikel
      über alle Einzelstücke (quadratisch).
- [x] **mittel** `lib/data/demo-repository.ts:919` — Verkauf, Teardown und Reparatur sind
      mehrere getrennte `set`-Aufrufe; bricht einer, bleibt ein halber Vorgang stehen.
- [x] **niedrig** `lib/data/demo-repository.ts:1677` — `runPublish` wirft im Fehlerpfad
      selbst (`findUnit(...)!`).
- [x] **niedrig** `lib/data/demo-repository.ts:1434` — `sell` bucht die Bewegung mit
      `new Date()` statt mit `soldAt`; rückdatierte Verkäufe fallen auseinander.
- [x] **niedrig** `lib/domain/numbering.ts:54` — SKU/Stücknummer als MAX+1 ohne erzwungene
      Eindeutigkeit.

## Bedienung und Barrierefreiheit

- [x] **hoch** `components/units/detail/unit-detail-view.tsx:74,90` — „Zurück zum Bestand"
      zeigt auf `/units`, eine Route, die es nicht gibt. (13d8710)
- [x] **hoch** `components/stock/stocktake-view.tsx:85` — `bookAll` bucht alle
      Inventurdifferenzen unwiderruflich, ohne Zusammenfassung und ohne Rückfrage.
- [x] **hoch** `components/proposals/proposals-view.tsx:82` — `approveSelected` stellt
      Inserate nach außen ein (eBay, Kleinanzeigen, Shopify), ohne Rückfrage.
- [x] **hoch** `components/inventory/new-article-dialog.tsx:110` — nach Validierungsfehler
      kein Scroll und kein Fokus zum ersten fehlerhaften Feld.
- [x] **hoch** `components/skope/form.tsx:58` — Fehlertext ohne `aria-describedby`,
      ohne `role="alert"`; `aria-invalid` nur am Textfeld.
- [x] **hoch** `components/layout/app-shell.tsx:445` — Seitentitel und -beschreibung unter
      1024 px ausgeblendet: am Telefon kein Hinweis, wo man ist.
- [x] **hoch** `components/inventory/stock-dialogs.tsx:348` — feldfremde Fehler landen im
      Fehlerslot des Mengenfelds.
- [x] **mittel** `components/inventory/stock-dialogs.tsx:128` — kein `dirty` an `Modal`:
      Fehltipp neben dem Blatt verwirft die ausgefüllte Buchung.
- [x] **mittel** `components/layout/app-shell.tsx:57` — mobiler Drawer ohne Fokus-Trap.
- [x] **mittel** `components/categories/categories-view.tsx:292`,
      `components/locations/locations-view.tsx:168`, `proposals-view.tsx:294` — Touch-Ziele
      36 px bzw. 16 px gegen die eigene Untergrenze von 44 px (`focus.ts:21`).
- [x] **niedrig** `app/not-found.tsx:27` — 404 verlinkt `/scooters`; der Ausweg führt zurück
      ins 404.

## Design-System (13d8710)
- [x] **kritisch** `components/ui/button.tsx:22-34` — Größenskala tot: 92 Aufrufstellen
      überschreiben sie.
- [x] **hoch** `app/globals.css:139-141` — `--motion-*`-Tokens nirgends referenziert,
      stattdessen fünf ad-hoc-Dauern.
- [x] **hoch** `components/inventory/inventory-table.tsx:91-92,240` — grün getönter
      Tabellenkopf als Einzelfall.
- [x] **hoch** `app/globals.css:325-341` — fünf Textgrößen im 11–15-px-Band trotz
      dokumentierter Reduktion auf zwei.
- [x] **hoch** `components/skope/status-pill.tsx:68` — Größen `sm` und `md` typografisch
      identisch.
- [x] **mittel** `components/categories/attribute-editor.tsx:159,170` — veraltetes Grün
      als Fallback.
- [x] **mittel** `components/skope/form.tsx:18-20` — `bg-[#0b0c0e]` als undokumentierte
      siebte Flächenstufe.
- [x] **mittel** `components/ui/card.tsx:15` u. a. — 20 von 23 Dateien in `components/ui/`
      werden nicht importiert.
- [x] **mittel** `app/globals.css:278,314,351` — Textfarben als Hex-Literale statt Tokens.
- [x] **mittel** `components/dashboard/charts.tsx:546-547` — farbiger Glow an der aktuellen
      Monatssäule, den das System sonst nicht führt.
- [x] **niedrig** `components/skope/focus.ts:12` — `FOCUS_RING` 16× wörtlich kopiert.
- [x] **niedrig** `components/skope/primitives.tsx:186-187` — zwei Größenangaben kollidieren
      im `mono`-Zweig.

## Warenwirtschaft (Produktlücken)

- [ ] **kritisch** Ankauf fehlt komplett (`lib/domain/types.ts`) — kein Lieferant, kein
      Ankaufsbeleg, keine Einkaufsrechnung. Der erste Lebenszyklusschritt ist nicht im
      Modell. **Offene Designfrage: Darstellung des Belegs.**
- [x] **hoch** `lib/data/repository.ts:228` — für Einzelstücke gibt es keinen Abgang außer
      Verkauf (kein Verlust, kein Verbrauch).
- [ ] **hoch** `lib/domain/inspection.ts:15` — Prüfkatalog hart kodiert und
      scooter-spezifisch, gilt aber für jedes serialisierte Einzelstück.
- [x] **hoch** `app/(app)/units/` — keine Geräteliste, keine Seriennummernsuche.
- [ ] **hoch** `lib/domain/publishing.ts:31` — jeder Artikel kann nur auf genau einem Kanal
      landen.
- [x] **hoch** kein Etikett, kein Barcode/QR, kein Scanfeld.
- [x] **hoch** `components/settings/settings-view.tsx:57` — außer der JSON-Vollsicherung
      kein Export (Bestand, Journal, Verkäufe, Inventur).
- [ ] **mittel** `lib/domain/types.ts:794` — Rolle ist reiner Anzeigetext, keine
      Repository-Methode prüft sie.
- [ ] **mittel** `lib/domain/metrics.ts:24` — Werkstattzeit wird erfasst, fließt aber nicht
      in Kosten und Marge; ein Stundensatz existiert nicht.
- [ ] **mittel** `components/inventory/inventory-view.tsx:350` — keine Zeilenauswahl,
      keine Sammelaktionen außerhalb der Freigabeliste.
- [ ] **mittel** `lib/data/repository.ts:287` — Teardown kennt nur `book`: kein Entwurf,
      kein Storno.
