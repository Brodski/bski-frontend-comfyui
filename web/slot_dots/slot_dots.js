import { app } from "/scripts/app.js";

/**
 * Slot Dots — resize the little input/output connection dots on nodes.
 *
 * Classic (canvas) mode:
 *   LiteGraph paints slots onto the <canvas> in NodeSlot.draw() with a
 *   hardcoded radius (4px, 5px when hovered), so CSS can't reach them.
 *   We wrap the input/output slot draw methods and, only while one of them is
 *   running, scale the canvas path calls (arc/rect/moveTo/lineTo/clip) about
 *   the slot's centre. Labels get nudged outward so the bigger dot doesn't
 *   overlap them. Link endpoints and the click area are untouched (the click
 *   area is already a 20px box, i.e. a 2.5x dot fits inside it).
 *
 * Nodes 2.0 (Vue nodes) mode:
 *   Slots are real DOM elements there, so a CSS transform does the job.
 */

const BASE_RADIUS = 4; // LiteGraph's default dot radius
const scales = { input: 1, output: 1 };

// Shared state for the canvas hooks; `on` is only true inside a slot draw.
const active = { on: false, cx: 0, cy: 0, s: 1, shift: 0 };

///////////////////////
//   Canvas hooks    //
///////////////////////

const hookedContexts = new WeakSet();

/** Wrap path methods on this ctx so they scale about the active slot centre. */
function hookContext(ctx) {
  if (hookedContexts.has(ctx)) return;
  hookedContexts.add(ctx);

  const { arc, rect, moveTo, lineTo, clip, fillText } = ctx;
  const sx = (x) => active.cx + (x - active.cx) * active.s;
  const sy = (y) => active.cy + (y - active.cy) * active.s;

  ctx.arc = function (x, y, r, start, end, ccw) {
    if (!active.on) return arc.apply(this, arguments);
    return arc.call(this, sx(x), sy(y), r * active.s, start, end, ccw);
  };
  ctx.rect = function (x, y, w, h) {
    if (!active.on) return rect.apply(this, arguments);
    return rect.call(this, sx(x), sy(y), w * active.s, h * active.s);
  };
  ctx.moveTo = function (x, y) {
    if (!active.on) return moveTo.apply(this, arguments);
    return moveTo.call(this, sx(x), sy(y));
  };
  ctx.lineTo = function (x, y) {
    if (!active.on) return lineTo.apply(this, arguments);
    return lineTo.call(this, sx(x), sy(y));
  };
  // Optional inputs are drawn as a hollow circle by clipping with a Path2D
  ctx.clip = function (path, rule) {
    if (!active.on || !(path instanceof Path2D)) return clip.apply(this, arguments);
    const { cx, cy, s } = active;
    const scaled = new Path2D();
    scaled.addPath(path, new DOMMatrix().translate(cx, cy).scale(s).translate(-cx, -cy));
    return rule === undefined ? clip.call(this, scaled) : clip.call(this, scaled, rule);
  };
  // Push the slot label away from the dot by however much the dot grew
  ctx.fillText = function (text, x, y, maxWidth) {
    if (!active.on) return fillText.apply(this, arguments);
    const dx = x - active.cx;
    if (dx !== 0) x += Math.sign(dx) * active.shift;
    else y += Math.sign(y - active.cy) * active.shift;
    return maxWidth === undefined
      ? fillText.call(this, text, x, y)
      : fillText.call(this, text, x, y, maxWidth);
  };
}

/** Run `fn` with the canvas hooks scaling about [cx, cy]. */
function withScale(ctx, kind, centre, fn) {
  const s = scales[kind];
  if (s === 1 || !centre) return fn();

  hookContext(ctx);
  active.on = true;
  active.cx = centre[0];
  active.cy = centre[1];
  active.s = s;
  active.shift = BASE_RADIUS * (s - 1);
  try {
    return fn();
  } finally {
    active.on = false;
  }
}

///////////////////////
//  Slot prototypes  //
///////////////////////

// NodeInputSlot / NodeOutputSlot aren't exposed as globals, so we grab their
// prototypes off the first live slot instances we see being drawn.
const patched = { input: false, output: false };

function patchSlotPrototype(proto, kind) {
  if (patched[kind]) return;
  patched[kind] = true;

  const origDraw = proto.draw;
  proto.draw = function (ctx, options) {
    // _centreOffset is LiteGraph's internal slot centre (node-local coords).
    // If a future frontend renames it, we just fall back to the stock size.
    return withScale(ctx, kind, this._centreOffset, () => origDraw.call(this, ctx, options));
  };

  const origDrawCollapsed = proto.drawCollapsed;
  if (origDrawCollapsed) {
    proto.drawCollapsed = function (ctx) {
      return withScale(ctx, kind, this.collapsedPos, () => origDrawCollapsed.call(this, ctx));
    };
  }
}

