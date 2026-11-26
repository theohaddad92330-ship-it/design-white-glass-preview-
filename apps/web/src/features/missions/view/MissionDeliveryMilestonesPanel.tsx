import { useState } from 'react'
import { Badge, Box, Button, Card, Input, Text } from '@bellum/ui'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  suggestMissionReinjectionFromMilestone,
  type DeclaredMissionDeliveryMilestoneKind,
  type MissionDeliveryMilestoneStatus,
} from '@bellum/contracts'
import { formatDate } from '@/lib/locale'
import { useDeclareMissionDeliveryMilestone, useMissionDeliveryMilestones } from '../api'

/** Un jalon pas commencé dont l'API projette déjà un fait (jamais une note vide). */
function hasProjection(item: MissionDeliveryMilestoneStatus): boolean {
  return item.state === 'not_started' && item.mode === 'projected' && Boolean(item.note)
}

const STATE_VARIANT = {
  done: 'success',
  in_progress: 'warning',
  not_started: 'outline',
  not_evaluable: 'outline',
  lead_known: 'info',
} as const

/**
 * #3269 (BEL-SC-240) / #3291 (reste) — L'APPELANT de `GET .../delivery-milestones`.
 *
 * `GET/POST /delivery/missions/:id/delivery-milestones` existaient déjà
 * (catalogue de dix-sept jalons, six déclarables, onze projetés depuis leur
 * maison canonique) sans aucun écran pour les lire ni les déclarer —
 * exactement le défaut que la doctrine du dépôt nomme : « du code juste,
 * calculé, testé, que personne n'appelle ».
 *
 * Chaque jalon porte déjà son libellé bilingue (`labelFr`/`labelEn`, le
 * catalogue lui-même) — jamais un second dictionnaire i18n à dix-sept clés
 * qui dérive du premier.
 */
export function MissionDeliveryMilestonesPanel({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data } = useMissionDeliveryMilestones(missionId)
  if (!data || data.length === 0) return null
  // #3291 (recette prod 01/10) — dix-sept pastilles empilées dont quatorze
  // « Pas commencé » faisaient un mur. Ce qui a un état (fait, en cours, non
  // évaluable — ce dernier reste NOMMÉ, doctrine) se lit en liste ; les jalons
  // pas commencés se replient sous un seul compte, ils ne disparaissent pas.
  // #3413 (recette 02/10) — un jalon « pas commencé » qui AFFICHE une projection
  // (ex. les entités connues du client) n'est pas « pas commencé » : il porte une
  // piste. Il sort du repli et son badge le dit ; sinon l'écran se contredit.
  const active = data.filter(item => item.state !== 'not_started' || hasProjection(item))
  const notStarted = data.filter(item => item.state === 'not_started' && !hasProjection(item))

  return (
    <Card data-slot="dossier-milestones" className="rounded-2xl p-5 md:p-6" aria-label={t('deliveryMilestones.title')}>
      <Text element="h2" size="base" weight="semibold">
        {t('deliveryMilestones.title')}
      </Text>
      {active.length > 0 ? <MilestoneList missionId={missionId} items={active} /> : null}
      {notStarted.length > 0 ? (
        <details
          className="mt-3 w-full min-w-0 rounded-md border border-border/60 p-2"
          data-testid="delivery-milestones-not-started"
        >
          <summary className="cursor-pointer pointer-coarse:min-h-11">
            <Text element="span" size="sm" weight="medium">
              {t('deliveryMilestones.notStartedGroup', { count: notStarted.length })}
            </Text>
          </summary>
          <MilestoneList missionId={missionId} items={notStarted} />
        </details>
      ) : null}
    </Card>
  )
}

/** Pleine largeur du panneau (liste, règle D81) : libellé | état | détail, colonnes alignées. */
const ROW_GRID =
  'grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]'

function MilestoneList({ missionId, items }: { missionId: string; items: MissionDeliveryMilestoneStatus[] }) {
  return (
    <ul className="mt-2 flex w-full min-w-0 list-none flex-col divide-y divide-border/60 p-0">
      {items.map(item => (
        <MilestoneRow key={item.key} missionId={missionId} item={item} />
      ))}
    </ul>
  )
}

