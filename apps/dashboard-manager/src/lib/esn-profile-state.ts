import type { AdminWorkspaceEsnProfile } from './admin'

/**
 * Ce que la console DIT de la fiche ESN d'un espace (#1671-ter).
 *
 * La décision vit ici, hors du composant, parce que l'environnement de test de
 * cette application est `node` : ce qui se garde est la LOGIQUE, ce qui se voit
 * à l'écran se recette en direct (cf. `vitest.config.mts`).
 *
 * ⚠️ TROIS ÉTATS, ET LES DEUX PREMIERS NE SE CONFONDENT PAS.
 * « Je ne sais pas » (l'API servie est antérieure à ce lot, le champ est absent)
 * et « il n'y a pas de fiche » sont deux faits différents. Les rendre pareils
 * ferait annoncer une panne au repos à chaque déploiement, pendant la fenêtre
 * où la console est neuve et l'API encore ancienne.
 */
// Non exportée : seule `describeEsnProfile` la nomme, et le composant lit son
// type de retour.
type EsnProfileState =
  | { kind: 'unavailable' }
  | { kind: 'none' }
  | {
      kind: 'present'
      heldByEmail: string | null
      heldByUserId: string | null
      version: number | null
      updatedAt: string | null
      companyFilled: number
      companyTotal: number
      answers: AdminWorkspaceEsnProfile['answers']
    }

export function describeEsnProfile(esnProfile: AdminWorkspaceEsnProfile | undefined): EsnProfileState {
  if (!esnProfile) return { kind: 'unavailable' }
  if (!esnProfile.canonical) return { kind: 'none' }
  return {
    kind: 'present',
    heldByEmail: esnProfile.heldByEmail,
    heldByUserId: esnProfile.heldByUserId,
    version: esnProfile.version,
    updatedAt: esnProfile.updatedAt,
    companyFilled: esnProfile.companyFilled,
    companyTotal: esnProfile.companyTotal,
    answers: esnProfile.answers,
  }
}
