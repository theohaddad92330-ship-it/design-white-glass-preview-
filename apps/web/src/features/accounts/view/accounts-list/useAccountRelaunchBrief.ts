import { useMemo } from 'react'
import { accountPropagationById, usePropagationDigest } from '@/features/propagation/api'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { countOpenOpportunities, shouldRelaunchBrief } from './accountRelaunchBrief'

/**
 * « RELANCER LA PRISE DE BRIEF » — CÔTÉ PORTEFEUILLE (manque B du 30/08).
 *
 * Deux lectures déjà existantes, déjà utilisées ailleurs sur cette liste :
 *
 *  1. `usePropagationDigest()` — la MÊME source que le badge A pour « ce
 *     compte a-t-il une mission ? » (`AccountPropagation.missions`, une mission
 *     de ce dépôt naît signée). Un seul endroit répond à cette question.
 *  2. `useProjects()` — les opportunités du portefeuille, `GET /projects`,
 *     avec `account_id` et `stage`.
 *
 * Voir `accountRelaunchBrief.ts` pour la condition elle-même et pour la dette
 * nommée : ce contrôle est calculé ICI plutôt que désigné par le serveur
 * (contrairement au motif GA-53 des autres pastilles de cette liste), parce
 * qu'il n'existe encore nulle part ailleurs dans le produit et que
 * `account-hygiene.sql.ts` est hors du périmètre strict de ce lot.
 */
type AccountRelaunchBriefColumn = {
  failed: boolean
  shouldRelaunch(accountId: string): boolean
}

export function useAccountRelaunchBrief(): AccountRelaunchBriefColumn {
  const digest = usePropagationDigest()
  const projects = useProjects()

  const accountIdsWithMission = useMemo(() => accountPropagationById(digest.data), [digest.data])
  // Référence stable tant que la réponse ne change pas : `shouldRelaunch` peut
  // filtrer ce tableau à chaque ligne (25 comptes × quelques centaines de
  // projets, un coût négligeable) sans reconstruire un second index qui
  // redirait « ouvert » à sa façon (`OPEN_PIPELINE_STAGES` ne se lit qu'ici).
  const allProjects = projects.data ?? []

  return {
    failed: digest.isError || projects.isError,
    shouldRelaunch: accountId =>
      shouldRelaunchBrief({
        hasSignedMission: accountIdsWithMission.has(accountId),
        openOpportunities: countOpenOpportunities(accountId, allProjects),
      }),
  }
}
