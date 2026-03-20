/** Map network_rank (DB aggregate) to a display tier label. */
export function tierFromNetworkRank(rank: number | null | undefined): string {
  const r = Math.max(0, Number(rank ?? 0));
  if (r >= 5000) return "Visionary";
  if (r >= 1000) return "Innovator";
  if (r >= 500) return "Thinker";
  if (r >= 100) return "Contributor";
  return "Observer";
}
