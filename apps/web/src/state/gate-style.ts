// Gate families share colors in logical, compiled, and register views.
export const gateFamilies = {
  pauli: { label: "Pauli / identity", color: "#73baff" },
  hadamard: { label: "Hadamard", color: "#f2cc76" },
  rotation: { label: "Rotation", color: "#63cbb6" },
  phase: { label: "Phase", color: "#a9a8f4" },
  controlled: { label: "Controlled", color: "#ee9c84" },
  swap: { label: "Swap", color: "#dc9cc5" },
  other: { label: "Other / custom", color: "#b8c4cf" },
  measurement: { label: "Measurement", color: "#b7a1ee" },
} as const;
export function gateStyle(name: string) {
  const key = name.toLowerCase();
  if (["id", "i", "x", "y", "z", "sx", "sxdg"].includes(key))
    return gateFamilies.pauli;
  if (key === "h") return gateFamilies.hadamard;
  if (
    ["rx", "ry", "rz", "rxx", "ryy", "rzz", "r", "u", "u2", "u3"].includes(key)
  )
    return gateFamilies.rotation;
  if (["p", "phase", "s", "sdg", "t", "tdg", "u1"].includes(key))
    return gateFamilies.phase;
  if (["swap", "iswap", "dcx"].includes(key)) return gateFamilies.swap;
  if (/^(c[xyzhspt]|ccx|mcx|mcp|c[ru]|cswap)/.test(key))
    return gateFamilies.controlled;
  return gateFamilies.other;
}
