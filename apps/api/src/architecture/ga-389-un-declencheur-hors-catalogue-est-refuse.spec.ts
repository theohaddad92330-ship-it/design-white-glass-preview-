import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INTERVENTION_KINDS, TRIGGER_CATALOG } from '@bellum/contracts'

/**
 * GA-389 — #2402.2 : « un trigger ne doit pas être recodé indépendamment dans
 * chaque page » (LAU-FINAL-116). Cette garde REFUSE un déclencheur hors
 * catalogue plutôt que de l'affirmer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET CE QU'ELLE NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `intervention-rules.ts` est aujourd'hui le SEUL fichier de production qui
 * construit des objets `InterventionDraft` avec un `kind` littéral (les cinq
 * autres pipelines nommés par le registre du 23/09 — Discover Python, crédits,
 * gouvernance, routines de delivery — ne sont pas scannés ici : ils sont
 * `known-unlinked` dans {@link TRIGGER_CATALOG}, nommés, pas cachés). Cette
 * garde lit ce fichier RÉEL, extrait chaque `kind` littéral qu'il déclare, et
 * refuse que l'ensemble diverge de {@link INTERVENTION_KINDS} — la source
 * unique dont {@link TRIGGER_CATALOG} dérive. Un futur détecteur qui ajouterait
 * un `kind: 'un_truc_maison'` sans l'enregistrer d'abord dans
 * `packages/contracts/src/schemas/playbook.ts` fait ROUGIR le test
 * d'exhaustivité plus bas, en NOMMANT le kind en trop.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES EXIGÉES PAR CLAUDE.md
 * ─────────────────────────────────────────────────────────────────────────────
 *  - SAIT DIRE NON : `extractDraftKinds` est exercée sur un FIXTURE synthétique
 *    portant un `kind` hors catalogue, plus bas — elle le trouve, et le test
 *    prouve qu'il n'a PAS d'entrée dans `TRIGGER_CATALOG`.
 *  - LIT quelque chose : le fichier réel est ouvert, non vide, et le motif y
 *    est trouvé au moins douze fois.
 *  - N'ATTRAPE PAS ce qu'elle ne vise pas : un kind cité dans un COMMENTAIRE ne
 *    compte pas (la leçon de GA-16), prouvé par fixture séparée.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const INTERVENTION_RULES_FILE = join(REPO_ROOT, 'apps', 'api', 'src', 'modules', 'playbooks', 'intervention-rules.ts')

/** Retire les commentaires — un `kind` cité dans un docblock ne doit jamais se
 *  lire comme une déclaration réelle (GA-16). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/** Les `kind` LITTÉRAUX déclarés dans le code réel — jamais une annotation de
 *  type (`kind: InterventionKind`) ni un champ homonyme sans rapport
 *  (`contract_kind: string`) : le `\b` borne le mot, et seule une CHAÎNE
 *  entre guillemets compte. */
export function extractDraftKinds(source: string): Set<string> {
  const stripped = stripComments(source)
  const found = new Set<string>()
  for (const match of stripped.matchAll(/\bkind:\s*'([a-z_]+)'/g)) {
    if (match[1]) found.add(match[1])
  }
  return found
}

describe('GA-389 — #2402.2 : un déclencheur hors catalogue est refusé, pas recodé', () => {
  const source = readFileSync(INTERVENTION_RULES_FILE, 'utf8')
  const declared = extractDraftKinds(source)

  it('lit un corpus réel — le fichier n’est pas vide et le motif y est trouvé', () => {
    expect(source.length).toBeGreaterThan(2000)
    expect(declared.size).toBeGreaterThan(0)
  })

  it('les douze `kind` déclarés dans intervention-rules.ts SONT EXACTEMENT INTERVENTION_KINDS — ni reste ni oubli', () => {
    expect([...declared].sort()).toEqual([...INTERVENTION_KINDS].sort())
  })

  it('chaque `kind` déclaré a une entrée `unified` dans TRIGGER_CATALOG — pas seulement nommée', () => {
    for (const kind of declared) {
      expect(TRIGGER_CATALOG[kind]).toBeDefined()
      expect(TRIGGER_CATALOG[kind]?.status).toBe('unified')
    }
  })

  describe('extractDraftKinds — sait dire NON (fixtures synthétiques, sans toucher au disque)', () => {
    it('trouve un kind réel dans un fixture qui en déclare un', () => {
      const fixture = `drafts.push({ kind: 'submission_stalled', subjectType: 'submission', subjectId: row.id })`
      expect(extractDraftKinds(fixture)).toEqual(new Set(['submission_stalled']))
    })

    it('⚠️ REFUSE un déclencheur hors catalogue — la preuve que cette garde peut rougir', () => {
      // Une page qui recoderait son propre déclencheur au lieu de passer par
      // le catalogue introduirait exactement ce genre de littéral.
      const fixtureRecode = `drafts.push({ kind: 'signal_recode_par_une_page', subjectType: 'account', subjectId: row.id })`
      const found = extractDraftKinds(fixtureRecode)
      expect(found.has('signal_recode_par_une_page')).toBe(true)
      // Et le catalogue ne le connaît pas — c'est CE désaccord que la garde
      // ci-dessus, appliquée à ce fixture, ferait rougir.
      expect(TRIGGER_CATALOG['signal_recode_par_une_page']).toBeUndefined()
    })

    it('un `kind` cité seulement dans un commentaire ne compte pas — la leçon de GA-16', () => {
      const fixtureCommente = `
        // ancien code retiré : drafts.push({ kind: 'kind_retire', subjectType: 'account', subjectId: row.id })
        /** Documentation qui mentionne kind: 'kind_documente' sans jamais l'écrire. */
      `
      const found = extractDraftKinds(fixtureCommente)
      expect(found.has('kind_retire')).toBe(false)
      expect(found.has('kind_documente')).toBe(false)
    })

    it('n’attrape pas une annotation de type ni un champ homonyme sans rapport', () => {
      const fixtureAnnotations = `
        export type InterventionDraft = { kind: InterventionKind }
        type Row = { contract_kind: string }
      `
      expect(extractDraftKinds(fixtureAnnotations).size).toBe(0)
    })
  })
})
