import type { Contact } from '@bellum/contracts'
import { buildOrgGraphViewData } from '@/features/accounts/view/account-detail/tabs/organigramme/orgGraphData'
import {
  buildFocalOrgView,
  defaultFocalDirectionId,
  type FocalOrgView,
} from '@/features/accounts/view/account-detail/tabs/organigramme/focalOrgData'
import { getCurrentOrgContacts } from '@/features/accounts/view/account-detail/tabs/organigramme/organigrammeData'

/**
 * La page « Organigramme de décision » du PDF exporté — les données, pas le
 * rendu (voir `AccountPdfDocument.tsx`).
 *
 * ⚠️ CE FICHIER NE CALCULE RIEN DE NOUVEAU.
 *
 * L'onglet Organigramme (vue focale) porte déjà l'arbre L0-L4, le chemin
 * d'accès recommandé, le bandeau de couverture et la distinction trait plein
 * (rattachement vérifié) / trait pointillé (hypothèse). Une dérivation vit à
 * un seul endroit (garde GA-26, `focalOrgData.ts`) : ce fichier ne fait que
 * lire `raw_analysis.org.orgGraph` par le MÊME chemin que l'écran
 * (`buildOrgGraphViewData`) et appeler la MÊME fonction de vue
 * (`buildFocalOrgView`) sur la direction par défaut. Deux calculs de chemin
 * divergeraient ; ce wrapper garantit qu'il n'y en a qu'un.
 */
export type AccountPdfOrgPage = FocalOrgView

/**
 * `null` quand le dossier ne porte pas de graphe (analyse ancienne, ou pas
 * encore lancée) — la page est alors OMISE du PDF plutôt que de montrer un
 * organigramme vide ou inventé.
 */
export function buildAccountPdfOrgPage(
  rawAnalysis: Record<string, unknown> | null | undefined,
  contacts: Contact[],
): AccountPdfOrgPage | null {
  // #3742/#3744 (reste) — même filtre géographique que l'écran : le PDF ne doit
  // pas exporter une personne dont le contact est écarté.
  const graphView = buildOrgGraphViewData(rawAnalysis, contacts)
  if (!graphView) return null
  // Même règle que l'écran : `discovered` vient du dossier EN DIRECT, pas de
  // l'instantané du run (`FocalOrgView` docblock, focalOrgData.ts).
  const discovered = getCurrentOrgContacts(contacts).length
  return buildFocalOrgView(graphView.graph, defaultFocalDirectionId(graphView.graph), { discovered })
}
