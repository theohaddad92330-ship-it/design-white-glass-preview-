import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import type { FirstAnalysisSuggestion } from '@bellum/contracts'
import { Button, FieldText, Text, cn, EASE } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, ChevronRight } from 'lucide-react'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { firstAnalysisSuggestionId } from '../lib/firstAnalysisSuggestion'

const FADE_MASK = 'linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)'

type Variant = 'card' | 'compact' | 'pills' | 'table'

type Props = {
  suggestions: FirstAnalysisSuggestion[]
  variant?: Variant
  /** Override the default behavior (navigate to /search?company=...).
   *  Use this when the pill should fill an existing form in place. */
  onPick?: (suggestion: FirstAnalysisSuggestion) => void
}

export function FirstAnalysisSuggestionsGrid({ suggestions, variant = 'card', onPick }: Props) {
  const navigate = useNavigate()
  if (suggestions.length === 0) return null

  const handlePick = (suggestion: FirstAnalysisSuggestion) => {
    if (onPick) {
      onPick(suggestion)
      return
    }
    // Propagation suggestion → analyse (Théo P0 §5) : on ouvre /search en
    // pré-remplissant un brouillon ÉDITABLE (company) et en traçant l'origine
    // (suggestionId + suggestionReason). Cliquer « Société Générale » ouvre bien
    // une analyse Société Générale — jamais BNP, jamais générique — tout en
    // laissant l'utilisateur amender société / périmètre / contexte avant submit.
    navigate({
      to: '/search',
      search: {
        company: suggestion.companyName,
        suggestionId: firstAnalysisSuggestionId(suggestion),
        suggestionReason: suggestion.reason,
      },
    })
  }

  if (variant === 'pills') {
    return (
      <ul className="flex flex-wrap justify-center gap-2">
        {suggestions.map(suggestion => (
          <li key={`${suggestion.companyName}-${suggestion.sector}`}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handlePick(suggestion)}
              icon={<Building2 className="h-4 w-4 text-[var(--bellum-text-primary)]" />}
              className="group inline-flex h-8 items-center gap-2 rounded-full border border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-surface-1)_72%,transparent)] px-3.5 py-2 transition-[background-color,border-color,transform] duration-150 ease-out hover:border-[var(--border-active)] hover:bg-[var(--bellum-surface-1)] active:scale-[0.98]"
            >
              <Text element="span" size="sm" className="truncate text-[var(--bellum-text-primary)]">
                <FieldText value={suggestion.companyName} />
              </Text>
            </Button>
          </li>
        ))}
      </ul>
    )
  }

  if (variant === 'table') {
    return <TableVariant suggestions={suggestions} onPick={handlePick} />
  }

  if (variant === 'compact') {
    return (
      <ul className="grid w-full grid-cols-1 gap-3 ">
        {suggestions.map(suggestion => (
          <li key={`${suggestion.companyName}-${suggestion.sector}`}>
            <button
              type="button"
              onClick={() => handlePick(suggestion)}
              className="group flex w-full items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bellum-surface-1)] p-3 text-left transition-colors hover:border-[var(--border-active)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--bg-glass)]">
                <Building2 className="h-5 w-5 text-[var(--bellum-text-primary)]" />
              </span>
              <div className="min-w-0 flex-1">
                <Text element="p" size="sm" weight="semibold" className="truncate text-[var(--bellum-text-primary)]">
                  <FieldText value={suggestion.companyName} />
                </Text>
                <Text element="p" size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                  <FieldText value={suggestion.sector} />
                </Text>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--bellum-text-muted)] transition-colors group-hover:text-[var(--bellum-text-accent)] dark:group-hover:text-[var(--bellum-text-accent)]" />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return <CardVariant suggestions={suggestions} onPick={handlePick} />
}

function CardVariant({
  suggestions,
  onPick,
}: {
  suggestions: FirstAnalysisSuggestion[]
  onPick: (s: FirstAnalysisSuggestion) => void
}) {
  const { t } = useTranslation('profile')
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border-active)] bg-[var(--bg-glass)] p-6 backdrop-blur-sm">
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
        >
          {t('context.suggestions.title')}
          <ChevronRight className={cn('h-3 w-3 transition-transform duration-300', open ? 'rotate-90' : '')} />
        </button>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('context.suggestions.subtitle')}
        </Text>
      </div>
      <motion.div
        initial={false}
        animate={{ maxHeight: open ? 1600 : 96, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE.out }}
        className="overflow-hidden"
        style={{
          WebkitMaskImage: open ? 'none' : FADE_MASK,
          maskImage: open ? 'none' : FADE_MASK,
        }}
      >
        <ul className="space-y-3">
          {suggestions.map(suggestion => (
            <li key={`${suggestion.companyName}-${suggestion.sector}`} id={`suggestion-${suggestion.companyName}`}>
              <button
                type="button"
                onClick={() => onPick(suggestion)}
                className="group flex w-full items-center justify-between gap-4 rounded-lg p-3 text-left transition-colors hover:bg-[var(--bg-glass)]"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <Text element="span" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                      <FieldText value={suggestion.companyName} />
                    </Text>
                    <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                      · <FieldText value={suggestion.sector} />
                    </Text>
                  </div>
                  <Text element="p" size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                    <FieldText value={suggestion.reason} />
                  </Text>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 self-center text-[var(--bellum-text-muted)] transition-colors group-hover:text-[var(--bellum-text-accent)] dark:group-hover:text-[var(--bellum-text-accent)]" />
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  )
}

/**
 * Maquette validée `ouverture.html#premier-suggestions` — les comptes proposés
 * dans le tableau COMMUN (`ResponsiveTable`, cartes sous 768 px) : Compte ·
 * Secteur visé · Pourquoi · Analyser. Même geste que les autres variantes.
 */
function TableVariant({
  suggestions,
  onPick,
}: {
  suggestions: FirstAnalysisSuggestion[]
  onPick: (s: FirstAnalysisSuggestion) => void
}) {
  const { t } = useTranslation('profile')
  return (
    <ResponsiveTable
      rows={suggestions}
      rowKey={suggestion => `${suggestion.companyName}-${suggestion.sector}`}
      columns={[
        {
          key: 'account',
          header: t('context.suggestions.columns.account'),
          mobile: 'title',
          render: suggestion => (
            <span className="font-semibold">
              <FieldText value={suggestion.companyName} />
            </span>
          ),
        },
        {
          key: 'sector',
          header: t('context.suggestions.columns.sector'),
          mobile: 'meta',
          render: suggestion => <FieldText value={suggestion.sector} />,
        },
        {
          key: 'reason',
          header: t('context.suggestions.columns.reason'),
          render: suggestion => (
            <span className="text-[var(--bellum-text-secondary)]">
              <FieldText value={suggestion.reason} />
            </span>
          ),
        },
        {
          key: 'action',
          header: t('context.suggestions.columns.action'),
          className: 'w-px text-right',
          render: suggestion => (
            <Button type="button" variant="outline" size="sm" onClick={() => onPick(suggestion)}>
              {t('context.suggestions.analyze')}
            </Button>
          ),
        },
      ]}
    />
  )
}