function patchFromNode(node) {
  for (const [kind, slots] of [["input", node.inputs], ["output", node.outputs]]) {
    if (patched[kind] || !slots?.length) continue;
    const proto = Object.getPrototypeOf(slots[0]);
    // Skip plain-object slots that LiteGraph hasn't upgraded to a class yet
    if (proto && Object.hasOwn(proto, "draw")) patchSlotPrototype(proto, kind);
  }
}

function installSlotPatches() {
  const origDrawSlots = LGraphNode.prototype.drawSlots;
  const drawSlotsHook = function (...args) {
    if (!patched.input || !patched.output) {
      patchFromNode(this);
      // Both found: remove ourselves (unless another extension wrapped us)
      if (patched.input && patched.output && LGraphNode.prototype.drawSlots === drawSlotsHook) {
        LGraphNode.prototype.drawSlots = origDrawSlots;
      }
    }
    return origDrawSlots.apply(this, args);
  };
  LGraphNode.prototype.drawSlots = drawSlotsHook;
}

///////////////////////
//   Hover cursor    //
///////////////////////

// LiteGraph shows one "crosshair" for the whole node, slots included. Its
// _updateCursorStyle() runs on every pointer move, right after it records
// which slot is under the pointer in node.mouseOver, so we override the
// cursor there. Uses the same hover box LiteGraph uses to highlight slots.
let slotCursor = "crosshair";

function installCursorPatch() {
  const origUpdateCursorStyle = LGraphCanvas.prototype._updateCursorStyle;
  if (!origUpdateCursorStyle) return;

  LGraphCanvas.prototype._updateCursorStyle = function (...args) {
    const result = origUpdateCursorStyle.apply(this, args);
    if (slotCursor === "crosshair") return result;

    const { state, pointer } = this;
    if (!state?.shouldSetCursor || state.draggingCanvas || state.draggingItems || state.readOnly) return result;
    if (pointer?.resizeDirection) return result;

    const over = this.node_over?.mouseOver;
    // Ignore inputs that sit on a widget: hovering the widget itself shouldn't count
    const overSlot = over && (over.outputId > -1 || (over.inputId > -1 && !over.overWidget));
    if (overSlot) this._setCursor(slotCursor);
    return result;
  };
}

function setSlotCursor(value) {
  slotCursor = value || "crosshair";
  document.documentElement.style.setProperty("--bski-slot-cursor", slotCursor);
}

///////////////////////
//     Settings      //
///////////////////////

function setScale(kind, value) {
  const s = Number(value) || 1;
  scales[kind] = s;
  document.documentElement.style.setProperty(`--bski-${kind}-dot-scale`, s);
  app.canvas?.setDirty?.(true, true);
}

app.registerExtension({
  name: "bskiFrontend.slotDots",

  settings: [
    {
      id: "BskiFrontend.SlotDots.OutputScale",
      category: ["BskiFrontend", "Slot Dots", "Output dot size"],
      name: "Output dot size",
      tooltip: "Scales the connection dots on node outputs. 1 = ComfyUI default.",
      type: "slider",
      attrs: { min: 1, max: 5, step: 0.1 },
      defaultValue: 3,
      onChange: (value) => setScale("output", value),
    },
    {
      id: "BskiFrontend.SlotDots.InputScale",
      category: ["BskiFrontend", "Slot Dots", "Input dot size"],
      name: "Input dot size",
      tooltip: "Scales the connection dots on node inputs. 1 = ComfyUI default.",
      type: "slider",
      attrs: { min: 1, max: 5, step: 0.1 },
      defaultValue: 1,
      onChange: (value) => setScale("input", value),
    },
    {
      id: "BskiFrontend.SlotDots.HoverCursor",
      category: ["BskiFrontend", "Slot Dots", "Hover cursor"],
      name: "Cursor when hovering a slot",
      tooltip: "Mouse cursor shown over input/output dots. crosshair = ComfyUI default.",
      type: "combo",
      options: ["crosshair", "pointer", "grab", "cell", "copy", "alias", "move", "default"],
      defaultValue: "grab",
      onChange: (value) => setSlotCursor(value),
    },
  ],

  setup() {
    installSlotPatches();
    installCursorPatch();

    // Nodes 2.0 (Vue nodes): `transform` stacks with the built-in hover `scale`
    const style = document.createElement("style");
    style.textContent = `
      .lg-slot--output .slot-dot { transform: scale(var(--bski-output-dot-scale, 1)); }
      .lg-slot--input  .slot-dot { transform: scale(var(--bski-input-dot-scale, 1)); }
      .lg-slot, .lg-slot * { cursor: var(--bski-slot-cursor, crosshair); }
    `;
    document.head.appendChild(style);
  },
});
