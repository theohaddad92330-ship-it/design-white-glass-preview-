export function BoardSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-[132px] animate-pulse rounded-xl bg-[var(--bellum-surface-2)] motion-reduce:animate-none"
        />
      ))}
    </div>
  )
}
