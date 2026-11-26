import { type ConnectedClientTool } from '@bellum/contracts'
import { AlertTriangle, Check, Plus } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@bellum/ui'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { connectedToolLogo } from './brand-logos'
import { connectedToolIcon } from './connected-tool-icons'

const chipClass = cn(
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs outline-none transition-colors',
  'focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50',
)

/**
 * #5048 — « TES OUTILS AVEC LAURA » : les puces au-dessus du composeur (maquette V8
 * `connected-tools`). Renversement assumé et daté de #3708 (Louis, 31/10/2026) : les bulles
 * d'outils alignées étaient devenues l'entrée compacte « Outils et sources ».
 *
 * Depuis l'arbitrage du 31/10 les puces sont le SEUL endroit où l'on coche un outil (GA-26) ; le
 * menu « Outils et sources » ne fait plus que dire l'état. Écrire ici a le même effet qu'avant :
 * la sélection est celle de `toolSourcesStore`, les exclusions partent avec le tour
 * (`excludedToolFamilies`) et sont appliquées côté serveur. Décocher ne déconnecte aucun compte.
 *
 * Ce qui reste vrai : on ne nomme que ce que l'espace a BRANCHÉ (jamais nos fournisseurs) ; un
 * outil « à reconnecter » renvoie vers `/integrations` — rien ne se reconnecte dans la conversation ;
 * rien quand rien n'est branché (hors salle de démonstration, qui montre ses outils d'exemple).
 */
export function ComposerToolChips({
  tools,
  excludedProviders,
  onToggle,
  disabled,
}: {
  tools: readonly ConnectedClientTool[]
  excludedProviders: readonly string[]
  onToggle: (provider: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('chat')
  const isDemo = useIsDemo()
  if (tools.length === 0 && !isDemo) return null

  return (
    <div
      role="group"
      aria-label={t('toolChips.group')}
      data-testid="composer-tool-chips"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {tools.map(tool => {
        const Icon = connectedToolIcon(tool)
        const logo = connectedToolLogo(tool.provider, tool.family)
        const selected = !excludedProviders.includes(tool.provider)
        const glyph = logo ? (
          <img
            src={logo}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            aria-hidden
            className="size-4 shrink-0 rounded-sm bg-[var(--bellum-brand-logo-chip)] object-contain p-px"
            data-testid={`tool-chip-logo-${tool.provider}`}
          />
        ) : (
          <Icon className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
        )
        if (tool.needsReconnect) {
          return (
            <Link
              key={tool.provider}
              to="/integrations"
              className={cn(
                chipClass,
                'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
              )}
            >
              {glyph}
              <span className="whitespace-nowrap">{tool.name}</span>
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{t('toolChips.reconnect')}</span>
            </Link>
          )
        }
        return (
          <button
            key={tool.provider}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onToggle(tool.provider)}
            className={cn(
              chipClass,
              selected
                ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
                : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-muted)]',
            )}
          >
            {glyph}
            <span className="whitespace-nowrap">{tool.name}</span>
            {selected ? <Check className="size-3 shrink-0" aria-hidden /> : null}
            {tool.limited ? <span className="whitespace-nowrap">{t('toolChips.limited')}</span> : null}
          </button>
        )
      })}
      <Link
        to="/integrations"
        aria-label={t('toolChips.add')}
        title={t('toolChips.add')}
        className={cn(
          chipClass,
          'min-w-11 justify-center border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]',
        )}
      >
        <Plus className="size-4 shrink-0" aria-hidden />
      </Link>
    </div>
  )
}
