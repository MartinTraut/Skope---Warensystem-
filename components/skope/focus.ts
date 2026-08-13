/**
 * Einheitlicher Tastaturfokus.
 *
 * `Button` und die Formularbausteine bringen ihren Ring selbst mit, die von
 * Hand gebauten `<button>`- und `<a>`-Elemente daneben nicht — dort war
 * ausschließlich ein Hover-Zustand gestylt. Per Tastatur war deshalb nicht
 * erkennbar, wo man steht, und auf Touch existiert Hover ohnehin nicht.
 *
 * Diese Konstante ist die eine Stelle, an der das Aussehen des Fokus
 * festgelegt wird.
 */
export const FOCUS_RING =
  "focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"

/**
 * Mindestgröße für alles, was angetippt wird.
 *
 * Das Cockpit wird am Werkstatt-Tablet bedient, teils mit Handschuhen.
 * 44 Pixel sind die Untergrenze, unterhalb derer Fehlgriffe zur Regel werden.
 */
export const TOUCH_TARGET = "min-h-11 min-w-11"

/**
 * Trefferfläche vergrößern, ohne das Layout zu verändern.
 *
 * Für Symbolschaltflächen, die optisch klein bleiben müssen (Bildergalerie,
 * Tabellenzeilen): Ein unsichtbares Pseudo-Element dehnt den anklickbaren
 * Bereich über die sichtbaren Kanten hinaus.
 */
export const TOUCH_EXTEND =
  "relative after:absolute after:-inset-1.5 after:content-['']"
