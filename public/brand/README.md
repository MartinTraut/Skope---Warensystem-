# Markenmaterial

## Dateien

    public/brand/skope-logo.png     318 × 160  — vollständige Lockup
    public/brand/skope-signet.png   210 × 128  — nur der Scooter

Beide sind freigestellt (transparenter Hintergrund) und werden von
`components/brand/skope-logo.tsx` geladen. Die Lockup erscheint in der
Kopfzeile der Navigation und in der mobilen Topbar, das Signet in der
eingeklappten Navigation. Fehlt eine Datei, tritt an derselben Stelle und in
derselben Größe ein Platzhalter ein — die Oberfläche bleibt intakt.

Die Abmessungen liegen rund dreifach über der Anzeigegröße (46 px und 34 px),
damit die Darstellung auf hochauflösenden Bildschirmen scharf bleibt.

## Herkunft

Original: `assets/brand/skope-logo-original.png` (1254 × 1254, schwarzer
Hintergrund). Daraus abgeleitet:

1. Schwarz zu Transparenz, weicher Übergang zwischen 2 % und 14 % Helligkeit.
   Ein harter Schwellwert hätte die Kanten des gebürsteten Metalls ausfransen
   lassen; kräftig gesättigte Pixel bleiben in jedem Fall deckend, damit das
   Grün nicht angegriffen wird.
2. Auf den Inhalt zugeschnitten.
3. Signet aus dem oberen Bereich gelöst, ohne den Ansatz der Wortmarke.

## Farbe

Der Akzentton des gesamten Cockpits stammt aus dieser Datei und ist nicht
gewählt: `#8ee506`, der Median aller Grünpixel des Originals. Er liegt in
`app/globals.css` als `--skope-accent`. Wird das Logo ersetzt, ist dieser
Wert neu zu bestimmen — sonst laufen Marke und Oberfläche auseinander.

Das Logo selbst wird unverändert eingebunden: nicht neu gezeichnet, nicht
eingefärbt, nicht durch Text ersetzt.
