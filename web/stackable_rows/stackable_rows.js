import { app } from "/scripts/app.js"

// V3 node_id, becomes the litegraph node type name.
const NODE_TYPE = "BskiStackableRows"
// Autogrow input id ("rows") + TemplatePrefix prefix ("row_") from stackable_rows.py.
const GROUP_NAME = "rows"
const ROW_PREFIX = "row_"
const MAX_ROWS = 100
const ROW_RE = new RegExp(`^${GROUP_NAME}\\.${ROW_PREFIX}(\\d+)$`)

function rowOrdinal(widgetName) {
  const m = ROW_RE.exec(widgetName)
  return m ? parseInt(m[1], 10) : -1
}

function rowWidgets(node) {
  return (node.widgets ?? []).filter((w) => ROW_RE.test(w.name))
}

/**
 * Adds one more row_N input+widget the same way Autogrow does when a link
 * lands on the last socket (see addNodeInput/addInputWidget in
 * litegraphService.ts) — used by our own "+ Add row" button so rows can be
 * added by typing alone, without wiring a node into the last socket first.
 */
function addRow(node) {
  const existing = rowWidgets(node)
  const nextOrdinal = existing.length
    ? Math.max(...existing.map((w) => rowOrdinal(w.name))) + 1
    : 0
  if (nextOrdinal >= MAX_ROWS) return null

  const name = `${GROUP_NAME}.${ROW_PREFIX}${nextOrdinal}`
  const { widget } = app.widgets["STRING"](node, name, ["STRING", { default: "", multiline: false }], app) ?? {}
  if (!widget) return null
  widget.label = `row ${nextOrdinal}`
  attachDragReorder(node, widget)

  // Widget constructors only create the widget; the socket is a separate step
  // (mirrors addInputWidget in litegraphService.ts). Linked to its widget by name.
  node.addInput(name, "STRING", { widget: { name } })

  // Insert the socket right after the previous row's, matching Autogrow's own ordering.
  const lastRowInputIdx = node.inputs.slice(0, -1).findLastIndex((inp) => ROW_RE.test(inp.name))
  if (lastRowInputIdx !== -1 && lastRowInputIdx !== node.inputs.length - 2) {
    const [spliced] = node.inputs.splice(node.inputs.length - 1, 1)
    node.inputs.splice(lastRowInputIdx + 1, 0, spliced)
  }

  syncRowOrder(node)
  node.size[1] = node.computeSize([...node.size])[1]
  node.setDirtyCanvas(true, true)
  return widget
}

/**
 * Adds drag-to-reorder to a StackableRows row widget.
 *
 * Each row_N widget is a real litegraph BaseWidget instance with its own
 * input socket drawn aligned to its widget row (matched by name, not array
 * index — see LGraphNode.getSlotFromWidget). So reordering is just:
 * splice node.widgets into the new order and redraw — sockets follow.
 *
 * Click (no movement) still opens the normal text-edit prompt; only a real
 * drag (movement past litegraph's own threshold) fires onDrag, so this
 * doesn't interfere with editing row text.
 */
function attachDragReorder(node, widget) {
  let dragging = false

  widget.onDrag = ({ e, canvas }) => {
    dragging = true

    const rows = rowWidgets(node)
    const pointerY = e.canvasY - node.pos[1]

    let targetIndex = rows.length - 1
    for (let i = 0; i < rows.length; i++) {
      const w = rows[i]
      const top = w.last_y ?? w.y ?? 0
      const height = w.computedHeight ?? window.LiteGraph.NODE_WIDGET_HEIGHT
      if (pointerY < top + height / 2) {
        targetIndex = i
        break
      }
    }

    const srcIndex = rows.indexOf(widget)
    if (srcIndex === -1 || srcIndex === targetIndex) return

    rows.splice(srcIndex, 1)
    rows.splice(targetIndex, 0, widget)
    reorderRowWidgets(node, rows)
    syncRowOrder(node)
    canvas.setDirty(true, true)
  }

  const prevOnClick = widget.onClick?.bind(widget)
  widget.onClick = (options) => {
    if (dragging) {
      dragging = false
      return
    }
    prevOnClick?.(options)
  }
}

/** Splices `node.widgets` so row widgets appear in `orderedRows` order; other widgets keep their relative order. */
function reorderRowWidgets(node, orderedRows) {
  const firstRowIdx = node.widgets.findIndex((w) => ROW_RE.test(w.name))
  const before = node.widgets.slice(0, firstRowIdx).filter((w) => !ROW_RE.test(w.name))
  const rest = node.widgets.filter((w) => !ROW_RE.test(w.name))
  const after = rest.slice(before.length)
  node.widgets = [...before, ...orderedRows, ...after]
}

/** Writes the current top-to-bottom row name order into the hidden row_order widget. */
function syncRowOrder(node) {
  const orderWidget = node.widgets?.find((w) => w.name === "row_order")
  if (!orderWidget) return
  const names = rowWidgets(node).map((w) => `${ROW_PREFIX}${rowOrdinal(w.name)}`)
  orderWidget.value = JSON.stringify(names)
}

/** Restores widget order from a saved row_order (e.g. after loading a workflow). */
function applySavedOrder(node) {
  const orderWidget = node.widgets?.find((w) => w.name === "row_order")
  if (!orderWidget?.value) return
  let savedOrder
  try {
    savedOrder = JSON.parse(orderWidget.value)
  } catch {
    return
  }
  if (!Array.isArray(savedOrder) || savedOrder.length < 2) return

  const byShortName = new Map(rowWidgets(node).map((w) => [`${ROW_PREFIX}${rowOrdinal(w.name)}`, w]))
  const ordered = savedOrder.map((short) => byShortName.get(short)).filter(Boolean)
  for (const w of byShortName.values()) {
    if (!ordered.includes(w)) ordered.push(w)
  }
  if (ordered.length) reorderRowWidgets(node, ordered)
}

app.registerExtension({
  name: "bskiFrontend.StackableRows",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return

    const onNodeCreated = nodeType.prototype.onNodeCreated
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments)
      const node = this

      const orderWidget = node.widgets?.find((w) => w.name === "row_order")
      if (orderWidget) {
        orderWidget.computeSize = () => [0, -4]
        orderWidget.hidden = true
      }

      for (const w of rowWidgets(node)) attachDragReorder(node, w)
      applySavedOrder(node)

      node.addWidget("button", "+ Add row", null, () => {
        const widget = addRow(node)
        if (widget) node.graph?.setDirtyCanvas(true, true)
      })

      node.setDirtyCanvas(true, true)
    }

    // A saved workflow's row widgets are (re)created via onConfigure; re-attach drag + restore order.
    const onConfigure = nodeType.prototype.onConfigure
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments)
      for (const w of rowWidgets(this)) {
        if (!w.onDrag) attachDragReorder(this, w)
      }
      applySavedOrder(this)
    }
  },
})
