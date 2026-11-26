import { AnimatedProgressLabel } from '@/components/feedback/AnimatedProgressLabel'

export function EngagementGenerationProgress({ label }: { label: string }) {
  return <AnimatedProgressLabel label={label} appendEllipsis textClassName="text-[var(--bellum-text-primary)]" />
}
