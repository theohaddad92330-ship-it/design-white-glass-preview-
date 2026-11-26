import type { CoverageGapsResponse } from '@bellum/contracts'

/**
 * #2121.48 — LES DIX AXES DE « QUI NOUS MANQUE POUR AVANCER ? ».
 *
 * La couverture était une matrice à deux axes (familles × niveaux) : elle ne
 * disait pas qu'il manquait le sponsor, les achats, ou que tout tenait à un seul
 * contact. Chaque axe se lit ici dans le payload DÉJÀ calculé par le serveur —
 * aucun calcul neuf, aucune déduction.
 *
 * ⚠️ Trois états, jamais deux. Un axe que le payload ne porte pas (rôles non
 * émis, aucune entité connue, niveau N-2 absent) est `unmeasured` : ni tenu, ni
 * manquant. « Non mesuré n'est jamais 0 ». La prochaine action n'est PAS une
 * donnée de contacts — elle vit dans le plan d'action : elle est dite non
 * mesurée ici, pas inventée.
 *
 * c65 : ces axes disent ce que NOS contacts couvrent de ce compte, jamais ce que
 * le compte fait.
 */
export const MISSING_AXES = [
  'levels',
  'families',
  'entities',
  'sponsor',
  'economicBuyer',
  'technicalReferent',
  'procurement',
  'operationalRelay',
  'singleContact',
  'nextAction',
] as const

type MissingAxisKey = (typeof MISSING_AXES)[number]
type MissingAxisState = 'covered' | 'missing' | 'unmeasured'

export function buildMissingAxes(data: CoverageGapsResponse): { key: MissingAxisKey; state: MissingAxisState }[] {
  const byRole = (role: string): MissingAxisState =>
    data.roles_missing === undefined ? 'unmeasured' : data.roles_missing.includes(role) ? 'missing' : 'covered'
  // Le relais opérationnel est le niveau N-2 (« relais terrain ») de la carte.
  const relay = data.levels.find(level => level.level === 'n2')
  const states: Record<MissingAxisKey, MissingAxisState> = {
    levels: data.levels_covered >= data.levels_target ? 'covered' : 'missing',
    families: data.families_covered >= data.families_target ? 'covered' : 'missing',
    entities: !data.entities_total
      ? 'unmeasured'
      : (data.entities_uncovered_names ?? []).length > 0
        ? 'missing'
        : 'covered',
    sponsor: byRole('sponsor'),
    economicBuyer: byRole('economic'),
    technicalReferent: byRole('technical'),
    procurement: byRole('procurement'),
    operationalRelay: relay === undefined ? 'unmeasured' : relay.covered ? 'covered' : 'missing',
    singleContact: data.single_champion_risk ? 'missing' : 'covered',
    nextAction: 'unmeasured',
  }
  return MISSING_AXES.map(key => ({ key, state: states[key] }))
}
