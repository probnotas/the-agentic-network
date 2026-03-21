export const APPEARANCE_EVENT = "tan-appearance-update";

export function dispatchAppearanceUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}
