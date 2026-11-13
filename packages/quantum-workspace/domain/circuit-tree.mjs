/* Pure hierarchy and visibility helpers, shared by viewer tests. */
// Gate ranges are a navigation fallback, never inferred algorithmic modules.
const LEAF_GATES = 8;
const MAX_BRANCHES = 6;
function sequenceNodes(indices, gates) {
  const branches = Math.min(
    MAX_BRANCHES,
    Math.ceil(indices.length / LEAF_GATES),
  );
  const size = Math.max(1, Math.ceil(indices.length / branches));
  const nodes = [];
  for (let offset = 0; offset < indices.length; offset += size) {
    const ids = indices.slice(offset, offset + size);
    const first = ids[0],
      last = ids.at(-1);
    nodes.push(
      withStats(
        {
          id: "__sequence__" + first + "_" + last,
          kind: "sequence",
          label:
            "Gates " + (first + 1) + (first === last ? "" : "–" + (last + 1)),
          children: ids.length > LEAF_GATES ? sequenceNodes(ids, gates) : [],
          gate_indices: ids,
        },
        gates,
      ),
    );
  }
  return nodes;
}
function withStats(node, gates) {
  const rows = node.gate_indices.map((i) => gates[i]);
  node.wires = [...new Set(rows.flatMap((g) => g.wires))].sort((a, b) => a - b);
  node.gate_count = rows.length;
  node.gate_counts = {};
  const depths = new Map();
  for (const gate of rows) {
    node.gate_counts[gate.name] = (node.gate_counts[gate.name] || 0) + 1;
    const depth = Math.max(0, ...gate.wires.map((w) => depths.get(w) || 0)) + 1;
    gate.wires.forEach((w) => depths.set(w, depth));
  }
  node.depth = Math.max(0, ...depths.values());
  return node;
}
function circuitHierarchy(c) {
  const gates = c.logical_instructions || c.instructions;
  const ungrouped = (n) =>
    /^ungrouped(?:_\d+)?$/.test(n.id) &&
    !c.groups?.[n.id] &&
    !c.groups?.[n.original || "ungrouped"] &&
    !n.children.length;
  if (c.hierarchy) {
    // Preserve source modules, replacing only the anonymous flat containers.
    function normalize(node) {
      const children = node.children.flatMap((child) =>
        ungrouped(child)
          ? sequenceNodes(child.gate_indices, gates)
          : [normalize(child)],
      );
      return { ...node, children };
    }
    if (c.hierarchy.children.length && c.hierarchy.children.every(ungrouped))
      return sequenceRoot(c.hierarchy.gate_indices, gates);
    return normalize(c.hierarchy);
  }
  const indices = gates.map((_, i) => i);
  if (
    !c.groups?.ungrouped &&
    gates.every((g) => !g.group || g.group === "ungrouped")
  )
    return sequenceRoot(indices, gates);
  const root = {
    id: "__root__",
    label: "Program",
    children: [],
    gate_indices: indices,
  };
  let last = null;
  gates.forEach((gate, i) => {
    const group = gate.group || "ungrouped";
    if (last?.original !== group) {
      last = {
        id: group + "_" + i,
        original: group,
        label: c.groups?.[group] || group,
        children: [],
        gate_indices: [],
      };
      root.children.push(last);
    }
    last.gate_indices.push(i);
  });
  root.children = root.children.flatMap((node) =>
    ungrouped(node)
      ? sequenceNodes(node.gate_indices, gates)
      : [withStats(node, gates)],
  );
  return withStats(root, gates);
}
function sequenceRoot(indices, gates) {
  return withStats(
    {
      id: "__root__",
      label: "Gate sequence",
      kind: "sequence",
      children:
        indices.length > LEAF_GATES ? sequenceNodes(indices, gates) : [],
      gate_indices: indices,
    },
    gates,
  );
}
function hierarchyOpenAtLevel(root, limit) {
  const open = new Set(["__root__"]);
  // The middle preset exposes range leaves, reserving gates for All gates.
  const depth = root.kind === "sequence" && limit === 3 ? 2 : limit;
  function visit(node, level) {
    if (level < depth) open.add(node.id);
    node.children.forEach((child) => visit(child, level + 1));
  }
  visit(root, 0);
  return open;
}
function hierarchyIndex(root) {
  const map = new Map();
  function visit(n, parent = null, level = 0) {
    map.set(n.id, { node: n, parent, level });
    n.children.forEach((child) => visit(child, n, level + 1));
  }
  visit(root);
  return map;
}
function hierarchyLayout(root, open) {
  function visit(n) {
    if (n.id !== "__root__" && !open.has(n.id))
      return { node: n, width: 164, collapsed: true, children: [] };
    const children = n.children.length
      ? n.children.map(visit)
      : n.gate_indices.map((i) => ({ gate: i, width: 72, children: [] }));
    const gap = 22,
      pad = n.id === "__root__" ? 0 : 24;
    return {
      node: n,
      width: Math.max(
        92,
        children.reduce((a, c) => a + c.width, 0) +
          gap * Math.max(0, children.length - 1) +
          2 * pad,
      ),
      collapsed: false,
      children,
      pad,
      gap,
    };
  }
  const layout = visit(root);
  function place(n, x) {
    n.x = x;
    let next = x + (n.pad || 0);
    n.children.forEach((c) => {
      place(c, next);
      next += c.width + (n.gap || 0);
    });
  }
  place(layout, 110);
  return layout;
}
function hierarchyVisibleCoverage(layout) {
  if (layout.gate !== undefined) return [layout.gate];
  if (layout.collapsed) return layout.node.gate_indices.slice();
  return layout.children.flatMap(hierarchyVisibleCoverage);
}
export {
  circuitHierarchy,
  hierarchyOpenAtLevel,
  hierarchyIndex,
  hierarchyLayout,
  hierarchyVisibleCoverage,
};
