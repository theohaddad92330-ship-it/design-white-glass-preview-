import type { ReactNode } from 'react'
import type { PlanFeatureKey } from '@bellum/contracts'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureLocked } from './PlanFeatureLocked'
import { usePlanFeature } from './usePlanFeature'
import { useRefreshEntitlementsOnLock } from './useRefreshEntitlementsOnLock'

type PlanFeatureRouteProps = {
  feature: PlanFeatureKey
  children: ReactNode
  /**
   * L'écran remplacé porte LUI-MÊME la coque de l'app (`CustomerPage`).
   *
   * Sans ça, le verrou se substitue à tout — barre latérale comprise —, et
   * l'utilisateur atterrit sur une page nue, en thème clair, sans moyen de
   * revenir. Les écrans déjà rendus À L'INTÉRIEUR d'une `CustomerPage` (chat,
   * équipe, connaissances) laissent ce drapeau à `false`, sinon la coque serait
   * imbriquée deux fois.
   */
  withShell?: boolean
  /** Titre de page, quand c'est nous qui posons la coque. */
  pageTitle?: string
}

/**
 * Un écran entier derrière une feature de palier.
 *
 * L'entrée reste VISIBLE dans la navigation et la page s'ouvre : elle explique
 * ce que la fonction fait, quel palier l'ouvre et à quel prix. Masquer l'entrée
 * serait plus « propre » et strictement moins utile — un commercial ne peut pas
 * vouloir ce qu'il ne voit pas, et une nav qui change de forme selon l'offre
 * rend le produit illisible d'un poste à l'autre.
 *
 * Le doute n'interdit pas (voir {@link usePlanFeature}) : tant que la charge
 * crédits n'a pas répondu, l'écran s'affiche normalement.
 */
export function PlanFeatureRoute({ feature, children, withShell = false, pageTitle }: PlanFeatureRouteProps) {
  const { allowed } = usePlanFeature(feature)
  // Un verrou qui s'affiche relit les droits : un palier qui vient de changer ne
  // doit pas rester derrière un cadenas jusqu'à la prochaine déconnexion.
  useRefreshEntitlementsOnLock(!allowed)
  if (allowed) return <>{children}</>
  const locked = <PlanFeatureLocked feature={feature} />
  return withShell ? <CustomerPage pageTitle={pageTitle}>{locked}</CustomerPage> : locked
}
