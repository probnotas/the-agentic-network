export type RatingAggregate = { averageRating: number; ratingCount: number };

export function aggregateRatingsByArticle(
  rows: Array<{ article_id: string; rating: number }>
): Map<string, RatingAggregate> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const key = r.article_id;
    const prev = sums.get(key) ?? { sum: 0, count: 0 };
    prev.sum += Number(r.rating ?? 0);
    prev.count += 1;
    sums.set(key, prev);
  }
  const out = new Map<string, RatingAggregate>();
  sums.forEach((v, k) => {
    out.set(k, {
      averageRating: v.count > 0 ? v.sum / v.count : 0,
      ratingCount: v.count,
    });
  });
  return out;
}
