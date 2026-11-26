import { Box, Button, Card, Text } from '@bellum/ui'
import { Mail, Phone, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Consultant } from '@bellum/contracts'
import { safeHref } from '@/lib/safe-href'

/**
 * #4346 — LES GESTES DE CONTACT, DANS LE BLOC DES COORDONNÉES.
 *
 * L'en-tête de la fiche n'a plus que trois boutons (Louis 19/10/2026). « Écrire à »,
 * « Appeler » et « Ajouter un moyen de contact » n'ont pas disparu : ils vivent
 * ici, à côté des coordonnées qu'ils servent (onglet Profil), plutôt que dix
 * boutons plus haut.
 *
 * Écrire part vers la messagerie DU COMMERCIAL : le produit prépare, il n'envoie
 * jamais à sa place. Sans coordonnée, le geste ne disparaît pas, il devient celui
 * qui manque. « Pas ton périmètre » n'est pas « pas renseigné » : coordonnées
 * masquées, aucun geste n'est proposé (les valeurs le disent déjà plus bas).
 */
export function TalentContactActions({
  talent,
  talentName,
  onAddContact,
}: {
  talent: Consultant
  talentName: string
  /** #4402.1 — mène au champ e-mail de la fiche, où l'on ajoute le moyen de contact. */
  onAddContact: () => void
}) {
  const { t } = useTranslation('consultants')
  if (!talent.contact_visible) return null

  const mailHref = talent.email ? safeHref(`mailto:${talent.email}`, { allowMailtoTel: true }) : undefined
  const telHref = talent.phone ? safeHref(`tel:${talent.phone}`, { allowMailtoTel: true }) : undefined

  return (
    <Card className="p-3">
      <Box display="flex" className="flex-wrap items-center gap-2">
        {mailHref ? (
          // `asChild` : un vrai `<a>` au style du bouton (GA-35 : ce qui se clique se tabule).
          <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5">
            <a href={mailHref}>
              <Mail className="size-4" aria-hidden />
              {t('detail.header.contact', { name: talentName })}
            </a>
          </Button>
        ) : null}
        {telHref ? (
          <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5">
            <a href={telHref}>
              <Phone className="size-4" aria-hidden />
              {t('detail.header.call', { name: talentName })}
            </a>
          </Button>
        ) : null}
        {!mailHref && !telHref ? (
          <>
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('detail.contactActions.none')}
            </Text>
            <Button variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={onAddContact}>
              <UserPlus className="size-4" aria-hidden />
              {t('detail.header.contactMissing')}
            </Button>
          </>
        ) : null}
      </Box>
    </Card>
  )
}
