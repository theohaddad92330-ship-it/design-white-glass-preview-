import type { AnalysisVocabularyTerm } from '@bellum/contracts'
import { Badge, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text, cn } from '@bellum/ui'
import { BookMarked } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountVocabulary } from '@/features/accounts/hooks/useAccountVocabulary'
import { dropContradictedVocabularyText } from './vocabularyContradiction'

/** Badge tone per statut de vérité (7 statuts — mirrors the IA `truth_status`). */
const TRUTH_TONE: Record<string, string> = {
  fait: 'text-[var(--success-soft-text)] dark:text-[var(--success-soft-text)]',
  registre: 'text-[var(--success-soft-text)] dark:text-[var(--success-soft-text)]',
  signal: 'text-[var(--bellum-text-accent)]',
  hypothese: 'text-[var(--warning-soft-text)] dark:text-[var(--warning-soft-text)]',
  recommandation: 'text-[var(--bellum-text-accent)]',
  risque: 'text-[var(--danger-soft-text)] dark:text-[var(--danger-soft-text)]',
  inconnu: 'text-[var(--bellum-text-secondary)]',
}

const HEADER_KEYS = ['term', 'meaning', 'commercialWhy', 'source', 'truthStatus'] as const

/** Hostname shown for an http(s) provenance ref; non-URL refs render verbatim. */
function sourceHost(ref: string): string {
  try {
    return new URL(ref).hostname.replace(/^www\./, '')
  } catch {
    return ref
  }
}

/**
 * « Vocabulaire du groupe » (Théo P1 p.17/21) — the account's reading grid:
 * one row per term with sens / impact commercial / source / statut de vérité,
 * read from `GET /analysis/:accountId/vocabulary`. Hidden while empty (legacy
 * dossiers analysed before the grid existed store no rows).
 */
export const AccountVocabularySection = ({
  accountId,
  verifiedContactCount = 0,
}: {
  accountId: string
  /** #3709 — décompte réel des contacts vérifiés : une phrase du modèle qui dit « aucun contact vérifié » ne s'affiche pas s'il est > 0. */
  verifiedContactCount?: number
}) => {
  const { t } = useTranslation('accountDetail')
  const { data: rawTerms = [] } = useAccountVocabulary(accountId)
  const terms = rawTerms.map(term => dropContradictedVocabularyText(term, verifiedContactCount))
  if (terms.length === 0) return null

  return (
    <Card className="overflow-hidden p-0 [--card-spacing:0px]">
      <div className="border-b border-[var(--bellum-border)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <BookMarked className="size-4 text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)]" />
          <Text element="h3" size="base" weight="semibold">
            {t('vocabulary.title')}
          </Text>
          <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs font-medium">
            {t('vocabulary.termCount', { count: terms.length })}
          </Badge>
        </div>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('vocabulary.description')}
        </Text>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[var(--bellum-surface-1)]">
            <TableRow className="border-[var(--bellum-border)]">
              {HEADER_KEYS.map(key => (
                <TableHead key={key} className="h-11 px-4">
                  <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                    {/* i18n keys: vocabulary.headers.term | .meaning | .commercialWhy | .source | .truthStatus */}
                    {t(`vocabulary.headers.${key}`)}
                  </Text>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.map(term => (
              <VocabularyRow key={term.term} term={term} />
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

const VocabularyRow = ({ term }: { term: AnalysisVocabularyTerm }) => {
  const { t } = useTranslation('accountDetail')
  const status = term.truthStatus?.trim().toLowerCase() ?? ''
  const aliases = term.aliases?.filter(Boolean) ?? []
  return (
    <TableRow className="border-[var(--bellum-border)] align-top">
      <TableCell className="max-w-52 px-4 py-3">
        <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {term.term}
        </Text>
        <Badge variant="outline" className="mt-1 rounded-full px-2 py-0.5 text-xs font-medium">
          {/* i18n keys: vocabulary.kind.entity | .trap_noise | .internal_competitor | .program |
              .tool_erp | .acronym | .person | .angle — unknown kinds fall back to the raw value */}
          {t(`vocabulary.kind.${term.kind}`, { defaultValue: term.kind })}
        </Badge>
        {aliases.length > 0 && (
          <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('vocabulary.aliases', { value: aliases.join(', ') })}
          </Text>
        )}
      </TableCell>
      <TableCell className="min-w-44 px-4 py-3">
        <Text element="p" size="xs" className="whitespace-normal text-[var(--bellum-text-secondary)]">
          {term.meaning || '—'}
        </Text>
        {term.relatedEntity && (
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {term.relatedEntity}
          </Text>
        )}
      </TableCell>
      <TableCell className="min-w-44 px-4 py-3">
        <Text element="p" size="xs" className="whitespace-normal text-[var(--bellum-text-secondary)]">
          {term.commercialWhy || '—'}
        </Text>
      </TableCell>
      {/* Recette 21/10 D.5 — plus de max-w-40 ni de truncate : « périmètre : … » se lit en entier. */}
      <TableCell className="min-w-40 px-4 py-3">
        <SourceRefs refs={term.sourceRefs?.filter(Boolean) ?? []} />
      </TableCell>
      <TableCell className="px-4 py-3">
        {status ? (
          <Badge
            variant="outline"
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              TRUTH_TONE[status] ?? 'text-[var(--bellum-text-secondary)]',
            )}
          >
            {/* i18n keys: vocabulary.truth.fait | .registre | .signal | .hypothese |
                .recommandation | .risque | .inconnu — unknown statuses fall back to the raw value */}
            {t(`vocabulary.truth.${status}`, { defaultValue: status })}
          </Badge>
        ) : (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            —
          </Text>
        )}
      </TableCell>
    </TableRow>
  )
}

/** Provenance refs: first ref (linked when it is a URL) + a `+N` overflow hint.
 *  No ref = an honest dash — never an invented source. */
const SourceRefs = ({ refs }: { refs: string[] }) => {
  if (refs.length === 0) {
    return (
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        —
      </Text>
    )
  }
  const [first, ...rest] = refs
  const isUrl = /^https?:\/\//i.test(first)
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      {isUrl ? (
        <a
          href={first}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 break-words text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline dark:text-[var(--bellum-text-accent)]"
          title={first}
        >
          {sourceHost(first)}
        </a>
      ) : (
        <Text
          element="span"
          size="xs"
          className="min-w-0 whitespace-normal break-words text-[var(--bellum-text-secondary)]"
          title={first}
        >
          {first}
        </Text>
      )}
      {rest.length > 0 && (
        <Text element="span" size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
          +{rest.length}
        </Text>
      )}
    </div>
  )
}
