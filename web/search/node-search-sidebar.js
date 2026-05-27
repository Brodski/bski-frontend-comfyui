/**
 * ComfyUI Node Search Sidebar
 *
 * Adds a sidebar tab with a search box that lets users find any node in the
 * current workflow by ID, type name, or display title, then jump to it on the canvas.
 */

// ComfyUI extensions must use /scripts/app.js (served from ComfyUI root, not relative)
import { app } from "/scripts/app.js";

console.log("%c[NodeSearchSidebar] ✅ JS module loaded", "color: #4ade80; font-weight: bold;");

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Smooth-scroll the canvas to centre on the given [x, y] position. */
function jumpToPosition([x, y], canvas) {
  const drag = canvas.ds;
  const windowWidth  = document.body.clientWidth;
  const windowHeight = document.body.clientHeight;
  const scale  = drag.scale;
  const toX    = -x + (windowWidth  * 0.5) / scale;
  const toY    = -y + (windowHeight * 0.5) / scale;
  const duration = 300;
  const end    = Date.now() + duration;
  const fromX  = drag.offset[0];
  const fromY  = drag.offset[1];

  function easeInOut(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function lerp(a, b, t) { return a + easeInOut(t) * (b - a); }

  function update() {
    const delta = end - Date.now();
    if (Date.now() < end) {
      requestAnimationFrame(update);
    } else {
      drag.offset[0] = toX;
      drag.offset[1] = toY;
      canvas.setDirty(true, true);
      return;
    }
    const proc = 1 - delta / duration;
    drag.offset[0] = lerp(fromX, toX, proc);
    drag.offset[1] = lerp(fromY, toY, proc);
    canvas.setDirty(true, true);
  }
  requestAnimationFrame(update);
}

/** Jump to a node by its id – select it and animate the canvas to it. */
function jumpToNodeById(id) {
  const canvas = app.canvas;
  const node   = app.graph.getNodeById(id);
  if (!node) return;
  const [x, y]           = node.pos;
  const [width, height]  = node.size;
  jumpToPosition([x + width / 2, y + height / 2], canvas);
  canvas.selectNode(node);
}

// ─── Node-mode constants (mirror EasyUse's values) ──────────────────────────
const NODE_MODE = { ALWAYS: 0, BYPASS: 4, NEVER: 2, MUTE: 2 };

// ─── Build the sidebar UI ────────────────────────────────────────────────────

/**
 * Creates the full sidebar DOM and returns the root element.
 * Call this once; the element is re-used for the lifetime of the sidebar.
 */
function buildSidebarUI() {
  console.log("%c[NodeSearchSidebar] buildSidebarUI() — constructing DOM", "color: #a3e635;");

  // ── Root container ──────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.className = "nss-root";

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "nss-header";
  header.innerHTML = `<span class="nss-title">Node Search</span>`;

  // ── Search box ──────────────────────────────────────────────────────────
  const searchWrap = document.createElement("div");
  searchWrap.className = "nss-search-wrap";

  const searchIcon = document.createElement("span");
  searchIcon.className = "nss-search-icon pi pi-search";

  const searchInput = document.createElement("input");
  searchInput.className = "nss-search-input";
  searchInput.type = "text";
  searchInput.placeholder = "Search by Node ID / Name…";
  searchInput.setAttribute("autocomplete", "off");
  searchInput.setAttribute("spellcheck", "false");

  const clearBtn = document.createElement("button");
  clearBtn.className = "nss-clear-btn pi pi-times";
  clearBtn.title = "Clear search";
  clearBtn.style.display = "none";

  searchWrap.append(searchIcon, searchInput, clearBtn);

  // ── Results list ────────────────────────────────────────────────────────
  const listEl = document.createElement("ul");
  listEl.className = "nss-list";

  // ── Empty-state placeholder ─────────────────────────────────────────────
  const emptyEl = document.createElement("div");
  emptyEl.className = "nss-empty";
  emptyEl.innerHTML = `
    <i class="pi pi-sitemap nss-empty-icon"></i>
    <div class="nss-empty-title">No Nodes</div>
    <div class="nss-empty-msg">No nodes found in the workflow</div>
  `;

  // ── Assemble ────────────────────────────────────────────────────────────
  root.append(header, searchWrap, listEl, emptyEl);

  // ─── State & rendering ──────────────────────────────────────────────────
  let currentQuery = "";

  /** Return all nodes in the current graph, sorted by id. */
  function getNodes() {
    return (app.graph?._nodes ?? []).slice().sort((a, b) => a.id - b.id);
  }

  /** Return true if node matches the query string. */
  function matches(node, q) {
    if (!q) return true;
    const lq = q.toLowerCase();
    return (
      String(node.id).includes(lq) ||
      (node.type  ?? "").toLowerCase().includes(lq) ||
      (node.title ?? "").toLowerCase().includes(lq)
    );
  }

  /** CSS class suffix for the node's bypass/mute state. */
  function modeClass(node) {
    if (node.mode === NODE_MODE.BYPASS) return " nss-node--bypass";
    if (node.mode === NODE_MODE.NEVER)  return " nss-node--mute";
    return "";
  }

  /** Render (or re-render) the list based on the current query. */
  function render() {
    const nodes   = getNodes();
    const q       = currentQuery.trim();
    const visible = q ? nodes.filter(n => matches(n, q)) : nodes;

    listEl.innerHTML = "";

    if (visible.length === 0) {
      emptyEl.querySelector(".nss-empty-msg").textContent =
        q ? "No nodes match your search" : "No nodes found in the workflow";
      emptyEl.style.display = "flex";
      listEl.style.display  = "none";
      return;
    }

    emptyEl.style.display = "none";
    listEl.style.display  = "block";

    for (const node of visible) {
      const li = document.createElement("li");
      li.className = "nss-node" + modeClass(node);
      li.title = "Double-click to jump to this node";

      const idBadge = document.createElement("span");
      idBadge.className = "nss-node-id";
      idBadge.textContent = `#${node.id}`;

      const label = document.createElement("span");
      label.className = "nss-node-label";
      label.textContent = node.title || node.type || `Node ${node.id}`;

      // Eye icon – toggles bypass
      const eyeBtn = document.createElement("button");
      eyeBtn.className =
        "nss-eye-btn pi " +
        (node.mode === NODE_MODE.ALWAYS ? "pi-eye" : "pi-eye-slash");
      eyeBtn.title = node.mode === NODE_MODE.ALWAYS ? "Active – click to bypass" : "Bypassed/Muted – click to activate";

      eyeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const graphNode = app.graph.getNodeById(node.id);
        if (!graphNode) return;
        const isAlways = graphNode.mode === NODE_MODE.ALWAYS;
        graphNode.mode = isAlways ? NODE_MODE.BYPASS : NODE_MODE.ALWAYS;
        app.graph.change();
        render();
      });

      // Jump on double-click (or click on the label area)
      li.addEventListener("dblclick", () => jumpToNodeById(node.id));

      // Single click selects on canvas (but doesn't animate)
      li.addEventListener("click", (e) => {
        if (e.target === eyeBtn) return;
        jumpToNodeById(node.id);
      });

      li.append(idBadge, label, eyeBtn);
      listEl.appendChild(li);
    }
  }

  // ─── Search input events ────────────────────────────────────────────────
  searchInput.addEventListener("input", () => {
    currentQuery = searchInput.value;
    clearBtn.style.display = currentQuery ? "flex" : "none";
    searchIcon.style.display = currentQuery ? "none" : "flex";
    render();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    currentQuery = "";
    clearBtn.style.display  = "none";
    searchIcon.style.display = "flex";
    searchInput.focus();
    render();
  });

  // ─── Graph change listeners – keep list fresh ───────────────────────────
  //
  // We hook into ComfyUI's graph-change callback to refresh the list
  // whenever nodes are added/removed/moved/renamed.
  //
  let refreshTimeout = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(render, 80);
  }

  // Patch once; multiple calls are safe because we only patch if not already done.
  if (!app.graph.__nssPatched) {
    app.graph.__nssPatched = true;

    const origNodeAdded = app.graph.onNodeAdded;
    app.graph.onNodeAdded = function (node) {
      scheduleRefresh();
      const origRemoved = node.onRemoved;
      node.onRemoved = function () {
        scheduleRefresh();
        return origRemoved?.apply(this, arguments);
      };
      return origNodeAdded?.apply(this, arguments);
    };

    // afterChange fires at the end of most graph mutations
    const origAfterChange = app.graph.afterChange;
    app.graph.afterChange = function () {
      scheduleRefresh();
      return origAfterChange?.apply(this, arguments);
    };
  }

  // ─── Expose a refresh handle so the tab renderer can call it ───────────
  root.__refresh = render;

  return root;
}

