import { EntityAvatar } from '@bellum/ui'
import { companyLogoSrc } from '@/lib/company-logo'

type CompanyAvatarProps = {
  name: string
  size?: 'sm' | 'md' | 'lg'
  /** Logo réel Apollo (`accounts.logo_url`). Prioritaire quand présent. */
  logoUrl?: string | null
  /** Site web du compte — sert UNIQUEMENT au fallback d'affichage favicon
   *  (le vrai favicon du site, jamais persisté). */
  website?: string | null
  /** Deux lettres au lieu d'une : une lettre seule se lirait comme une classe (A-D) à côté d'une classe d'accès. */
  twoLetters?: boolean
}

export function CompanyAvatar({ name, size = 'sm', logoUrl, website, twoLetters }: CompanyAvatarProps) {
  const initial = (
    twoLetters
      ? Array.from(name ?? '')
          .slice(0, 2)
          .join('') || '?'
      : (name?.[0] ?? '?')
  ).toUpperCase()
  const avatarSize = size === 'lg' ? 'lg' : size === 'md' ? 'sm' : 'xs'
  // UNE seule URL, stable et sur notre origine : l'API applique la précédence
  // (logo Apollo d'abord, sinon le favicon réel du site) et sert les octets
  // sous un cache immuable. Sans rien d'exploitable → l'initiale (EntityAvatar
  // retombe aussi sur l'initiale si l'image ne charge pas).
  const src = companyLogoSrc(logoUrl, website) ?? undefined

  return <EntityAvatar name={name} src={src} fallback={initial} size={avatarSize} shape="square" aria-hidden />
}
