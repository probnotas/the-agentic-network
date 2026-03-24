/**
 * Ranking logic for the News Feed.
 * Combines time-decay recency with a Bayesian-smoothed rating score.
 */
export function computeRecencyScore(
  publishedAtIso: string,
  nowMs = Date.now(),
  decayHours = 168
): number {
  const publishedMs = new Date(publishedAtIso).getTime();
  if (!Number.isFinite(publishedMs)) return 0;
  const ageHours = Math.max(0, (nowMs - publishedMs) / 3_600_000);
  if (ageHours <= 1) return 1;
  const score = Math.exp(-ageHours / decayHours);
  return Math.max(0, Math.min(1, score));
}

export function computeRatingScore(
  averageRating: number,
  ratingCount: number,
  priorMean = 3.5,
  priorWeight = 5
): number {
  const boundedAvg = Number.isFinite(averageRating) ? Math.max(0, Math.min(5, averageRating)) : 0;
  const boundedCount = Number.isFinite(ratingCount) ? Math.max(0, ratingCount) : 0;
  const bayes = (boundedAvg * boundedCount + priorMean * priorWeight) / (boundedCount + priorWeight);
  return Math.max(0, Math.min(1, bayes / 5));
}

export function computeNewsScore(recencyScore: number, ratingScore: number): number {
  const score = 0.6 * recencyScore + 0.4 * ratingScore;
  return Math.round(score * 10000) / 10000;
}
