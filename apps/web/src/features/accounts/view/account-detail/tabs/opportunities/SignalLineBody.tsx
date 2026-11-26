import type { AccountSignalLine, SignalLineType } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LineNature } from '@/features/accounts/model/lineNature'
import { formatCount, formatDate, formatMonth } from '@/lib/locale'
import { LineNatureBadge } from './LineNatureBadge'
import { Highlighted } from '@/features/signals-library/view/Highlighted'
import type { ParsedSearch } from '@/features/signals-library/model/signal-search'

/**
 * Lot 767 — LA LIGNE RICHE d'un fait daté, UN seul rendu (GA-26) : l'onglet « Signaux et besoins » d'un compte ET
 * le dépli de Signaux › Historique l'utilisent. Titre sur deux lignes (texte complet accessible), « <type> · <date> »,
 * détail / implication commerciale, compétences, TJM, prescripteur, lien « voir l'offre », issue d'une affaire,
 * lignes regroupées. Les sources ne se nomment pas : le lien reste, le domaine ne s'écrit jamais — EXCEPTION
 * (Louis 01/11/2026, #5010.1) : le SITE D'EMPLOI PUBLIC d'une offre (`origin`, liste fermée) se nomme.
 */

/**
 * Rendu COMPACT, zone de clic de 44 px (GA-35) : le bouton fait 32 px, son pseudo-élément déborde de 6 px en haut
 * et en bas — la cible cliquable atteint 44 px sans grossir la carte.
 */
export const TYPE_TEXT = 'text-[var(--accent-soft-text)]'
export const TYPE_DOT = 'bg-[var(--accent-soft-text)]'

export const COMPACT_44 =
  "relative h-8 min-h-8 px-3 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"

/** Le libellé du lien d'une ligne : ce qu'on va lire, jamais qui l'a trouvé. */
function linkKey(type: SignalLineType): 'offer' | 'notice' | 'read' {
  if (type === 'recrutement') return 'offer'
  if (type === 'marche_public' || type === 'annonce_legale') return 'notice'
  return 'read'
}

/** Lot 773 — la source d'une ligne en mot générique ; un besoin d'une AUTRE entité du groupe dit « Base commune · <entité> ». */
export function lineSourceLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  line: Pick<AccountSignalLine, 'origin_kind' | 'origin' | 'entity'> & { type?: AccountSignalLine['type'] },
): string {
  // Lot 775 — une mission observée vient de la mémoire marché : source générique, jamais un fournisseur.
  if (line.type === 'mission_observee') {
    return line.entity ? t('signalTable.missionSourceEntity', { entity: line.entity }) : t('signalTable.missionSource')
  }
  const kind = line.entity
    ? t('signalTable.sharedBase', { entity: line.entity })
    : t(`signalTable.origin.${line.origin_kind ?? 'analyse'}`)
  // #5010.1 — le site d'emploi public d'origine se nomme quand l'hôte est connu (jamais le fournisseur).
  return line.origin ? `${kind} · ${line.origin}` : kind
}

export function lineDateLabel(line: Pick<AccountSignalLine, 'date' | 'date_precision' | 'period'>): string {
  if (line.date_precision === 'year') return line.date.slice(0, 4)
  // En historique, et quand la source ne porte que le mois, la date se lit AU MOIS.
  if (line.date_precision === 'month' || line.period === 'past') return formatMonth(line.date.slice(0, 7)) ?? line.date
  return formatDate(line.date, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) ?? line.date
}

/** Au-delà, un titre est coupé à deux lignes : « Tout lire » le déplie (le texte complet reste en `title`). */
const TITLE_CLAMP_CHARS = 110

