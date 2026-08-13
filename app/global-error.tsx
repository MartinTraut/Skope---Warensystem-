"use client"

/**
 * Letzte Auffanglinie: greift, wenn schon der Wurzel-Layout-Baum scheitert.
 *
 * Diese Datei ersetzt das komplette Dokument und kann deshalb weder auf die
 * Anwendungs-Shell noch auf die Designtokens zurückgreifen — die Farben
 * stehen hier bewusst direkt im Markup.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          background: "#08090a",
          color: "#f4f5f6",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "34rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.6875rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#c8a45a",
            }}
          >
            SKOPE Cockpit
          </p>
          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "clamp(1.375rem, 2vw + 1rem, 1.875rem)",
              fontWeight: 500,
            }}
          >
            Die Anwendung konnte nicht gestartet werden
          </h1>
          <p
            style={{
              margin: "0.75rem 0 0",
              lineHeight: 1.65,
              color: "#9ba3ad",
              fontSize: "0.9375rem",
            }}
          >
            Die gespeicherten Daten liegen weiterhin in diesem Browser. Ein
            Neuladen behebt das Problem in den meisten Fällen.
          </p>
          <pre
            style={{
              margin: "1.25rem 0 0",
              padding: "0.75rem",
              overflowX: "auto",
              borderRadius: "0.5rem",
              border: "1px solid #2a2d33",
              background: "#0d0e10",
              color: "#9ba3ad",
              fontSize: "0.75rem",
            }}
          >
            {error.message}
            {error.digest && `\n\nKennung: ${error.digest}`}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              minHeight: "2.75rem",
              padding: "0 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#c8a45a",
              color: "#08090a",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Neu laden
          </button>
        </main>
      </body>
    </html>
  )
}
