import { buildAuditDeclaredSignals, type AuditSignalsInput } from '@bellum/contracts'
import { DEMO_ESN_PROFILE, DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16 — LA PARITÉ DÉMO DU
 * BLOC « CE QUE TES RÉPONSES DISENT ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ALORS QUE `demo-coverage.spec.ts` EST VERTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` raisonne au niveau TABLE : `esn_profiles` est semée,
 * donc elle est verte — et elle le resterait si les dix colonnes que ce bloc lit
 * étaient vides. Une garde AVEUGLE n'est pas une exemption : ce qui se vérifie
 * ici est que le bloc rendu sur `/settings/profile/audit` DIT QUELQUE CHOSE en
 * démonstration, signal par signal, plutôt que cinq cartes « non mesuré » que la
 * salle découvrirait en réunion.
 *
 * ⚠️ Elle EXÉCUTE la vraie dérivation sur le vrai jeu de données — elle ne relit
 * pas le texte du semis. Vider l'une des dix colonnes de {@link DEMO_ESN_PROFILE}
 * fait rougir la ligne du signal correspondant, en le nommant.
 */

// Ce que l'écran lit : exactement les colonnes du semis, jamais une fixture
// écrite pour l'occasion — c'est tout l'intérêt de cette garde.
const DEMO_ANSWERS = DEMO_ESN_PROFILE as AuditSignalsInput
const DEMO_AIM = DEMO_PROFILE_CONTEXT.idealAccountProfile?.entryStrategy ?? null

describe('parité démo — les cinq signaux du questionnaire', () => {
  const signals = buildAuditDeclaredSignals(DEMO_ANSWERS, DEMO_AIM)

  it('AUCUN des cinq signaux n’est « non déclaré » en démonstration', () => {
    const silent = Object.entries(signals)
      .filter(([, signal]) => signal.kind === 'notDeclared')
      .map(([name]) => name)
    expect(silent).toEqual([])
  })

  it('#2049.15 — la salle voit une rupture RÉELLE, nommée, sans aucun pourcentage', () => {
    // Le semis compte « Comptes travaillés », puis saute « Contacts sollicités » :
    // la trace s'arrête donc à la deuxième unité de l'entonnoir.
    expect(signals.funnelBreak).toMatchObject({ kind: 'break', stage: 'Contacts sollicités', unit: 'contacts' })
    expect(JSON.stringify(signals)).not.toMatch(/%/)
  })

  it('#2043.10 — la salle voit un ÉCART entre l’axe visé et le niveau qui répond', () => {
    // `DEMO_PROFILE_CONTEXT` vise `bottomUp` ; les réponses arrivent au
    // management intermédiaire, qui demande plusieurs fils sur le même compte.
    expect(signals.entryAxis).toMatchObject({
      kind: 'measured',
      axis: 'multiThread',
      aimedEntryStrategy: 'bottomUp',
      divergesFromAim: true,
    })
  })

  it('#2050.14 — le budget de fronts est lu sur le temps PROTÉGÉ du semis', () => {
    expect(signals.frontsBudget).toMatchObject({
      kind: 'measured',
      source: 'protected',
      band: DEMO_ESN_PROFILE.weekly_sales_time_protected,
    })
  })

  it('#2051.16 — la rupture semée cite la routine qui la tiendrait, et elle n’est pas déjà tenue', () => {
    expect(signals.routineSeeds).toMatchObject({
      kind: 'measured',
      seeds: [{ practice: 'Une revue hebdomadaire du portefeuille', alreadyHeld: false }],
      unrouted: [],
    })
  })

  it('#2042.15 — le point de départ est COMPARÉ à l’ambition, pas deviné', () => {
    expect(['sameAsAmbition', 'differsFromAmbition']).toContain(signals.startingPoint.kind)
  })

  // Le témoin de lecture : sans lui, les six assertions au-dessus pourraient
  // être vertes sur un corpus vide et ne rien garder du tout.
  it('le corpus est bien LU : les sept colonnes que ce bloc lit sont renseignées', () => {
    const read = [
      'activity_measures_tracked',
      'ideal_client_current_state',
      'ideal_client_accessibility',
      'real_response_level',
      'weekly_sales_time_protected',
      'dossier_continuity_breaks',
      'dossier_continuity_practices',
    ] as const
    const row = DEMO_ESN_PROFILE as Record<string, unknown>
    // Une colonne absente OU semée vide ouvrirait le bloc vide en démonstration :
    // les deux se nomment ici, plutôt que de laisser la salle les découvrir.
    const empty = read.filter(column => {
      const value = row[column]
      if (value === undefined || value === null) return true
      return Array.isArray(value) && value.length === 0
    })
    expect(empty).toEqual([])
  })
})
