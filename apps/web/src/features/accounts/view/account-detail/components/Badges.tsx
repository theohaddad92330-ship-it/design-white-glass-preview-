import { cn } from '@bellum/ui'

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  sponsor: { bg: 'bg-violet-600/20', text: 'text-[var(--bellum-text-accent)]', border: 'border-violet-600/30' },
  champion: { bg: 'bg-blue-500/20', text: 'text-[var(--info-soft-text)]', border: 'border-blue-500/30' },
  operational: {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-text-muted)_20%,transparent)]',
    text: 'text-[var(--bellum-text-secondary)]',
    border: 'border-[color-mix(in_srgb,var(--bellum-text-muted)_30%,transparent)]',
  },
  purchasing: { bg: 'bg-amber-500/20', text: 'text-[var(--warning-soft-text)]', border: 'border-amber-500/30' },
  influencer: { bg: 'bg-cyan-500/20', text: 'text-[var(--info-soft-text)]', border: 'border-cyan-500/30' },
  blocker: { bg: 'bg-red-500/20', text: 'text-[var(--danger-soft-text)]', border: 'border-red-500/30' },
}

export function roleBadge(role: string | null | undefined) {
  // Treat empty / null / legacy "unknown" rows as "not classified yet" rather
  // than rendering a fake "Unknown" badge — the column is NULL-able in DB and
  // Phase 3 leaves it empty when Claude couldn't pin a role.
  if (!role || role === 'unknown') {
    return <span className="text-xs text-[var(--text-ghost)]">—</span>
  }
  const colors = ROLE_COLORS[role] || {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-text-muted)_20%,transparent)]',
    text: 'text-[var(--bellum-text-secondary)]',
    border: 'border-[color-mix(in_srgb,var(--bellum-text-muted)_30%,transparent)]',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        colors.bg,
        colors.text,
        colors.border,
      )}
    >
      {role}
    </span>
  )
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-text-muted)_20%,transparent)]',
    text: 'text-[var(--bellum-text-secondary)]',
  },
  contacted: { bg: 'bg-blue-500/20', text: 'text-[var(--info-soft-text)]' },
  replied: { bg: 'bg-emerald-500/20', text: 'text-[var(--success-soft-text)]' },
  meeting: { bg: 'bg-violet-500/20', text: 'text-[var(--bellum-text-accent)]' },
}

export function statusBadge(status: string) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['new']!
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        colors.bg,
        colors.text,
      )}
    >
      {status || 'new'}
    </span>
  )
}
