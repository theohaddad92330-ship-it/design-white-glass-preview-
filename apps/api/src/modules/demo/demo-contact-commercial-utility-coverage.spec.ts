import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #3400.5/#3400.6/#3401 (lot C07 du 30/09, retours bêta #3400/#3401) —
 * parité démo de la carte « Utilité commerciale » et de la provenance du
 * rôle affichées sur la fiche contact.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET CE QU'ELLE NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `ContactCommercialUtility.tsx` et la provenance du rôle (`ContactHeader.tsx`)
 * sont des DÉRIVATIONS PURES (`getRoleUtility`/`getRoleDescription`,
 * `decisionRoleProvenance`) sur des colonnes déjà seedées — voir le
 * commentaire au-dessus de `DEMO_CONTACT_SEEDED_COLUMNS` dans
 * `demo-coverage.ts`. Ces fonctions vivent côté `apps/web` : cette garde,
 * côté `apps/api`, ne les EXÉCUTE pas (les deux apps ne partagent pas ce
 * code) — elle relit le SEMIS RÉEL, comme
 * `demo-icebreaker-insufficient-context-coverage.spec.ts` le fait déjà pour
 * une autre carte, et vérifie que la salle porte bien la matière première
 * dont la carte a besoin : un `decision_role` connu (pour le rôle expliqué
 * et ses capacités), et au moins un contact avec `why_contact` NON vide
 * (pour « pourquoi le contacter maintenant »).
 *
 * Si ce test rougit : soit le semis a perdu un rôle que la démo montrait
 * déjà, soit `getRoleUtility` (`apps/web/src/lib/contactRoles.ts`) a besoin
 * d'un rôle que la démo ne porte pas encore — dans les deux cas, une salle
 * qui ne montre plus ce que ce lot livre, pas une fausse alerte.
 */

const DEMO_DIR = __dirname
const SOURCE_FILES = ['demo-dataset.ts', 'demo-contact-density.ts', 'demo-contact-profile.ts'] as const

function readSources(): string {
  return SOURCE_FILES.map(file => readFileSync(join(DEMO_DIR, file), 'utf8')).join('\n')
}

// Les 7 rôles COURANTS de la taxonomie MEDDIC (voir `decisionRoleSchema`,
// `@bellum/contracts`) — les mêmes que `CURRENT_DECISION_ROLES`
// (`apps/web/src/lib/contactRoles.ts`), pas recopiés depuis une source tierce.
const CURRENT_ROLES = ['technical', 'economic', 'procurement', 'user', 'champion', 'influencer', 'blocker'] as const

describe('#3401 — la salle de démonstration porte la matière première de la carte « Utilité commerciale »', () => {
  const source = readSources()

  it('au moins un contact porte chacun des trois rôles qui exercent les trois capacités (confirme/avance/décide)', () => {
    // `technical` confirme le terrain, `champion` fait avancer en interne,
    // `economic` est le SEUL qui décide probablement seul (`getRoleUtility`).
    for (const role of ['technical', 'champion', 'economic'] as const) {
      expect(source).toContain(`decision_role: '${role}'`)
    }
  })

  it('recompte les rôles courants RÉELLEMENT seedés — sait dire NON sur ce qui manque', () => {
    const present = CURRENT_ROLES.filter(role => source.includes(`decision_role: '${role}'`))
    // Six des sept rôles courants sont portés (voir le commentaire de tête de
    // `demo-coverage.ts` au-dessus de `DEMO_CONTACT_SEEDED_COLUMNS`) — `blocker`
    // manque, un trou PRÉEXISTANT à ce lot, pas introduit par lui.
    expect(present).toEqual(
      expect.arrayContaining(['technical', 'economic', 'user', 'procurement', 'champion', 'influencer']),
    )
    expect(present).not.toContain('blocker')
  })

  it('au moins un contact porte un `why_contact` non vide — « pourquoi le contacter maintenant » n’est jamais vide en démo', () => {
    expect(/why_contact:\s*'[^']+'/.test(source)).toBe(true)
  })
})
