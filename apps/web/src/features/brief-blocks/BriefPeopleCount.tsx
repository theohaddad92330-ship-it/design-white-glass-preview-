import type { CommercialBrief } from '@bellum/contracts'
import { Badge, Card, Text } from '@bellum/ui'
import type { BriefT } from './brief-t'

/** Les personnes ne sont pas listées ici (elles vivent dans Contacts) : seulement leur compte par rôle. */
export function BriefPeopleCount({
  people,
  economicDeciders,
  t,
}: {
  people: CommercialBrief['people']
  /** LOIC-FIX O.2 — le nombre de décideurs économiques porté par les CONTACTS du compte (la
   *  source de l'onglet Contacts). Fourni, il remplace le rôle `decision_maker` écrit par le
   *  brief ; absent, le brief garde son compte (rien n'est inventé). */
  economicDeciders?: number
  t: BriefT
}) {
  const peopleByRole = new Map<string, number>()
  for (const person of people) {
    const role = person.role ?? 'unspecified'
    const counted = peopleByRole.get(role)
    peopleByRole.set(role, counted === undefined ? 1 : counted + 1)
  }
  if (economicDeciders !== undefined) {
    // Une absence ne fait aucune ligne : zéro décideur dans les contacts n'affiche ni « 0 »,
    // ni le « 1 » que le brief avait écrit.
    if (economicDeciders > 0) peopleByRole.set('decision_maker', economicDeciders)
    else peopleByRole.delete('decision_maker')
  }
  if (peopleByRole.size === 0) return null
  return (
    <Card data-testid="brief-people-count" className="p-4">
      <Text size="sm" weight="semibold">
        {t('people.title', { count: people.length })}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('people.hint')}
      </Text>
      <ul className="mt-2 flex flex-wrap gap-2">
        {[...peopleByRole.entries()].map(([role, count]) => (
          <li key={role}>
            <Badge variant="outline">{t('people.roleCount', { role: t(`people.role.${role}`), count })}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  )
}
