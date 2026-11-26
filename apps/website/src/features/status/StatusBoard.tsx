'use client'

import { Text } from '@bellum/ui'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

/** Poll cadence of the public page. The API caches its checks 15s server-side. */
const REFRESH_INTERVAL_MS = 30_000

/** Order (and closed set) of the components rendered on the page. */
const COMPONENT_KEYS = ['api', 'database', 'redis', 'ia_engine'] as const
type ComponentKey = (typeof COMPONENT_KEYS)[number]

type ComponentState = 'operational' | 'down' | 'unknown'
type OverallState = 'operational' | 'degraded' | 'down' | 'unreachable' | 'loading'

type StatusPayload = {
  status?: string
  components?: Partial<Record<ComponentKey, { status?: string }>>
  checkedAt?: string
}

type BoardState = {
  overall: OverallState
  components: Record<ComponentKey, ComponentState> | null
  checkedAt: string | null
}

const INITIAL_STATE: BoardState = { overall: 'loading', components: null, checkedAt: null }

/** Colour language: emerald = up, amber = degraded, red = down/unreachable. */
const OVERALL_STYLES: Record<OverallState, { dot: string; text: string }> = {
  loading: { dot: 'bg-zinc-400', text: 'text-zinc-300' },
  operational: { dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]', text: 'text-emerald-300' },
  degraded: { dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]', text: 'text-amber-300' },
  down: { dot: 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.7)]', text: 'text-red-300' },
  unreachable: { dot: 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.7)]', text: 'text-red-300' },
}

const COMPONENT_STYLES: Record<ComponentState, { dot: string; pill: string }> = {
  operational: { dot: 'bg-emerald-400', pill: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' },
  down: { dot: 'bg-red-400', pill: 'border-red-400/20 bg-red-400/10 text-red-300' },
  unknown: { dot: 'bg-zinc-500', pill: 'border-white/10 bg-white/[0.04] text-zinc-400' },
}

function toComponentState(raw: string | undefined): ComponentState {
  return raw === 'operational' || raw === 'down' ? raw : 'unknown'
}

function toBoardState(payload: StatusPayload | null, httpOk: boolean): BoardState {
  const overallRaw = payload?.status
  if (!httpOk || !overallRaw || overallRaw === 'unreachable') {
    return { overall: 'unreachable', components: null, checkedAt: payload?.checkedAt ?? null }
  }
  const overall: OverallState =
    overallRaw === 'operational' || overallRaw === 'degraded' || overallRaw === 'down' ? overallRaw : 'unreachable'
  const components = Object.fromEntries(
    COMPONENT_KEYS.map(key => [key, toComponentState(payload?.components?.[key]?.status)]),
  ) as Record<ComponentKey, ComponentState>
  return { overall, components, checkedAt: payload?.checkedAt ?? null }
}

export function StatusBoard() {
  const t = useTranslations('status')
  const locale = useLocale()
  const [state, setState] = useState<BoardState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' })
        const payload = (await res.json().catch(() => null)) as StatusPayload | null
        if (!cancelled) setState(toBoardState(payload, res.ok))
      } catch {
        if (!cancelled) setState({ overall: 'unreachable', components: null, checkedAt: null })
      }
    }

    void refresh()
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const overallStyle = OVERALL_STYLES[state.overall]
  const detailKey = state.overall === 'degraded' || state.overall === 'down' || state.overall === 'unreachable'
  const checkedAtLabel = formatCheckedAt(state.checkedAt, locale)

  return (
    <section className="relative pb-24">
      <div className="mx-auto max-w-2xl px-6">
        {/* Overall banner */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span aria-hidden className={`size-3 shrink-0 rounded-full ${overallStyle.dot}`} />
            <Text element="h2" size="lg" weight="medium" className={overallStyle.text} aria-live="polite">
              {t(`overall.${state.overall}`)}
            </Text>
          </div>
          {detailKey && (
            <Text element="p" size="sm" color="text-zinc-400" className="mt-3 leading-relaxed">
              {t(`overallDetail.${state.overall}`)}
            </Text>
          )}
          {checkedAtLabel && (
            <Text element="p" size="xs" className="mt-3 text-[#8a8aa0]">
              {t('lastChecked', { time: checkedAtLabel })}
            </Text>
          )}
        </div>

        {/* Per-component rows */}
        <ul className="mt-6 flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {COMPONENT_KEYS.map(key => {
            const componentState: ComponentState = state.components?.[key] ?? 'unknown'
            const style = COMPONENT_STYLES[componentState]
            return (
              <li key={key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <Text element="h3" size="sm" weight="medium" color="text-white">
                    {t(`components.${key}.name`)}
                  </Text>
                  <Text element="p" size="xs" className="mt-1 text-[#8a8aa0]">
                    {t(`components.${key}.description`)}
                  </Text>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 ${style.pill}`}>
                  <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
                  <Text element="span" size="xs">
                    {t(`componentStatus.${componentState}`)}
                  </Text>
                </span>
              </li>
            )
          })}
        </ul>

        {/* Honest v1: realtime only — history/incident log documented as future work. */}
        <div className="mt-6 text-center">
          <Text element="p" size="xs" className="text-[#5e5e74]">
            {t('autoRefresh')}
          </Text>
          <Text element="p" size="xs" className="mt-1 text-[#5e5e74]">
            {t('historyNote')}
          </Text>
        </div>
      </div>
    </section>
  )
}

function formatCheckedAt(checkedAt: string | null, locale: string): string | null {
  if (!checkedAt) return null
  const date = new Date(checkedAt)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
}