// ─── Register the sidebar tab ────────────────────────────────────────────────

app.registerExtension({
  name: "NodeSearchSidebar",

  async setup() {
    console.log("%c[NodeSearchSidebar] setup() called — registering sidebar tab", "color: #4ade80;");

    // Build the UI once
    const sidebarEl = buildSidebarUI();

    // Inject our stylesheet
    const style = document.createElement("link");
    style.rel  = "stylesheet";
    style.href = new URL("./node-search-sidebar.css", import.meta.url).href;
    document.head.appendChild(style);

    // Register the sidebar tab
    app.extensionManager.registerSidebarTab({
      id:      "bski-node-search-sidebar",
      icon:    "pi pi-search",
      title:   "Node Search",
      tooltip: "Search nodes by ID or name",
      type:    "custom",
      render(el) {
        console.log("%c[NodeSearchSidebar] Sidebar panel rendered (tab opened)", "color: #4ade80;");
        
        el.style.height   = "100%";
        el.style.overflow = "hidden";
        el.appendChild(sidebarEl);
        // Refresh when the panel becomes visible
        sidebarEl.__refresh?.();
      },
    });
    
    console.log("%c[NodeSearchSidebar] ✅ Sidebar tab registered — look for the 🔍 icon in the left sidebar", "color: #4ade80; font-weight: bold;");
  },
});
