import { forgetCalibration, hasSavedCalibration } from "../../app/calibration.ts";
import { remove } from "../../app/storage.ts";
import type { App, Screen } from "../app.ts";
import { VERSION } from "../config.ts";
import { h } from "../dom.ts";

export function settings(app: App): Screen {
  const calLine = h("p", { class: "fine" }, hasSavedCalibration() ? "A neutral-face calibration is saved on this phone." : "No calibration saved yet; the first hot seat calibrates.");
  const el = h("div", { class: "screen settings" },
    h("h2", null, "Settings"),
    h("section", null,
      h("h3", null, "Calibration"),
      calLine,
      h("button", { class: "secondary-btn", onclick: () => { forgetCalibration(app.rig.engine); calLine.textContent = "Calibration forgotten. The next hot seat calibrates again."; app.toast("Calibration forgotten."); } }, "Forget calibration"),
      h("p", { class: "fine" }, "Every hot seat can also tap “Calibrate again” before their baseline."),
    ),
    h("section", null,
      h("h3", null, "Camera"),
      h("label", { class: "field row" }, "Mirror the front camera", h("input", { type: "checkbox", checked: app.settings.mirror, onchange: (e: Event) => { app.settings.mirror = (e.target as HTMLInputElement).checked; app.rig.mirror = app.settings.mirror; app.rig.applyMirror(); app.saveSettings(); } })),
    ),
    h("section", null,
      h("h3", null, "Poker Face"),
      h("button", { class: "secondary-btn", onclick: () => { remove("tell.streak"); app.toast("Streak reset."); } }, "Reset Poker Face streak"),
    ),
    h("section", null,
      h("h3", null, "Developer"),
      h("p", { class: "fine" }, "The measurement recorder lives in the Mien instrument: open it, start the camera, then Settings → Developer → Record measurements. It writes numbers only (no images) for TELL's scorer fixtures."),
      h("a", { class: "secondary-btn", href: "./index.html" }, "Open the Mien instrument"),
    ),
    h("section", null,
      h("h3", null, "About"),
      h("p", { class: "fine" }, `TELL v${VERSION}. Built on the Mien expression engine (MediaPipe Face Landmarker, FACS-based model). Everything runs on this phone; nothing is uploaded. It can't catch lies. Nobody can. It catches tells.`),
      h("p", { class: "fine" }, "Not for hiring, interviews, school, work, or deciding whether someone is truthful. For fun between consenting players."),
    ),
    h("div", { class: "actions" }, h("button", { class: "primary-btn", onclick: () => app.go("home") }, "Done")),
  );
  return { el };
}
