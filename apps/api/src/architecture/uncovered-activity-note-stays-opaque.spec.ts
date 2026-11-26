import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2060.10 — « Ne jamais transformer automatiquement ce texte libre en
 * plusieurs faits certains. »
 *
 * ⚠️ RENVERSEMENT PARTIEL ET DATÉ — #4016 L13b (DÉCISION LOUIS 11/10/2026) : la
 * note PEUT être découpée en faits PROPOSÉS, à une condition qui ne bouge pas —
 * ils restent « à revoir ». Cette garde tient donc deux choses : (1) le champ
 * stocké reste une chaîne verbatim, jamais découpée côté API (mapper, entité) ;
 * (2) le SEUL découpeur (`activity-note-facts.ts`, contrats) ne produit jamais
 * un fait « confirmé » : son statut est `to_review`, point.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `uncovered_activity_note` (#2060) est la question ouverte qui ferme le
 * parcours. Rien ne l'interdit à ce jour de devenir, un jour, l'entrée d'un
 * parseur qui la découperait en plusieurs « faits » structurés (comme une
 * extraction NLP le ferait) — exactement ce que la demande refuse : un texte
 * libre reste un texte, jusqu'à ce qu'un humain le confirme phrase par
 * phrase (#2060.9, hors de ce lot).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN DÉTECTEUR DE SOURCE, ET SA PREUVE QU'IL MORD
 * ─────────────────────────────────────────────────────────────────────────────
 * Le champ n'a AUCUN consommateur aujourd'hui (`QUESTION_CONSUMERS` porte
 * `areas: []`, mesuré) : une garde qui construirait un service réel n'aurait
 * rien à observer. Celle-ci lit donc le texte source des fichiers qui
 * PEUVENT le lire (le mapper, l'entité), et refuse tout motif d'extraction
 * multi-faits (`.split(`, `JSON.parse(`, `.match(` appliqués au champ). Elle
 * prouve qu'elle sait mordre sur un extrait FABRIQUÉ qui viole la règle —
 * sinon un détecteur qui ne peut jamais rougir n'a rien démontré.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

const FIELD = 'uncovered_activity_note'

/** Motifs qui SIGNALENT une extraction automatique de plusieurs faits à
 *  partir d'un champ texte libre — jamais exhaustif, mais couvre les formes
 *  les plus directes (découpage, parsing JSON, extraction par expression). */
const FORBIDDEN_PATTERNS = [/\.split\(/, /JSON\.parse\(/, /\.matchAll\(/]

/** Vrai si AUCUNE ligne du fichier ne combine le nom du champ avec un motif
 *  d'extraction interdit — la seule chose que #2060.10 refuse. */
function stemFactsFromField(source: string): boolean {
  return source.split('\n').some(line => line.includes(FIELD) && FORBIDDEN_PATTERNS.some(pattern => pattern.test(line)))
}

describe('#2060.10 — uncovered_activity_note reste une chaîne, jamais découpée en plusieurs faits', () => {
  it('le mapper (VRAI fichier) ne découpe pas le champ', () => {
    const source = readFileSync(join(REPO_ROOT, 'apps/api/src/modules/esn-profile/esn-answers.mapper.ts'), 'utf8')
    expect(stemFactsFromField(source)).toBe(false)
  })

  it("l'entité (VRAI fichier) le déclare `string | null`, jamais un tableau", () => {
    const source = readFileSync(join(REPO_ROOT, 'apps/api/src/database/entities/esn-profile.entity.ts'), 'utf8')
    const ligne = source.split('\n').find(line => line.trim().startsWith(`${FIELD}:`))
    expect(ligne).toBeDefined()
    expect(ligne).toContain('string | null')
  })

  it('sait dire NON : un extrait qui découpe le champ en plusieurs faits fait rougir le détecteur', () => {
    const violation = `
      const facts = answers.uncovered_activity_note.split('.').map(sentence => ({ fact: sentence, confidence: 1 }))
    `
    expect(stemFactsFromField(violation)).toBe(true)
  })

  it("n'attrape pas ce qu'elle ne vise pas : un `.split(` sur un AUTRE champ reste vert", () => {
    const autreChamp = `const parts = answers.frein_attempted.split('.')`
    expect(stemFactsFromField(autreChamp)).toBe(false)
  })

  // #4016 L13b — le découpeur autorisé ne confirme JAMAIS rien.
  describe('#4016 L13b — le découpeur de la note ne produit que des faits « à revoir »', () => {
    const FACTS_FILE = 'packages/contracts/src/schemas/onboarding/activity-note-facts.ts'

    /** Vrai si le texte source fait porter un autre statut que `to_review` à un fait. */
    function confirmsAFact(source: string): boolean {
      const statuses = [...source.matchAll(/status\s*[:=]\s*'([a-z_]+)'/g)].map(match => match[1])
      return statuses.length === 0 || statuses.some(status => status !== 'to_review')
    }

    it('le VRAI découpeur ne pose que le statut to_review', () => {
      const source = readFileSync(join(REPO_ROOT, FACTS_FILE), 'utf8')
      expect(confirmsAFact(source)).toBe(false)
    })

    it('sait dire NON : un découpeur qui poserait « confirmed » fait rougir la garde', () => {
      expect(confirmsAFact(`facts.push({ id, text, status: 'confirmed' })`)).toBe(true)
    })

    it('sait dire NON : un fichier qui ne pose aucun statut ne prouve rien (la garde lit quelque chose)', () => {
      expect(confirmsAFact(`export const nothing = 1`)).toBe(true)
    })
  })
})
