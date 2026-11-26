import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Map as MapIcon } from 'lucide-react'
import { Badge, Text } from '@bellum/ui'
import { appRouteTarget } from '@/components/navigation/known-routes'
import { renderInlineMarkdown } from '../markdown'
import { useReplyFollowUp } from '../reply-follow-up'
import { ReplyCardGrid, ReplyCautionBanner, ReplySummaryPanel, ReplyTags } from '../reply-kit'
import { AccountLogo } from './AccountLogo'
import {
  CardLink,
  InlineLabel,
  ItemName,
  LabeledLines,
  NotEvaluated,
  ReplyCard,
  SourceBadge,
  TopThenRest,
  type BlockOf,
} from './ReplyCard'

type AccountMap = BlockOf<'account_map'>
type MapAccount = NonNullable<AccountMap['accounts']>[number]
type MapAction = NonNullable<NonNullable<AccountMap['actions']>['validate']>

// Les quatre statuts et les trois niveaux de complétude ne se distinguent PAS
// que par la couleur : leur libellé (écrit par Laura, dans la langue de la
// réponse) reste dans le badge — AA clair/sombre par les variantes de `Badge`.
const STATUS_VARIANT = {
  priority: 'primary',
  to_qualify: 'outline',
  watch: 'warning',
  to_document: 'secondary',
} as const
const COMPLETENESS_VARIANT = { complete: 'success', partial: 'warning', sparse: 'outline' } as const

const CONTEXT_KEYS = ['territory', 'sector', 'size', 'filter'] as const
const COMPLETENESS_KEYS = ['complete', 'partial', 'sparse'] as const

/** Le libellé est-il une clé technique brute (casse et blancs ignorés, ou vide) ? Rend la clé, sinon `null`. */
function technicalKey<K extends string>(label: string | undefined, keys: readonly K[]): K | null {
  const normalized = (label ?? '').trim().toLowerCase()
  return keys.find(key => key === normalized) ?? null
}

/** Les cartes montrées d'emblée ; la suite se déplie (un seul geste, 44 px au doigt). */
const GRID_SHOWN = 6

/**
 * #3762 (BEL-LAU-1005) — LA CARTOGRAPHIE DE COMPTES : UN SQUELETTE, TOUJOURS.
 *
 * En-tête (titre, badge de complétude, chips de contexte) → cadrage (d'où vient
 * la sélection, ce qu'elle prouve, ce qu'elle NE prouve PAS) → synthèse → grille
 * de cartes homogènes (raison, prudence, prochaine action sur CHAQUE carte) →
 * blocs secondaires, visiblement secondaires → actions finales.
 *
 * Référence visuelle : `AccountCard.tsx` (logo + nom + lignes étiquetées dans un
 * `ReplyCard`) et `AccountVolumeSprintCard.tsx` (sous-cartes à bordure fine).
 * Aucune pièce neuve : `ReplyCard`, `InlineLabel`, `LabeledLines`, `Badge`.
 *
 * #3758.2 (BEL-LAU-1001) — la lecture en GROUPES du même bloc (intégration
 * 06/10 : un schéma, un composant) : un groupe = un titre + ses comptes (top 3
 * puis « Voir les autres ») ; la couverture est TOUJOURS écrite, et une carte
 * qui déclare ce qu'elle ne couvre pas porte le badge « partielle ». Aucun rang.
 *
 * DOCTRINE. Une absence ne fait AUCUNE ligne (tags, lien objet, blocs
 * secondaires absents : rien ne s'affiche) ; la complétude est un niveau, jamais
 * un pourcentage ; les comptes sont ceux que le contrat a validés, rien n'est
 * complété ici.
 */
