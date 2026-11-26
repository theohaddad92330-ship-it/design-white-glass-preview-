/**
 * GA-401 — LE RÔLE COMMERCIAL D'UNE PERSONNE SE LIT, IL NE SE RECALCULE
 * JAMAIS PAR SURFACE (#3423.1, retour bêta du 30/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * #3423 demande que « la même personne possède le même rôle commercial dans
 * Contacts, Carte d'influence, Plan d'action et Laura » et ferme sur : « le
 * test doit échouer lorsqu'une page crée une seconde vérité ou reconstruit
 * localement un calcul déjà canonique ailleurs ».
 *
 * Le rôle (`OrgDecisionRole` — economic_buyer / technical_buyer / user_buyer /
 * champion / procurement / blocker / influencer / unknown) n'a qu'UN moteur
 * d'inférence dans tout le dépôt : `apps/ia/app/services/decision_role.py`
 * (gardé par `apps/ia/tests/test_decision_role.py`), qui écrit
 * `OrgPerson.decisionRoles` / `Contact.decision_role` une fois, à l'analyse.
 * Chaque surface web lit CE champ :
 *   · Contacts       → `contactGrouping.ts:36` (`contact.decision_role`) ;
 *   · Carte d'influence → `orgInfluenceMapData.ts:279` (`person.decisionRoles`) ;
 *   · Plan d'action (comité) → `committeeScreenData.ts` (`seat.role`, dérivé
 *     du MÊME graphe via `buildOrgGraphViewData`, jamais un second moteur —
 *     voir son propre docblock : « AUCUN second moteur ») ;
 *   · Laura → même `raw_analysis.org.orgGraph` que les trois vues ci-dessus.
 *
 * Cette discipline n'était nulle part VÉRIFIÉE par la CI avant cette garde :
 * un futur contributeur de bonne foi qui ajouterait, dans l'une de ces trois
 * surfaces web, un raccourci du type « si le titre contient direction/CEO/CTO
 * alors rôle = X » (pour éviter un aller-retour serveur, par exemple) créerait
 * la seconde vérité que #3423 nomme — sans que rien ne le voie.
 *
 * ⚠️ Elle retire les commentaires avant de lire — sinon ce docblock, qui cite
 * les identifiants de rôle qu'elle surveille, la ferait échouer elle-même.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TABS_DIR = join(__dirname, '..', 'features', 'accounts', 'view', 'account-detail', 'tabs')

const CONTACTS_FILE = join(TABS_DIR, 'contacts', 'contactGrouping.ts')
const ORG_INFLUENCE_FILE = join(TABS_DIR, 'organigramme', 'orgInfluenceMapData.ts')
const COMMITTEE_FILE = join(TABS_DIR, 'committee', 'committeeScreenData.ts')

const SURFACE_FILES = [CONTACTS_FILE, ORG_INFLUENCE_FILE, COMMITTEE_FILE]

/** Les huit valeurs de `OrgDecisionRole` (`packages/contracts/src/schemas/org-graph.ts`). */
const DECISION_ROLE_VALUES = [
  'economic_buyer',
  'technical_buyer',
  'user_buyer',
  'champion',
  'procurement',
  'blocker',
  'influencer',
  'unknown',
] as const

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function read(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/**
 * Un second moteur ressemblerait à `title.match(/ceo|cto|directeur/i)` (ou un
 * `.title` testé juste avant/après une valeur de rôle) plutôt qu'à une simple
 * LECTURE de `decisionRoles`/`decision_role`/`seat.role`. On cherche donc une
 * valeur de rôle à proximité immédiate d'un accès à `.title` — le signal d'une
 * classification locale plutôt que d'une relecture du champ canonique.
 */
function titleBasedRoleInferencePattern(): RegExp {
  const roles = DECISION_ROLE_VALUES.join('|')
  return new RegExp(`\\.title[\\s\\S]{0,120}(${roles})|(${roles})[\\s\\S]{0,120}\\.title\\b`, 'i')
}

describe('GA-401 — la garde LIT vraiment quelque chose', () => {
  it('les trois fichiers surveillés existent et ne sont pas vides', () => {
    for (const file of SURFACE_FILES) {
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(200)
    }
  })

  it('savoir dire NON : la regex détecte bien un texte empoisonné qui inférerait le rôle depuis le titre', () => {
    const poisoned = `
      function guessRole(contact) {
        if (contact.title.toLowerCase().includes('directeur')) return 'economic_buyer'
        return 'unknown'
      }
    `
    expect(titleBasedRoleInferencePattern().test(poisoned)).toBe(true)
  })
})

describe('GA-401 — le rôle se LIT sur le champ canonique, jamais recalculé par surface', () => {
  it('Contacts lit `contact.decision_role`, il ne le déduit pas du titre', () => {
    const source = read(CONTACTS_FILE)
    expect(source).toMatch(/contact\.decision_role/)
    expect(source).not.toMatch(titleBasedRoleInferencePattern())
  })

  it("Carte d'influence lit `person.decisionRoles`, elle ne le déduit pas du titre", () => {
    const source = read(ORG_INFLUENCE_FILE)
    expect(source).toMatch(/person\.decisionRoles/)
    expect(source).not.toMatch(titleBasedRoleInferencePattern())
  })

  it('Plan d’action (comité) lit `seat.role` dérivé du graphe, il ne le déduit pas du titre', () => {
    const source = read(COMMITTEE_FILE)
    expect(source).toMatch(/seat\.role/)
    expect(source).toMatch(/buildOrgGraphViewData/)
    expect(source).not.toMatch(titleBasedRoleInferencePattern())
  })

  it('aucune des trois surfaces ne définit un second moteur de classification par mot-clé de titre', () => {
    for (const file of SURFACE_FILES) {
      const source = read(file)
      expect(source, `${file} semble reconstruire le rôle depuis le titre`).not.toMatch(
        titleBasedRoleInferencePattern(),
      )
    }
  })
})
