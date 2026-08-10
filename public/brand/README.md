# Markenmaterial

## Logo

Die Logodatei wird unter genau diesem Pfad erwartet:

    public/brand/skope-logo.svg

Sobald sie hier liegt, erscheint sie automatisch in der Sidebar und in der
mobilen Topbar — ohne Codeänderung. Bis dahin zeigt die Anwendung an derselben
Stelle einen erkennbaren Platzhalter.

Liegt das Logo als PNG statt SVG vor, den Pfad in
`components/brand/skope-logo.tsx` (Konstante `LOGO_SRC`) auf
`/brand/skope-logo.png` ändern.

Das Logo wird unverändert eingebunden: nicht neu gezeichnet, nicht eingefärbt,
nicht durch Text ersetzt.
