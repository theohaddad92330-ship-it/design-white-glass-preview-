import type { LauraContextFacet, LauraPageContext } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { assigneeNames, type MissionView } from './api'

/**
 * #2953 (#2193.54) — CE QUE LAURA VOIT DU DOSSIER MISSION, SANS RECOPIE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MissionDossierPage` n'appelait jamais `useLauraContext` — la bulle de Laura,
 * montée à la racine du routeur, ne recevait donc RIEN quand elle s'ouvrait
 * depuis une mission (`git grep useLauraContext` : aucun résultat sous
 * `features/missions`, contre neuf écrans qui le font déjà). Interroger Laura
 * depuis ce dossier revenait à recopier soi-même ce que la fiche affiche déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS RECOPIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette fonction ne calcule rien de neuf : le consultant vient d'`assigneeNames`
 * (déjà lu par le hero du dossier), le statut et le manager client sont ceux du
 * hero lui-même. Aucun second appel réseau, aucune seconde vérité.
 *
 * `entityId` porte l'id de la MISSION elle-même — même geste que `NeedDetailPage`
 * (`kind: 'need'`, `entityId: needId`) — jamais celui du compte : Laura cadre la
 * conversation sur l'OBJET ouvert, pas sur son porteur.
 */
export function missionEntryContext({
  t,
  mission,
  isPending,
}: {
  t: TFunction<'missions'>
  mission: MissionView | null
  isPending: boolean
}): LauraPageContext {
  if (isPending || !mission) {
    return { kind: 'mission', label: t('dossier.loading'), entityId: null, facets: [], state: 'loading' }
  }
  const facets: LauraContextFacet[] = []
  const consultants = assigneeNames(mission)
  if (consultants.length > 0) {
    facets.push({ label: t('dossier.hero.consultant'), value: bounded(consultants.join(', ')) })
  }
  facets.push({ label: t('table.status'), value: t(`status.${mission.status}`) })
  if (mission.clientManagerName) {
    facets.push({ label: t('dossier.hero.clientManager'), value: bounded(mission.clientManagerName) })
  }
  return {
    kind: 'mission',
    label: bounded(mission.label || mission.id),
    entityId: mission.id,
    facets,
    state: 'ready',
  }
}

/** Bornes du contrat `lauraPageContextSchema` (libellé 160, valeur 160). */
const CONTEXT_TEXT_MAX = 160
function bounded(value: string): string {
  return value.length <= CONTEXT_TEXT_MAX ? value : `${value.slice(0, CONTEXT_TEXT_MAX - 1)}…`
}
