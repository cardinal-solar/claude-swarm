interface RatingStarsProps {
  rating: number;
  count: number;
  interactive?: boolean;
  onRate?: (score: number) => void;
}

export function RatingStars({ rating, count, interactive, onRate }: RatingStarsProps) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-center gap-1">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onRate?.(star)}
          className={`text-sm ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} ${
            star <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-300'
          }`}
        >
          ★
        </button>
      ))}
      {count > 0 && (
        <span className="text-xs text-gray-400 ml-1">({rating.toFixed(1)}, {count})</span>
      )}
    </div>
  );
}
