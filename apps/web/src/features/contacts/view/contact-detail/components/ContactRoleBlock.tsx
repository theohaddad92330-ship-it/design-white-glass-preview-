import type { AccountStrategy5P, Contact } from '@bellum/contracts'
import { Box, Card } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ContactCommercialUtility } from './ContactCommercialUtility'
import { ContactRoleScope } from './ContactRoleScope'
import { ContactScoreBreakdown } from './ContactScoreBreakdown'

/**
 * #4585 (décision Louis 26/10) — « Rôle & périmètre » est UN SEUL bloc, pleine largeur : le rôle et le périmètre
 * (séniorité, secteur, périmètre, budget), la priorité par axes (en mots) et l'utilité commerciale. Avant, une carte
 * et un pli replié portaient le même titre (GA-26) dans une colonne étroite où les valeurs étaient coupées
 * (« non éval… », « moy… »). Trois cartes côte à côte, jamais d'infobulle : la valeur se lit.
 * « Comment est-elle calculée ? » amène à `SCORE_BREAKDOWN_ID`, ici toujours monté (plus de pli à ouvrir).
 */
export function ContactRoleBlock({
  contact,
  accountSector = null,
  strategy = null,
}: {
  contact: Contact
  accountSector?: string | null
  strategy?: AccountStrategy5P | null
}) {
  const { t } = useTranslation('contacts')
  return (
    <Box as="section" aria-labelledby="contact-role" className="space-y-3">
      <h2 id="contact-role" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
        {t('roleScope.title')}
      </h2>
      <Box className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_1.4fr_1fr]">
        <Card className="min-w-0 rounded-overlay p-5 shadow-none">
          {/* #4036.3 — séniorité et secteur, ou « Non disponible » : jamais derrière un pli. */}
          <ContactRoleScope contact={contact} accountSector={accountSector} bare />
        </Card>
        <ContactScoreBreakdown contact={contact} />
        <ContactCommercialUtility contact={contact} strategy={strategy} />
      </Box>
    </Box>
  )
}
