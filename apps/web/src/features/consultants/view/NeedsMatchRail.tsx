import { Badge, Button, Card, Text } from '@bellum/ui'
import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConsultantMatch } from '@bellum/contracts'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { TransparencyBanner } from '@/features/matching/view/TransparencyBanner'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useConsultantMatch } from '../hooks'
import { talentNameText } from '../lib/talentName'

/** Combien de besoins ouverts le rail montre — la maquette en montre deux. */
const RAIL_NEED_LIMIT = 3
/** Combien de profils par besoin — la maquette en montre deux. */
const TALENTS_PER_NEED = 2

/**
 * Le rail « Matching suggéré », groupé par BESOIN (écran Vivier, PDF-22 §01,
 * « à garder »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL S'AJOUTE, ET NE REMPLACE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * `ConsultantMatchPanel` fait l'INVERSE : un `<select>` où l'utilisateur
 * choisit UN besoin, puis lit son classement complet, sa boucle de feedback
 * (retenu/refusé) et génère un CV réécrit. Ce rail-ci ne duplique AUCUNE de
 * ces capacités — il ne fait qu'annoncer, pour plusieurs besoins ouverts À LA
 * FOIS, qui sont les meilleurs profils, avec un lien qui SÉLECTIONNE ce besoin
 * dans le panneau existant : `onOpenInPanel` appelle le MÊME état que le
 * `<select>` de `ConsultantMatchPanel`, jamais un second moteur.
 *
 * Chaque groupe montre le compte RÉEL de profils classés pour CE besoin
 * (`match.ranked.length`) — jamais un total agrégé sur plusieurs besoins que
 * ce composant n'a pas chargé : ce serait un chiffre inventé.
 */
export function NeedsMatchRail({ onOpenInPanel }: { onOpenInPanel: (projectId: string) => void }) {
  const { t } = useTranslation('consultants')
  const { data: needs, isLoading } = useOpenNeeds({ offset: 0, limit: RAIL_NEED_LIMIT })
  const items = needs?.data ?? []

  if (isLoading) return null
  if (items.length === 0) return null

  return (
    <Card className="mb-3 p-4">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-[var(--bellum-text-accent)]" />
        <Text element="h3" size="base" weight="semibold">
          {t('matchRail.title')}
        </Text>
      </div>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('matchRail.subtitle')}
      </Text>

      {/* Ce panneau DÉCLENCHE un classement de personnes et en rend le verdict,
          exactement comme `ConsultantMatchPanel` juste en dessous : chacun
          porte SON bandeau, un écran qui classe ne se tait jamais (GA de
          `transparency-mounted.test.ts`). */}
      <TransparencyBanner />

      <div className="mt-3 flex flex-col gap-3">
        {items.map(need => (
          <NeedMatchGroup
            key={need.id}
            projectId={need.project_id}
            title={need.title}
            accountName={need.account_name}
            onOpenInPanel={onOpenInPanel}
          />
        ))}
      </div>
    </Card>
  )
}

/**
 * Un groupe = un besoin ouvert, classé contre l'AFFAIRE qui le porte.
 *
 * ⚠️ `project_id`, et non `need.id`. `GET /consultants/match/:id` relit une
 * ligne d'`opportunities` (`ConsultantsService.loadTarget`) : lui passer un id
 * de besoin rendait 404 sur CHAQUE besoin ouvert, et un 404 s'affichait
 * « aucun profil » — un écran cassé et un vivier vide se ressemblent. C'est
 * aussi la valeur des options du `<select>` du panneau juste en dessous, donc
 * « voir tous les matchings » y sélectionne enfin la bonne ligne.
 */
function NeedMatchGroup({
  projectId,
  title,
  accountName,
  onOpenInPanel,
}: {
  /** #2558.1 — `null` quand ce besoin n'appartient à aucun projet. Le panneau
   *  de rapprochement se sélectionne par l'AFFAIRE (`useConsultantMatch`) :
   *  sans affaire, il n'y a rien à ouvrir, et la ligne le DIT plutôt que de
   *  disparaître du rail. */
  projectId: string | null
  title: string
  accountName: string | null
  onOpenInPanel: (projectId: string) => void
}) {
  const { t } = useTranslation('consultants')
  const { data: match, isLoading } = useConsultantMatch(projectId)
  const top = (match?.push ?? match?.ranked ?? []).slice(0, TALENTS_PER_NEED)

  return (
    <div className="rounded-lg border border-[var(--bellum-border)] p-3">
      <Text size="sm" weight="semibold">
        {title}
      </Text>
      {accountName ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {accountName}
        </Text>
      ) : null}

      {isLoading ? (
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('matchRail.loading')}
        </Text>
      ) : projectId === null ? (
        // ⚠️ « Non mesuré » se NOMME : dire « aucun profil » ici affirmerait
        // qu'on a cherché et rien trouvé, alors qu'on n'a pas pu chercher.
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('matchRail.withoutProject')}
        </Text>
      ) : top.length === 0 ? (
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('matchRail.empty')}
        </Text>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {top.map(entry => (
            <TalentMatchLine key={entry.consultant_id} match={entry} />
          ))}
        </ul>
      )}

      {match && projectId ? (
        <Button size="xs" variant="ghost" className="mt-2 gap-1 px-0" onClick={() => onOpenInPanel(projectId)}>
          {t('matchRail.viewAll', { count: match.ranked.length })}
        </Button>
      ) : null}
    </div>
  )
}

function TalentMatchLine({ match }: { match: ConsultantMatch }) {
  const { t } = useTranslation('consultants')
  return (
    <li className="flex items-center justify-between gap-2">
      <Text size="sm" className="truncate">
        {talentNameText(match.full_name, t('name.unnamed'))}
      </Text>
      {match.score === null ? (
        <UnknownValue reason={t('match.scoreUnmeasuredReason')} />
      ) : (
        <Badge variant="primary">{t('match.score', { score: match.score })}</Badge>
      )}
    </li>
  )
}
