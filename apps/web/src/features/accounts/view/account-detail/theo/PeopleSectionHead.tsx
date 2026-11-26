import { LauraFace, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DossierSectionHead } from './DossierBlocks'

/** Les têtes écrites par la maquette, une par vue de section (`accounts:sectionTheo.<clé>`). */
type SectionHeadKey = 'people' | 'partners' | 'access' | 'plan' | 'history'

/**
 * Refonte Théo (23/10) — la tête d'une section de la fiche compte (`a/comptes-fiche.html`) :
 * `.ac20-context-line` (la consigne de Laura, son visage) puis `.a4-section-heading` (phrase, lecture, gestes).
 * UN composant pour toutes les sections : seules les phrases changent.
 */
export function SectionContextHead({ section, actions }: { section: SectionHeadKey; actions?: ReactNode }) {
  const { t } = useTranslation('accounts')
  // i18n keys: sectionTheo.people.context | sectionTheo.partners.context | sectionTheo.access.context | sectionTheo.plan.context | sectionTheo.history.context
  // i18n keys: sectionTheo.people.title | sectionTheo.partners.title | sectionTheo.access.title | sectionTheo.plan.title | sectionTheo.history.title
  // i18n keys: sectionTheo.people.lead | sectionTheo.partners.lead | sectionTheo.access.lead | sectionTheo.plan.lead | sectionTheo.history.lead
  return (
    <div data-testid={`${section}-head`} className="min-w-0">
      <div className="flex items-center gap-2">
        <LauraFace size={22} decorative />
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t(`sectionTheo.${section}.context`)}
        </Text>
      </div>
      <DossierSectionHead
        title={t(`sectionTheo.${section}.title`)}
        lead={t(`sectionTheo.${section}.lead`)}
        actions={actions}
      />
    </div>
  )
}

/** La tête de la section Contacts — commune à Contacts, Comité d'achat et Couverture. */
export function PeopleSectionHead({ actions }: { actions?: ReactNode }) {
  return <SectionContextHead section="people" actions={actions} />
}
