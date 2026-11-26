import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '../lib/discover-types'

/**
 * #4626 — le nom d'une PERSONNE ne se rend pas comme une entreprise (« BEN HRIZ AYA », mesuré en production le 26/10).
 *
 * Un entrepreneur individuel est enregistré sous son nom patronymique. Quand la catégorie juridique n'est pas connue,
 * la qualification ne peut pas l'écarter (rien ne le PROUVE) : elle le range « à vérifier — le nom ressemble à celui
 * d'une personne », mais ce motif ne vivait que dans le détail replié (#4068.3) — la ligne, elle, restait muette.
 * Ici le doute se DIT sur la carte repliée, à côté du nom. Une personne physique PROUVÉE (catégorie 1xxx) n'arrive pas
 * jusqu'ici : elle est écartée, donc ne fait aucune ligne. Ni verdict ni nom de personne : aucun repère.
 */
export function PersonNameMark({ candidate }: { candidate: Pick<DiscoverCandidate, 'name' | 'qualification'> }) {
  const { t } = useTranslation('discover')
  const qualification = candidate.qualification
  if (!qualification || qualification.verdict !== 'to_verify') return null
  if (qualification.code !== 'person_like_name' && !qualification.otherCodes.includes('person_like_name')) return null
  return (
    <span
      data-testid="candidate-person-name"
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs"
      style={{ color: 'var(--warning-soft-text)', border: '1px solid var(--warning-soft-border)' }}
      title={t('card.personNameHelp')}
    >
      {t('card.personName')}
    </span>
  )
}