export function AccountMapCard({ block }: { block: AccountMap }) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const accounts = block.accounts ?? []
  const hidden = accounts.length - GRID_SHOWN
  const shown = open || hidden <= 0 ? accounts : accounts.slice(0, GRID_SHOWN)
  const partial = Boolean(block.not_covered?.length)
  const hasSecondary = Boolean(block.memory?.length || block.to_document?.length || block.method_limit)
  const actions = [block.actions?.validate, block.actions?.discover, block.actions?.enrich, block.actions?.save].filter(
    (action): action is MapAction => Boolean(action),
  )

  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.account_map')} icon={MapIcon}>
      <div className="flex flex-wrap items-center gap-1.5">
        {block.completeness ? (
          <Badge
            variant={COMPLETENESS_VARIANT[block.completeness.level]}
            data-map-completeness={block.completeness.level}
          >
            {technicalKey(block.completeness.label, COMPLETENESS_KEYS)
              ? t(`blocks.mapCompleteness.${block.completeness.level}`)
              : block.completeness.label}
          </Badge>
        ) : null}
        {partial ? <Badge variant="outline">{t('blocks.mapPartial')}</Badge> : null}
        <SourceBadge source={block.source} />
        {block.context?.map((chip, index) => (
          <Badge key={`chip-${index}`} variant="outline" data-map-context={chip.kind}>
            {/* #3759 / #5013.3 — le modèle recopie parfois le nom brut du contrat (le genre de la puce, un AUTRE genre,
                un niveau) à la place du libellé ; on l'écrit dans la langue de l'interface, jamais la clé. */}
            {(() => {
              const raw = technicalKey(chip.label, CONTEXT_KEYS)
              return raw ? t(`blocks.mapContextKind.${raw}`) : chip.label
            })()}
          </Badge>
        ))}
      </div>

      {block.framing ? (
        <div className="space-y-1" data-map-section="framing">
          <InlineLabel label={t('blocks.mapOrigin')}>{renderInlineMarkdown(block.framing.origin)}</InlineLabel>
          <InlineLabel label={t('blocks.mapProves')}>{renderInlineMarkdown(block.framing.proves)}</InlineLabel>
          <InlineLabel label={t('blocks.mapNotProven')}>{renderInlineMarkdown(block.framing.not_proven)}</InlineLabel>
        </div>
      ) : null}

      {block.summary ? (
        <div className="space-y-2" data-map-section="summary">
          {/* #3761.4 / .7 — la synthèse est le panneau de synthèse, la réserve le bandeau de prudence de la bibliothèque. */}
          <ReplySummaryPanel>
            <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {t('blocks.mapRetained', { count: block.summary.retained_count })} ·{' '}
              {renderInlineMarkdown(block.summary.qualification)}
            </Text>
          </ReplySummaryPanel>
          {block.summary.main_reserve ? (
            <ReplyCautionBanner title={t('blocks.mapReserveTitle')}>
              {renderInlineMarkdown(block.summary.main_reserve)}
            </ReplyCautionBanner>
          ) : null}
        </div>
      ) : null}

      {block.coverage ? (
        <InlineLabel label={t('blocks.coverage')}>{renderInlineMarkdown(block.coverage)}</InlineLabel>
      ) : null}
      {block.groups?.map((group, groupIndex) => (
        <div key={`group-${groupIndex}`} className="space-y-1" data-map-section="group">
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {group.label} · {group.items.length}
          </Text>
          <TopThenRest
            items={group.items}
            renderItem={item => (
              <div className="space-y-0.5">
                <ItemName name={item.name} href={item.href} />
                {item.detail ? (
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {renderInlineMarkdown(item.detail)}
                  </Text>
                ) : null}
              </div>
            )}
          />
        </div>
      ))}
      <NotEvaluated items={block.not_covered} />

      {shown.length ? (
        <div data-map-section="grid">
          {/* #3761.5 — la grille de cartes de la bibliothèque (1 colonne en compact, 2 au-delà). */}
          <ReplyCardGrid asList>
            {shown.map((account, index) => (
              <li key={`account-${index}`} className="min-w-0">
                <MapAccountCard account={account} />
              </li>
            ))}
          </ReplyCardGrid>
        </div>
      ) : null}
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className="text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          {open ? t('blocks.showLess') : t('blocks.showMore', { count: hidden })}
        </button>
      ) : null}

      {hasSecondary ? (
        <div
          className="space-y-2 rounded-md bg-[var(--bellum-surface-1)] p-2 text-[var(--bellum-text-secondary)]"
          data-map-section="secondary"
        >
          <LabeledLines label={t('blocks.mapMemory')} lines={block.memory} />
          <LabeledLines label={t('blocks.missing')} lines={block.to_document} />
          {block.method_limit ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('blocks.mapMethodLimit')} {renderInlineMarkdown(block.method_limit)}
            </Text>
          ) : null}
        </div>
      ) : null}

      {actions.length ? (
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--bellum-border)] pt-2"
          data-map-section="actions"
        >
          {actions.map((action, index) => (
            <MapAction key={`action-${index}`} action={action} />
          ))}
        </div>
      ) : null}
    </ReplyCard>
  )
}

function MapAccountCard({ account }: { account: MapAccount }) {
  const { t } = useTranslation('chat')
  return (
    <div className="flex h-full min-w-0 items-start gap-2 rounded-md border border-[var(--bellum-border)] p-2">
      <AccountLogo name={account.name} href={account.href} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <ItemName name={account.name} href={account.href} />
          <Badge variant={STATUS_VARIANT[account.status.level]} data-map-status={account.status.level}>
            {account.status.label}
          </Badge>
        </div>
        <Text size="sm" color="text-[var(--bellum-text-primary)]">
          {renderInlineMarkdown(account.proof)}
        </Text>
        {/* #3761.11 — les tags métiers de la bibliothèque ; un compte sans tag n'a aucune ligne. */}
        <ReplyTags tags={account.tags ?? []} ariaLabel={t('blocks.mapTags')} />
        <InlineLabel label={t('blocks.mapCaution')}>{renderInlineMarkdown(account.caution)}</InlineLabel>
        <InlineLabel label={t('blocks.nextAction')}>
          <CardLink href={account.next_action.href}>{account.next_action.label}</CardLink>
        </InlineLabel>
      </div>
    </div>
  )
}

/**
 * Un lien vers un écran réel quand l'action en porte un ; sinon une SUITE de la
 * conversation (envoyer le libellé, Laura prépare) ; sans fil actif, le libellé.
 */
function MapAction({ action }: { action: MapAction }) {
  const followUp = useReplyFollowUp()
  const text = <span className="text-sm font-medium">{action.label}</span>
  if (action.href && appRouteTarget(action.href)) {
    return (
      <span className="text-sm font-medium">
        <CardLink href={action.href}>{action.label}</CardLink>
      </span>
    )
  }
  if (!followUp) return text
  return (
    <button
      type="button"
      onClick={() => followUp(action.label)}
      className="text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
    >
      {action.label}
    </button>
  )
}
