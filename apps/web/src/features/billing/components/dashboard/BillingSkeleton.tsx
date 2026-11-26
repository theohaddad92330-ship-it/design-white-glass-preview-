export function BillingSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4 pb-8">
      <div className="space-y-2">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-[var(--bellum-surface-2)]" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-[var(--bellum-surface-2)]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-[320px] animate-pulse rounded-xl bg-[var(--bellum-surface-2)]" />
        <div className="h-[320px] animate-pulse rounded-xl bg-[var(--bellum-surface-2)]" />
      </div>
      <div className="h-[280px] animate-pulse rounded-xl bg-[var(--bellum-surface-2)]" />
    </div>
  )
}
