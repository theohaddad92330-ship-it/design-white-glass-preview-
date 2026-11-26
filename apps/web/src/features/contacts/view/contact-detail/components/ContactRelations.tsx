import type { Contact } from '@bellum/contracts'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RelationFlow, type RelationFlowLink, type RelationFlowPerson } from '@/components/account/RelationFlow'
import { ContactEmptyTabCta } from './ContactEmptyTabCta'
import { SectionCard } from './SectionCard'

export function ContactRelations({ contact, onAddNote }: { contact: Contact; onAddNote: () => void }) {
  const { t } = useTranslation('contacts')
  const navigate = useNavigate()
  const relations = useMemo(() => contact.relations ?? [], [contact.relations])

  const relationFlow = useMemo(() => {
    const opener = (id?: string | null) =>
      id ? () => void navigate({ to: '/contacts/$id', params: { id } }) : undefined

    const groupedByTier = new Map<number, typeof relations>()
    relations.forEach(relation => {
      const tier = Math.max(1, relation.tier ?? 1)
      groupedByTier.set(tier, [...(groupedByTier.get(tier) ?? []), relation])
    })

    const levels = [...groupedByTier.entries()]
      .sort(([tierA], [tierB]) => tierA - tierB)
      .map(([, tierRelations], tierIndex) =>
        tierRelations.map((relation, index) => ({
          id: relation.id ?? `t${tierIndex + 1}-${index}`,
          name: relation.name,
          title: relation.title ?? null,
          entity: relation.entity ?? null,
          role: relation.decision_role ?? null,
          onOpen: opener(relation.id),
        })),
      ) satisfies RelationFlowPerson[][]

    // Le `tier` est une PROFONDEUR DEPUIS LE CONTACT RACINE (contrat : 1 = direct,
    // 2 = indirect), pas un rattachement à quelqu'un de la rangée du dessus. Tous
    // les traits partent donc de la racine — c'est ce que la donnée dit, et rien
    // de plus. Un lien direct est plein, un lien indirect pointillé.
    const links = levels.flatMap((level, levelIndex) =>
      level.map(
        person => ({ parentId: 'root', childId: person.id, verified: levelIndex === 0 }) satisfies RelationFlowLink,
      ),
    )

    return {
      root: {
        id: 'root',
        name: contact.full_name,
        title: contact.title,
        entity: contact.entity,
        role: contact.decision_role,
        photoUrl: contact.photo_url,
      } satisfies RelationFlowPerson,
      levels,
      links,
    }
  }, [contact, relations, navigate])

  return (
    <SectionCard>
      {relations.length > 0 ? (
        // Hauteur explicite : c'est un graphe, pas un bloc de texte, et il doit
        // occuper l'espace qu'on lui destine. (`RelationFlow` pose de son côté un
        // plancher, pour qu'un appelant distrait ne rende pas une carte vide.)
        <div className="h-[32rem]">
          <RelationFlow root={relationFlow.root} levels={relationFlow.levels} links={relationFlow.links} />
        </div>
      ) : (
        <ContactEmptyTabCta contact={contact} message={t('relations.empty')} onAddNote={onAddNote} />
      )}
    </SectionCard>
  )
}
