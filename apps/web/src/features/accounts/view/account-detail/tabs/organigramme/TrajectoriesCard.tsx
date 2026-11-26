import { computeCommercialTrajectories, type CommercialTrajectory, type Contact } from '@bellum/contracts'
import { Badge, Button, Card, Text } from '@bellum/ui'
import { Milestone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RoleBadge } from '@/components/contacts/RoleBadge'
import { ContactAvatar } from '@/components/ui/ContactAvatar'

/**
 * #3402 — LES TRAJECTOIRES COMMERCIALES.
 *
 * Regroupe les contacts déjà classés (`Contact.decision_role`) en quatre
 * trajectoires nommées (`computeCommercialTrajectories`, `@bellum/contracts`)
 * — voir son docblock pour ce qui existait déjà (le chemin unique de
 * `RecommendedPathCard`) et ce que ce module ajoute (quatre chemins
 * distincts, choisis, plutôt qu'un seul ordre mélangé).
 *
 * Une trajectoire sans contact n'apparaît PAS : `computeCommercialTrajectories`
 * l'a déjà exclue (doctrine « on n'affiche pas ce qu'on n'a pas »). La CARTE,
 * elle, reste quand aucune trajectoire n'est disponible (recette 30/09 : elle
 * disparaissait, donc « n'apparaît nulle part ») : un état vide NOMME pourquoi.
 * Elle est montée sous TOUTES les vues (`TabOrganigramme`, `belowEveryView`) —
 * dans la barre latérale elle n'existait que sur la vue « système ».
 */
// #3592 — la CARTE montre au plus 10 lignes au total (recette 05/10 : 10 par trajectoire
// faisait encore 26 lignes) ; le reste tombe derrière UN « Voir plus (N) ».
const TRAJECTORY_VISIBLE_STEPS = 10

/** Répartit le budget de lignes à tour de rôle : chaque trajectoire montre d'abord ses plus prioritaires. */
function allocateVisibleSteps(lengths: number[], budget: number): number[] {
  const shown = lengths.map(() => 0)
  let left = budget
  let progressed = true
  while (left > 0 && progressed) {
    progressed = false
    for (let i = 0; i < lengths.length && left > 0; i++) {
      const length = lengths[i]
      const current = shown[i]
      // Indices bornés par `lengths.length` : jamais absents, aucun repli sur zéro (GA-19).
      if (length !== undefined && current !== undefined && current < length) {
        shown[i] = current + 1
        left--
        progressed = true
      }
    }
  }
  return shown
}

export function TrajectoriesCard({ contacts }: { contacts: Contact[] }) {
  const { t } = useTranslation('accountOrg')
  const trajectories = computeCommercialTrajectories(
    contacts.map(contact => ({
      id: contact.id,
      full_name: contact.full_name,
      title: contact.title,
      decision_role: contact.decision_role,
      priority: contact.priority,
    })),
  )

  const classifiedCount = contacts.filter(c => c.decision_role && c.decision_role !== 'unknown').length
  const emptyKey = contacts.length === 0 ? 'noContacts' : classifiedCount === 0 ? 'unclassified' : 'noEntryRole'

  const [expanded, setExpanded] = useState(false)
  const totalSteps = trajectories.reduce((sum, trajectory) => sum + trajectory.steps.length, 0)
  const hidden = Math.max(0, totalSteps - TRAJECTORY_VISIBLE_STEPS)
  const shownCounts = expanded
    ? trajectories.map(trajectory => trajectory.steps.length)
    : allocateVisibleSteps(
        trajectories.map(trajectory => trajectory.steps.length),
        TRAJECTORY_VISIBLE_STEPS,
      )

  const photoByContactId = new Map(contacts.map(contact => [contact.id, contact.photo_url]))

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Milestone className="size-4 text-[var(--bellum-text-accent)]" />
        <Text size="base" weight="semibold">
          {t('trajectories.title')}
        </Text>
      </div>
      <Text size="xs" className="mb-3 text-[var(--bellum-text-secondary)]">
        {t('trajectories.help')}
      </Text>
      {trajectories.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t(`trajectories.empty.${emptyKey}`, { count: contacts.length })}
        </Text>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {trajectories.map((trajectory, index) => (
            <TrajectoryItem
              key={trajectory.kind}
              trajectory={trajectory}
              visibleSteps={shownCounts[index] ?? trajectory.steps.length}
              photoByContactId={photoByContactId}
            />
          ))}
        </div>
      )}
      {hidden > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 min-h-11"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? t('trajectories.showLess') : t('trajectories.showMore', { count: hidden })}
        </Button>
      ) : null}
    </Card>
  )
}

function TrajectoryItem({
  trajectory,
  visibleSteps,
  photoByContactId,
}: {
  trajectory: CommercialTrajectory
  visibleSteps: number
  photoByContactId: Map<string, string | null | undefined>
}) {
  const { t } = useTranslation('accountOrg')
  const steps = trajectory.steps.slice(0, visibleSteps)
  return (
    <div className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-3">
      <Text size="sm" weight="semibold">
        {t(`trajectories.kind.${trajectory.kind}`)}
      </Text>
      <ul className="mt-2 flex flex-col gap-1.5">
        {steps.map(step => (
          <li key={step.contactId} className="flex items-center gap-2">
            <ContactAvatar name={step.fullName} photoUrl={photoByContactId.get(step.contactId) ?? null} size="sm" />
            <div className="min-w-0 flex-1">
              <Text size="xs" weight="semibold" noWrap className="truncate">
                {step.fullName}
              </Text>
              {step.title && (
                <Text size="xs" className="line-clamp-1 text-[var(--bellum-text-secondary)]">
                  {step.title}
                </Text>
              )}
            </div>
            <RoleBadge role={step.role} />
          </li>
        ))}
      </ul>
      <Text size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
        {t(`trajectories.desiredOutcome.${trajectory.kind}`)}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t(`trajectories.switchCondition.${trajectory.kind}`)}
      </Text>
      {/* #3402.6 — le risque nommé, jamais inventé : absent quand rien ne le
          justifie (`computeCommercialTrajectories`, `risk: null`). */}
      {trajectory.risk && (
        <Badge variant="outline" className="mt-2">
          {t(`trajectories.risk.${trajectory.risk}`)}
        </Badge>
      )}
    </div>
  )
}
