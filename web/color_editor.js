import { app } from "../../scripts/app.js";

app.registerExtension({
  name: "bskiFrontend.nodeColorsEditor",
  async setup() {
    ///////////////////////
    //        CSS        //
    ///////////////////////
    const style = document.createElement("style");
    style.textContent = `
      [data-setting-id="BskiFrontend.jsonEditor"] > .flex,
      [data-setting-id="BskiFrontend.jsonEditor"] > .flex  > .form-input.flex {
        display: block;
      }
    `;
    document.head.appendChild(style);

    // Tracks only the keys we loaded from node_colors.json.
    // ComfyUI's built-in colors are never touched.
    const ownedKeys = new Set();

    function applyColors(entries) {
      // Remove only keys we previously set that are no longer in the JSON
      for (const key of ownedKeys) {
        if (!(key in entries)) delete LGraphCanvas.node_colors[key];
      }
      ownedKeys.clear();
      for (const [key, val] of Object.entries(entries)) {
        LGraphCanvas.node_colors[key] = val;
        ownedKeys.add(key);
      }
    }

    app.ui.settings.addSetting({
      id: "BskiFrontend.jsonEditor",
      name: "Edit node_colors.json",
      type: (_name, _setter, _value) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "width:100%;padding:4px 0";

        const textarea = document.createElement("textarea");
        textarea.placeholder = "Loading…";
        Object.assign(textarea.style, {
          width: "100%",
          height: "360px",
          fontFamily: "monospace",
          fontSize: "14px",
          boxSizing: "border-box",
          resize: "vertical",
        });

        const controls = document.createElement("div");
        Object.assign(controls.style, {
          display: "flex",
          gap: "10px",
          marginTop: "6px",
          alignItems: "center",
        });

        const btn = document.createElement("button");
        btn.textContent = "💾 Save";

        const status = document.createElement("span");
        status.style.fontSize = "12px";

        controls.append(btn, status);
        wrapper.append(textarea, controls);

        // Load current JSON from server
        fetch("/bski/node_colors")
          .then(r => r.text())
          .then(t => {
            textarea.value = t;
            // Seed ownedKeys so applyColors knows what we're responsible for
            try { for (const k of Object.keys(JSON.parse(t))) ownedKeys.add(k); } catch {}
          })
          .catch(() => {
            textarea.value = "{}";
            status.textContent = "⚠ Could not load file";
          });

        // Save on button click
        btn.addEventListener("click", async () => {
          status.textContent = "Saving…";

          try {
            JSON.parse(textarea.value);
          } catch {
            status.textContent = "✗ Invalid JSON - not saved";
            return;
          }

          try {
            const r = await fetch("/bski/node_colors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: textarea.value,
            });
            const result = await r.json();
            if (result.ok) {
              applyColors(JSON.parse(textarea.value));
              status.textContent = "✓ Saved & applied!";
            } else {
              status.textContent = `✗ ${result.error}`;
            }
          } catch (e) {
            status.textContent = `✗ Network error: ${e.message}`;
          }
        });

        return wrapper;
      },
      defaultVal: "",
    });
  },
});
