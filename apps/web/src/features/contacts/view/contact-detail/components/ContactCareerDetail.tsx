import type { Contact } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { ImportedExtraCard } from '@/features/universal-import/view/ImportedExtraCard'
import { apolloProfileHasContent, ContactApolloProfile } from './ContactApolloProfile'
import { ContactDisclosure } from './ContactDisclosure'

/** Les colonnes importées qui portent une valeur — mêmes règles que
 *  `ImportedExtraCard` (une cellule vide ne fait aucune ligne). */
function hasImportedExtra(extra: Readonly<Record<string, string>> | null | undefined): boolean {
  return Object.values(extra ?? {}).some(value => typeof value === 'string' && value.trim() !== '')
}

/**
 * #3716 — « Parcours et informations complémentaires » : UN détail qui range ce
 * que la lecture principale n'a pas à répéter.
 *
 *  · le parcours professionnel, les liens autorisés et la formation
 *    (`ContactApolloProfile`, débarrassé de la localisation et de LinkedIn déjà
 *    portés par « Informations clés » et l'en-tête) ;
 *  · les colonnes importées sans champ d'accueil, sous leur intitulé d'origine
 *    (`ImportedExtraCard`) — jamais forcées en propriétés canoniques.
 *
 * Fermé par défaut, mais RIEN n'est démonté ni recollecté : ouvrir ou fermer ce
 * détail ne déclenche ni collecte ni débit (lecture seule du contact déjà
 * chargé). Sans parcours ni colonne importée, aucune ligne n'apparaît.
 */
export function ContactCareerDetail({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const hasCareer = apolloProfileHasContent(contact.apollo_enrichment)
  const hasExtra = hasImportedExtra(contact.extra)
  if (!hasCareer && !hasExtra) return null

  const hint = [hasCareer ? t('careerDetail.hintCareer') : null, hasExtra ? t('careerDetail.hintImported') : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <ContactDisclosure title={t('careerDetail.title')} hint={hint}>
      <ContactApolloProfile contact={contact} />
      <ImportedExtraCard extra={contact.extra} />
    </ContactDisclosure>
  )
}
