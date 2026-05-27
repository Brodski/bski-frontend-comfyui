import { app } from "/scripts/app.js";

app.registerExtension({
  name: "bskiFrontend.nodeColors",
  async setup() {
    let entries;
    try {
      const res = await fetch(`/bski/node_colors?t=${Date.now()}`);
      if (!res.ok) return;
      entries = await res.json();
    } catch {
      return;
    }

    for (const [name, colorOption] of Object.entries(entries)) {
      LGraphCanvas.node_colors[name] = colorOption;
    }
  },
});