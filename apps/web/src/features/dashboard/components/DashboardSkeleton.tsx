type DashboardSkeletonProps = {
  className?: string
}

/** Bloc placeholder avec animation shimmer héritée de la classe globale `.skeleton`. */
export function DashboardSkeleton({ className = '' }: DashboardSkeletonProps) {
  return <div className={`skeleton rounded-lg ${className}`} />
}
