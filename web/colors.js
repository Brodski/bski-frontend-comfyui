import { app } from "../../scripts/app.js";

app.registerExtension({
  name: "bskiFrontend.nodeColors",
  async setup() {
    let entries;
    try {
      const url = new URL("./node_colors.json", import.meta.url);
      url.searchParams.set("t", Date.now());
      const res = await fetch(url);
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