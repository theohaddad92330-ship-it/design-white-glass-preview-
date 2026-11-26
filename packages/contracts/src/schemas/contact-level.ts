import { deaccentLower, resolveBuyerRoleFamily } from './buyer-role-families.js'
import type { CoverageLevel } from './coverage.js'

/**
 * #2165.35 — le référentiel PARTAGÉ du NIVEAU hiérarchique d'un contact, à un
 * seul endroit (GA-26).
 *
 * Remonté de `resolveLevel` (`apps/api/.../coverage-gaps/coverage.service.ts`),
 * qui le calculait seul pour la matrice de couverture. Le filtre Découvrir
 * (`discover-contact-rows.ts`) partage désormais LA MÊME dérivation plutôt que
 * d'en recoder une seconde qui aurait fini par diverger — deux normalisations
 * qui divergent sur une abréviation rapprochent deux personnes différentes, ou
 * personne.
 *
 * Trois entrées, du plus fort signal au plus faible :
 *  1. le texte libre (intitulé de poste + séniorité + périmètre, quand ils
 *     existent) contre les heuristiques du knowledge-pack-v2 ;
 *  2. le raccourci « famille = Direction générale » (un contact classé C-Level
 *     sans intitulé analysable) ;
 *  3. le rôle décisionnel MEDDIC (`economic`/`sponsor` ⇒ N-1, tout autre rôle
 *     connu ⇒ N-2).
 *
 * `null` = « on n'a pas su situer ce contact » — jamais un niveau deviné par
 * ressemblance : c'est ce qui rendrait un score de couverture faux.
 */
export interface ContactLevelSignals {
  title?: string | null
  /** Texte libre de séniorité, quand la source le porte (ex. `ContactEntity`). */
  seniority?: string | null
  /** Le périmètre du poste, quand la source le porte. */
  scope?: string | null
  /** La famille persistée, quand la source la porte — sert le raccourci
   *  « C-Level ». Une source qui n'a que le titre (le résultat Découvrir) omet
   *  ce champ : la dérivation retombe sur le texte libre et le rôle. */
  family?: string | null
  /** Le rôle décisionnel MEDDIC — texte libre côté source (`ContactEntity`
   *  le persiste en `string | null`, sans validation Zod à l'écriture), pas
   *  le type `DecisionRole` : on ne veut pas qu'une valeur de base non
   *  encore migrée fasse échouer la dérivation. */
  decisionRole?: string | null
}

const C_LEVEL_RE =
  /\b(ceo|cio|cto|cdo|ciso|cfo|coo|cmo|cxo|dg|pdg|drh|daf)\b|chief\s+\w+\s+officer|directeur\s+g[ée]n[ée]ral|direction\s+g[ée]n[ée]rale|\bdsi\b|c-?level|comex|membre\s+du\s+comex/
const N1_RE = /directeur|director|\bvp\b|vice.?pr[ée]sident|head\s+of|\bhead\b|\brssi\b/
const N2_RE =
  /manager|\blead\b|responsable|chef\s+de|principal|architect|expert|ing[ée]nieur|analyst|consultant|\bpo\b|product\s+owner|scrum|d[ée]velopp|officer/

export function resolveContactLevel(signals: ContactLevelSignals): CoverageLevel | null {
  const text = deaccentLower([signals.seniority, signals.title, signals.scope].filter(Boolean).join(' '))
  if (text) {
    if (C_LEVEL_RE.test(text)) return 'c_level'
    if (N1_RE.test(text)) return 'n1'
    if (N2_RE.test(text)) return 'n2'
  }
  // Le classifieur peut poser une famille « C-Level » sans intitulé analysable
  // (« C-Level » comme « Direction generale / C-Level ») — le registre partagé
  // des familles résout les deux graphies.
  if (resolveBuyerRoleFamily(signals.family) === 'clevel') return 'c_level'
  // Dernier recours : le rôle décisionnel MEDDIC.
  const role = (signals.decisionRole ?? '').toLowerCase()
  if (role === 'economic' || role === 'sponsor') return 'n1'
  if (role) return 'n2'
  return null
}
