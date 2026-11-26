import { Button, Tooltip, TooltipContent, TooltipTrigger, cn, useCopiedFlash } from '@bellum/ui'
import { ChevronUp, Command, Copy, Globe, LogOut, RefreshCw, Terminal, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useSession } from '@/lib/hooks/use-session'
import { useTheme } from '@/features/theme/theme-provider'
import { sanitizeDebugIdentifier } from '@/lib/debug/sanitize-debug-identifier'
import { useFCPMetrics, useNetworkMetrics, usePerformanceMetrics, useRenderMetrics } from './DevToolBarMetric'

type DevStatusBarProps = {
  onHide: () => void
  collapsed?: boolean
  onExpand?: () => void
}

export function DevStatusBar({ onHide, collapsed = false, onExpand }: DevStatusBarProps) {
  const { user } = useSession()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copiedRoute, flashCopiedRoute] = useCopiedFlash(1200)
  const perf = usePerformanceMetrics()
  const { pendingRequests } = useNetworkMetrics()
  const { renderTime } = useRenderMetrics()
  const { fcp } = useFCPMetrics()

  const viteEnv = (import.meta.env.VITE_ENV as string) || 'development'
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const appVersion = __CODE_VERSION_ID__ ?? 'dev'
  const envLabel = isLocalhost ? 'Local' : viteEnv === 'production' ? 'Prod' : viteEnv

  const copyRoute = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    flashCopiedRoute()
  }, [])

  if (collapsed) {
    return (
      <div
        className={cn(
          'fixed bottom-2 left-1/2 z-devtools -translate-x-1/2 rounded-full px-2 py-1 text-xs shadow-xl border',
          isDark
            ? 'border-white/10 bg-[var(--bellum-bg-darker)] text-[var(--bellum-text-secondary)]'
            : 'border-[var(--bellum-border)] bg-white text-[var(--bellum-text-muted)]',
        )}
      >
        <button
          onClick={onExpand}
          className={cn(
            'flex items-center gap-1',
            isDark ? 'hover:text-white' : 'hover:text-[var(--bellum-text-primary)]',
          )}
        >
          <Command className="size-3" /> Dev <ChevronUp className="size-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'fixed bottom-0 inset-x-0 z-devtools font-mono text-xs backdrop-blur border-t',
        isDark
          ? 'border-white/[0.06] bg-[var(--bellum-bg-darker)] text-[var(--bellum-text-secondary)]'
          : 'border-[color-mix(in_srgb,var(--bellum-border)_70%,transparent)] bg-white text-[var(--bellum-text-secondary)]',
      )}
    >
      <div className="relative flex h-7 items-center text-[var(--bellum-text-secondary)]">
        <div className="flex items-center">
          <div className="flex items-center gap-1.5 px-3">
            <span className={cn('h-1.5 w-1.5 rounded-full', isLocalhost ? 'bg-emerald-400' : 'bg-indigo-400')} />
            <span className="font-medium text-[var(--bellum-text-primary)] dark:text-[var(--bellum-text-primary)]">
              {envLabel}
            </span>
          </div>
          <span className="px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)]">
            {sanitizeDebugIdentifier(user?.email)}
          </span>
          <span className="px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)]">
            v {appVersion}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] hover:bg-[color-mix(in_srgb,var(--bellum-surface-2)_65%,transparent)] dark:hover:text-[var(--bellum-text-primary)] dark:hover:bg-white/[0.06]"
                onClick={copyRoute}
              >
                <Copy className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy page URL</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] hover:bg-[color-mix(in_srgb,var(--bellum-surface-2)_65%,transparent)] dark:hover:text-[var(--bellum-text-primary)] dark:hover:bg-white/[0.06]"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload page</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] hover:bg-[color-mix(in_srgb,var(--bellum-surface-2)_65%,transparent)] dark:hover:text-[var(--bellum-text-primary)] dark:hover:bg-white/[0.06]"
                onClick={() => {
                  localStorage.clear()
                  sessionStorage.clear()
                  window.location.reload()
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear browser storage</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] hover:bg-[color-mix(in_srgb,var(--bellum-surface-2)_65%,transparent)] dark:hover:text-[var(--bellum-text-primary)] dark:hover:bg-white/[0.06]"
                onClick={() => {
                  localStorage.removeItem('bellum_session')
                  sessionStorage.clear()
                  window.location.reload()
                }}
              >
                <LogOut className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear local session</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] hover:bg-[color-mix(in_srgb,var(--bellum-surface-2)_65%,transparent)] dark:hover:text-[var(--bellum-text-primary)] dark:hover:bg-white/[0.06]"
                onClick={() => window.open(import.meta.env.VITE_API_URL || 'http://localhost:3000/health', '_blank')}
              >
                <Globe className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>API health</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] hover:bg-[color-mix(in_srgb,var(--bellum-surface-2)_65%,transparent)] dark:hover:text-[var(--bellum-text-primary)] dark:hover:bg-white/[0.06]"
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify({ route: window.location.pathname, env: viteEnv }, null, 2),
                  )
                }
              >
                <Terminal className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy debug JSON</TooltipContent>
          </Tooltip>
          <span className="px-2 text-xs text-[var(--success-soft-text)]">{copiedRoute ? 'copied' : ''}</span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onHide}
              className={cn(
                'absolute left-1/2 -translate-x-1/2 rounded-md p-1',
                isDark
                  ? 'text-[var(--bellum-text-muted)] hover:bg-white/[0.06]'
                  : 'text-[var(--bellum-text-muted)] hover:bg-[color-mix(in_srgb,var(--bellum-surface-2)_65%,transparent)]',
              )}
            >
              <Command className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Hide dev bar</TooltipContent>
        </Tooltip>

        <div className="ml-auto flex items-center gap-0.5 pr-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)]">
                Mem{' '}
                <span className="text-[var(--bellum-text-primary)] dark:text-[var(--bellum-text-primary)]">
                  {perf.memory || 0}MB
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>App memory</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)]">
                Delay{' '}
                <span className="text-[var(--bellum-text-primary)] dark:text-[var(--bellum-text-primary)]">
                  {renderTime}ms
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Render delay</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex flex-col px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] leading-none">
                <span className="flex items-center gap-1">
                  Jank{' '}
                  <span
                    className={cn(
                      perf.jank > 5
                        ? 'text-[var(--warning-soft-text)]'
                        : 'text-[var(--bellum-text-primary)] dark:text-[var(--bellum-text-primary)]',
                    )}
                  >
                    {perf.jank}%
                  </span>
                </span>
                <span className="mt-0.5 inline-flex h-1 w-10 overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className={cn(
                      'h-full rounded-full',
                      perf.jank > 10 ? 'bg-red-400' : perf.jank > 5 ? 'bg-amber-400' : 'bg-[var(--bellum-text-muted)]',
                    )}
                    style={{ width: `${Math.min(perf.jank * 2, 100)}%` }}
                  />
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>UI stutter</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex flex-col px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] leading-none">
                <span className="flex items-center gap-1">
                  Net{' '}
                  <span className="text-[var(--bellum-text-primary)] dark:text-[var(--bellum-text-primary)]">
                    {pendingRequests}
                  </span>
                </span>
                <span className="mt-0.5 inline-flex h-1 w-10 overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className={cn(
                      'h-full rounded-full',
                      pendingRequests > 2 ? 'bg-amber-400' : 'bg-[var(--bellum-text-muted)]',
                    )}
                    style={{ width: `${Math.min(pendingRequests * 20, 100)}%` }}
                  />
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Network requests</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex flex-col px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)] leading-none">
                <span className="flex items-center gap-1">
                  Hydr{' '}
                  <span className="text-[var(--bellum-text-primary)] dark:text-[var(--bellum-text-primary)]">
                    {fcp !== null ? `${fcp}ms` : 'NA'}
                  </span>
                </span>
                <span className="mt-0.5 inline-flex h-1 w-10 overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className={cn(
                      'h-full rounded-full',
                      (fcp ?? 0) > 2500
                        ? 'bg-red-400'
                        : (fcp ?? 0) > 1200
                          ? 'bg-amber-400'
                          : 'bg-[var(--bellum-text-muted)]',
                    )}
                    style={{ width: `${Math.min((fcp ?? 0) / 30, 100)}%` }}
                  />
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Page paint time</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="px-2 text-[var(--bellum-text-muted)] dark:text-[var(--bellum-text-muted)]">
                Logger{' '}
                <span className="text-[var(--bellum-text-primary)] dark:text-[var(--bellum-text-primary)]">
                  {perf.longTasks}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Debug events</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