export function SignalLineBody({
  line,
  showPrescriber = false,
  nature,
  highlight = null,
  detailOnly = false,
  mergedOpen = false,
}: {
  line: AccountSignalLine
  showPrescriber?: boolean
  /** Lot 773 — le DÉPLI d'une ligne compacte : l'intitulé et « <source> · <date> » sont déjà dans l'en-tête de la ligne. */
  detailOnly?: boolean
  /** #5191 — la modale de détail montre d'emblée les lignes regroupées. */
  mergedOpen?: boolean
  /** #5004.1 — la nature en badge ; absente (Historique de l'espace) = pas de badge. */
  nature?: LineNature | null
  /** Lot 768 — la recherche de Signaux › Historique : ses mots sont surlignés dans le titre et le détail. */
  highlight?: ParsedSearch | null
}) {
  const { t } = useTranslation('projects')
  const [open, setOpen] = useState(mergedOpen)
  const [titleOpen, setTitleOpen] = useState(false)
  const merged = line.merged ?? []
  const prescriber = showPrescriber
    ? [line.people_hints.names[0], line.people_hints.roles[0]].filter(Boolean).join(', ')
    : ''
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {detailOnly ? null : (
          <Text
            size="sm"
            weight="semibold"
            title={line.title}
            data-testid="signal-title"
            className={`min-w-0 break-words ${titleOpen ? '' : 'line-clamp-2'}`}
          >
            <Highlighted text={line.title} search={highlight} />
          </Text>
        )}
        {!detailOnly && nature !== undefined ? <LineNatureBadge nature={nature} /> : null}
        {line.period === 'past' && line.outcome ? (
          <span
            data-testid="signal-outcome"
            className="rounded-full border border-[var(--bellum-border)] px-2 text-xs text-[var(--bellum-text-secondary)]"
          >
            {t(`signalTable.outcome.${line.outcome}`)}
          </span>
        ) : null}
      </div>
      {!detailOnly && line.title.length > TITLE_CLAMP_CHARS ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={titleOpen}
          className={`${COMPACT_44} self-start px-1 text-xs`}
          onClick={() => setTitleOpen(value => !value)}
        >
          {titleOpen ? t('signalTable.titleLess') : t('signalTable.titleMore')}
        </Button>
      ) : null}
      {detailOnly ? null : (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="signal-meta">
          {lineSourceLabel(t, line)} · {lineDateLabel(line)}
        </Text>
      )}
      {/* Une ligne sans détail ni lien n'a pas de sous-ligne : rien à dire, rien d'écrit. */}
      {line.detail || line.technologies?.length || line.url || line.tjm_eur ? (
        <LineDetail line={line} highlight={highlight} />
      ) : null}
      {merged.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={open}
            className="min-h-11 self-start px-1"
            icon={open ? ChevronDown : ChevronRight}
            onClick={() => setOpen(value => !value)}
          >
            {t('signalTable.merged', { count: merged.length })}
          </Button>
          {open ? (
            <ul className="flex flex-col gap-1 pl-4">
              {merged.map(row => (
                <li key={`${row.title}-${row.date}`} className="text-xs text-[var(--bellum-text-secondary)]">
                  {row.title}
                  {row.location ? ` · ${row.location}` : ''} ·{' '}
                  {lineDateLabel({ date: row.date, date_precision: 'day', period: line.period })}
                  {row.origin ? ` · ${row.origin}` : ''}
                  {row.url ? (
                    <>
                      {' · '}
                      <a href={row.url} target="_blank" rel="noreferrer" className="underline">
                        {t(`signalTable.link.${linkKey(line.type)}`)}
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {showPrescriber && prescriber ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="signal-prescriber">
          {t('signalTable.prescriber', { who: prescriber })}
        </Text>
      ) : null}
    </>
  )
}

function LineDetail({ line, highlight }: { line: AccountSignalLine; highlight: ParsedSearch | null }) {
  const { t } = useTranslation('projects')
  const technologies = (line.technologies ?? []).slice(0, 6)
  return (
    <div className="flex flex-col gap-1">
      {line.detail ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="break-words">
          <Highlighted text={line.detail} search={highlight} />
        </Text>
      ) : null}
      {technologies.length > 0 || line.tjm_eur ? (
        <div className="flex flex-wrap items-center gap-1">
          {technologies.length > 0 ? (
            <ul data-testid="signal-skills" className="flex flex-wrap gap-1">
              {technologies.map(skill => (
                <li
                  key={skill}
                  className="rounded-full border border-[var(--bellum-border)] px-2 text-xs text-[var(--bellum-text-secondary)]"
                >
                  <Highlighted text={skill} search={highlight} />
                </li>
              ))}
            </ul>
          ) : null}
          {line.tjm_eur ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="signal-tjm">
              {t('signalTable.tjm', { amount: formatCount(line.tjm_eur) })}
            </Text>
          ) : null}
        </div>
      ) : null}
      {line.url ? (
        <a
          href={line.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-xs underline"
        >
          {t(`signalTable.link.${linkKey(line.type)}`)}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  )
}
