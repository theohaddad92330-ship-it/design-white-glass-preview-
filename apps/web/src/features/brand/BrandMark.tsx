import { BrandMark as UiBrandMark } from '@bellum/ui'
import type { ComponentProps } from 'react'
import { useBrand } from './brand-context'

/**
 * LE MOT-SYMBOLE DE L'APPLICATION — marque blanche, 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER DE TROIS LIGNES EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `@bellum/ui` ne connaît ni le réseau ni l'espace actif : il reçoit la marque,
 * il ne va pas la chercher. La conséquence naïve serait d'écrire
 * `brand={useBrand()}` aux NEUF endroits qui affichent le mot-symbole — et
 * d'en oublier un. C'est exactement le défaut qu'on vient de payer 893 fois.
 *
 * Ici il y a un seul endroit. Les écrans importent CE composant, jamais celui
 * du paquet — la garde `brand-mark-reads-the-brand` (GA-253) le tient.
 *
 * ⚠️ Il fonctionne AVANT authentification. `BrandProvider` interroge alors
 * l'hôte (`GET brand`, publique), donc l'écran de connexion d'un client en
 * marque blanche porte SA marque — c'est le premier écran que ses propres
 * clients ouvrent, et celui où notre logo se verrait le plus.
 */
export function BrandMark(props: Omit<ComponentProps<typeof UiBrandMark>, 'brand'>) {
  const brand = useBrand()
  return <UiBrandMark {...props} brand={brand} />
}
