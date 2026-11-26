import { EntityAvatar } from '@bellum/ui'
import { contactPhotoSrc } from '@/lib/company-logo'

type ContactAvatarProps = {
  name: string | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Photo de profil réelle du contact (`contacts.photo_url`). */
  photoUrl?: string | null
  className?: string
}

/**
 * L'avatar d'une PERSONNE — le pendant de {@link CompanyAvatar}.
 *
 * Il existe pour une seule raison : faire passer la photo par le relais de
 * notre origine au lieu de la demander en direct au stockage du fournisseur.
 * Neuf écrans posaient l'URL brute dans `EntityAvatar`, et neuf écrans
 * retombaient sur l'initiale sans qu'on puisse distinguer « pas de photo » de
 * « la photo n'a pas chargé ».
 */
export function ContactAvatar({ name, size = 'sm', photoUrl, className }: ContactAvatarProps) {
  return <EntityAvatar name={name} src={contactPhotoSrc(photoUrl) ?? undefined} size={size} className={className} />
}
