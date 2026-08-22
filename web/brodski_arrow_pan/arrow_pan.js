import { app } from "/scripts/app.js"

const PAN_STEP = 100

app.registerExtension({
  name: "bskiFrontend.ArrowKeyPan",
  setup() {
    window.addEventListener("keydown", (e) => {
      // Don't steal arrow keys from input fields
      const tag = e.target?.localName
      if (tag === "input" || tag === "textarea") return

      const { ds, graph } = app.canvas
      if (!ds || !graph) return

      const step = PAN_STEP / ds.scale

      switch (e.key) {
        case "ArrowUp":    ds.offset[1] += step; break
        case "ArrowDown":  ds.offset[1] -= step; break
        case "ArrowLeft":  ds.offset[0] += step; break
        case "ArrowRight": ds.offset[0] -= step; break
        default: return
      }

      graph.change()
      e.preventDefault()
    }, true)
  }
})
