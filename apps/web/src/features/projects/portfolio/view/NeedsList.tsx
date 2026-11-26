import { Badge, Text, cn } from '@bellum/ui'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { needStage, splitNeedsByConfidence, splitPreviewNeeds, type AccountNeeds, type NeedItem } from '../model/needs'
import { maturityOfStage } from '../maturity-tabs'
import { accountPriority } from '../model/account-priority'
import { ComputedAt } from '@/components/primitives/ComputedAt'
import { StageBadge, UrgencyBadge, UrgencyDot } from './NeedBadges'

/**
 * Une carte par COMPTE : le commercial choisit qui appeler. Chaque carte montre
 * les 3 besoins les plus forts en clair (libellé entier, offre rattachée), le
 * reste se compte — le détail complet s'ouvre au clic.
 */
export function NeedsList({
  entries,
  onSelect,
  selectedAccountId,
}: {
  entries: AccountNeeds[]
  onSelect: (entry: AccountNeeds) => void
  selectedAccountId?: string
}) {
  return (
    <ul className="space-y-2">
      {entries.map(entry => (
        <li key={entry.accountId}>
          <NeedsRow entry={entry} selected={selectedAccountId === entry.accountId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  )
}

function NeedsRow({
  entry,
  onSelect,
  selected,
}: {
  entry: AccountNeeds
  onSelect: (entry: AccountNeeds) => void
  selected: boolean
}) {
  const { t } = useTranslation('projects')
  const { preview, remaining } = splitPreviewNeeds(entry)

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      aria-label={t('list.openDetailAria', { company: entry.companyName })}
      className={cn(
        'group w-full rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 text-left transition-colors',
        'hover:border-[color-mix(in_srgb,var(--bellum-primary-500)_35%,var(--bellum-border))] hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_3%,transparent)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]',
        selected && 'border-[var(--bellum-primary-500)]',
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <AccountIdentity entry={entry} />

        <div className="min-w-0 flex-1 space-y-2 md:border-l md:border-[var(--bellum-border)] md:pl-5">
          {preview.map(need => (
            <NeedLine key={need.id} need={need} />
          ))}

          {/* #1331 (6/7) — L'ACTION PRIORITAIRE, une par carte.

              « On voit des informations, mais on ne sait pas quoi faire. » La
              carte disait déjà tout ce qu'elle savait — trois besoins, une
              ventilation, un score — et laissait le tri à l'utilisateur. Cette
              ligne-ci fait le tri : elle nomme le geste, et le geste seulement.

              ⚠️ Elle ne remplace RIEN. Les trois besoins restent lisibles
              au-dessus : borner l'affichage n'est pas retirer l'accès, et une
              carte qui n'afficherait plus que son verdict obligerait à ouvrir le
              panneau pour savoir de quoi il parle. */}
          <PriorityLine entry={entry} />

          <div className="flex items-center gap-3 pt-0.5">
            {remaining > 0 ? (
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-accent)]">
                {t('list.moreNeeds', { count: remaining })}
              </Text>
            ) : null}
            <Text
              size="xs"
              className="ml-auto flex items-center gap-1 text-[var(--bellum-text-muted)] transition-colors group-hover:text-[var(--bellum-text-primary)]"
            >
              {t('list.openDetail')}
              <ChevronRight className="size-3.5" />
            </Text>
          </div>
        </div>
      </div>
    </button>
  )
}

function AccountIdentity({ entry }: { entry: AccountNeeds }) {
  const { t } = useTranslation('projects')

  return (
    <div className="flex min-w-0 shrink-0 items-start gap-3 md:w-64">
      <CompanyAvatar name={entry.companyName} size="sm" />
      <div className="min-w-0 space-y-1">
        <Text size="sm" weight="semibold" className="truncate">
          {entry.companyName}
        </Text>
        <Text size="xs" className="truncate text-[var(--bellum-text-muted)]">
          {entry.sector ?? t('list.sectorFallback')}
        </Text>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <UrgencyBadge urgency={entry.topUrgency} />
          <Text size="xs" className="tabular-nums text-[var(--bellum-text-secondary)]">
            {entry.score === null ? '—' : t('list.score', { score: entry.score.toFixed(1) })}
          </Text>
        </div>
        {/* Le décompte de la LISTE annonce la ventilation, comme le panneau de
            détail : « 11 opportunités détectées : 5 confirmées, 6 à qualifier ».
            Un total nu (« 11 besoins ») laissait croire à 11 faits sourcés alors
            qu'une partie sont des déductions — exactement ce que la restitution
            V2 §6 interdit (« un besoin inféré ne doit jamais être présenté comme
            un besoin confirmé »). */}
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('detail.countBreakdown', {
            count: entry.needs.length,
            ...splitNeedsByConfidence(entry.needs),
          })}
        </Text>
        {/* #1330 (4/7) — « dernière activité ou FRAÎCHEUR DES DONNÉES ».

            `updatedAt` voyageait déjà jusqu'ici (`AccountNeeds.updatedAt`,
            lu depuis `accounts.updated_at`) et aucune vue ne le rendait : le
            défaut n°1 du dépôt, vu par le bout de l'écran. Sans lui, onze
            opportunités analysées en mars se lisent exactement comme onze
            analysées hier.

            La primitive PARTAGÉE, pas un formateur de plus : elle refuse déjà
            l'heure de la requête, dit « inconnu » plutôt que « aujourd'hui », et
            passe par la langue de l'APPLICATION. Trois surfaces l'écrivaient à
            la main, dont une verrouillée en français. */}
        {entry.updatedAt ? <ComputedAt at={entry.updatedAt} /> : null}
      </div>
    </div>
  )
}

/** Un besoin lisible : deux lignes max, jamais coupé au milieu d'un mot. */
function NeedLine({ need }: { need: NeedItem }) {
  const { t } = useTranslation('projects')

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <UrgencyDot urgency={need.urgency} />
      <div className="min-w-0 flex-1">
        <Text size="sm" className="line-clamp-2 text-[var(--bellum-text-primary)]">
          {need.label}
        </Text>
        {/* La NATURE du besoin, sur la surface que le commercial lit en premier.
            Le panneau de détail la portait déjà (badge `kinds.*` + provenance) ;
            la liste, elle, rendait un « pain » sourcé et une « implication »
            déduite EXACTEMENT pareil.

            ⚠️ La mention « à qualifier » ne vise plus la seule `implication`.
            Depuis le 03/09, le décompte de l'entête et le geste prioritaire
            lisent la MÊME table que ces badges (`maturityOfStage`) : seul un
            besoin EXPRIMÉ est confirmé, tout le reste est à qualifier. La
            marquer sur `implication` seule laissait un `program` sans mention
            sous une phrase qui le comptait comme confirmé. */}
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {/* Le STADE d'abord : c'est lui qui dit ce qu'on a le droit d'affirmer.
              La nature reste derrière, en second plan — elle renseigne d'où
              vient l'entrée, pas ce qu'elle vaut. */}
          <StageBadge kind={need.kind} />
          {/* i18n keys: kinds.pain | kinds.challenge | kinds.program | kinds.implication */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t(`kinds.${need.kind}`)}
          </Text>
          {need.kind !== 'signal' && maturityOfStage(needStage(need.kind)) !== 'confirmed' ? (
            <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
              {t('list.toQualify')}
            </Text>
          ) : null}
        </div>
      </div>
      {need.offer ? (
        <Badge variant="outline" className="mt-px hidden max-w-[14rem] shrink-0 truncate lg:inline-flex">
          {need.offer}
        </Badge>
      ) : (
        <Text size="xs" noWrap className="mt-0.5 hidden shrink-0 text-[var(--bellum-text-muted)] lg:block">
          {t('list.noOffer')}
        </Text>
      )}
    </div>
  )
}

/**
 * La ligne d'action prioritaire — ce que la carte demande de faire.
 *
 * ⚠️ Le geste passe par `--bellum-text-accent` et jamais par une nuance FIXE de
 * la gamme primaire : `primary-500` fait 5,78:1 en clair et 2,68:1 en sombre, et
 * c'est exactement le défaut qui avait touché 149 endroits.
 *
 * L'offre manquante est en SECOND plan, sur la même ligne : c'est un autre axe
 * (ce que nous n'avons pas fait, pas ce que le client a montré), et lui donner
 * le même poids ferait deux gestes là où l'issue en demande un.
 */
function PriorityLine({ entry }: { entry: AccountNeeds }) {
  const { t } = useTranslation('projects')
  const priority = accountPriority(entry)
  if (!priority) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-accent)]">
        {/* i18n keys: priority.confirmed | priority.toQualify | priority.signal */}
        {t(`priority.${priority.kind}`, { count: priority.count })}
      </Text>
      {priority.unmatched ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('priority.unmatched')}
        </Text>
      ) : null}
    </div>
  )
}