function MilestoneRow({ missionId, item }: { missionId: string; item: MissionDeliveryMilestoneStatus }) {
  const { t, i18n } = useTranslation('missions')
  const declare = useDeclareMissionDeliveryMilestone(missionId)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const french = i18n.language.startsWith('fr')
  const label = french ? item.labelFr : item.labelEn

  return (
    <li data-testid={`delivery-milestone-${item.key}`} className={`${ROW_GRID} py-3`}>
      {/* Théo .milestone — une case cochée quand le jalon est franchi, vide sinon. */}
      <span
        aria-hidden
        className={`mt-0.5 flex size-6 items-center justify-center rounded-badge border ${
          item.state === 'done'
            ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]'
            : 'border-border'
        }`}
      >
        {item.state === 'done' ? <Check className="size-3.5" /> : null}
      </span>
      <Box className="min-w-0 space-y-1">
        <Text size="sm" weight="medium">
          {label}
        </Text>
        <Badge variant={hasProjection(item) ? 'secondary' : STATE_VARIANT[item.state]}>
          {t(hasProjection(item) ? 'deliveryMilestones.state.projected' : `deliveryMilestones.state.${item.state}`)}
        </Badge>
      </Box>
      <Box className="col-start-2 flex min-w-0 flex-col gap-1 sm:col-start-auto sm:items-end">
        {item.note ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {item.confirmedAt
              ? t('deliveryMilestones.confirmedOn', { date: formatDate(item.confirmedAt), note: item.note })
              : item.note}
          </Text>
        ) : null}
        {item.mode === 'declared' && item.state === 'done' && item.note ? (
          <ReinjectionHint milestoneKey={item.key as DeclaredMissionDeliveryMilestoneKind} note={item.note} />
        ) : null}
        {/* Un jalon PROJETÉ se lit depuis sa maison canonique, il ne se déclare
            jamais ici — un second bouton créerait une seconde écriture pour le
            même fait. Un jalon DÉCLARÉ déjà `done` n'a pas de retrait : l'API
            ne porte aucune route de retrait (contrairement à la checklist de
            sortie), aucun bouton ne doit le laisser croire. */}
        {item.mode === 'declared' && item.state !== 'done' && !editing ? (
          <Box>
            <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setEditing(true)}>
              {t('deliveryMilestones.declare')}
            </Button>
          </Box>
        ) : null}
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={event => {
              event.preventDefault()
              const trimmed = note.trim()
              if (trimmed.length < 3) return
              declare.mutate({ key: item.key as DeclaredMissionDeliveryMilestoneKind, note: trimmed })
              setEditing(false)
              setNote('')
            }}
          >
            <Input
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder={t('deliveryMilestones.notePlaceholder')}
              aria-label={t('deliveryMilestones.noteLabel')}
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={note.trim().length < 3 || declare.isPending}
            >
              {t('deliveryMilestones.save')}
            </Button>
          </form>
        ) : null}
      </Box>
    </li>
  )
}

/**
 * #3269.3/#3269.4 (suite #3291) — « tranché sans Louis » : la qualification
 * se propose automatiquement dès que le jalon est confirmé (pas seulement
 * sur demande explicite). Fonction PURE (`suggestMissionReinjectionFromMilestone`)
 * : ce composant ne fait QUE nommer la boucle, jamais de bouton qui écrirait
 * un signal ou une action — cette écriture n'a pas encore de porte pour un
 * jalon de delivery (`declared-signal.ts` n'admet que la source LinkedIn ;
 * un lien mort serait pire qu'un texte, même principe que `next-action.ts`).
 */
function ReinjectionHint({ milestoneKey, note }: { milestoneKey: DeclaredMissionDeliveryMilestoneKind; note: string }) {
  const { t } = useTranslation('missions')
  const suggestion = suggestMissionReinjectionFromMilestone({ key: milestoneKey, note })
  return (
    <Text size="xs" className="text-[var(--bellum-text-muted)] italic">
      {t(`deliveryMilestones.reinjection.${suggestion.loopKey}`)}
    </Text>
  )
}
