import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-174 — l'agrégat de sous-traitance ne fait jamais fuiter le texte libre
 * d'UNE déclaration vers la table PARTAGÉE (N16, D589).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE, ET POURQUOI ELLE EXISTE À CÔTÉ DES TESTS DE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * `esn-directory.spec.ts` prouve le COMPORTEMENT : trois espaces qui déclarent
 * font promouvoir l'agrégat, un quatrième qui contredit le fait retomber. Ce
 * fichier prouve autre chose — que le canal par lequel ça arrive ne peut PAS
 * transporter le texte libre `evidence` d'une déclaration individuelle vers
 * `esn_directory`, que celui-ci soit anodin ou qu'il identifie quelqu'un
 * (« Jean Dupont, commercial chez Capgemini, confirmé le 12/08 »). C'est ce
 * qui rend légitime d'écrire dans une table que lit un concurrent (D590) :
 * l'anonymat n'est pas une politique documentée à côté du code, c'est une
 * propriété du SEUL appel SQL qui pose la valeur partagée.
 *
 * ⚠️ Une garde qui rejouerait `esnRisk()` ou `subcontractingAggregate()` ne
 * verrait rien de ça : les deux sont PURES et ne touchent aucune table. Le
 * risque vit dans le SERVICE, au moment où il construit les paramètres du
 * `UPDATE esn_directory` — c'est donc lui qu'il faut lire.
 */

const SERVICE = join(__dirname, 'esn-directory.service.ts')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * La portée d'un appel `callee(...)`, parenthèses BALANCÉES — en ignorant
 * celles qui vivraient dans un gabarit SQL (leçon « SQL dans un template
 * literal » : une requête peut contenir des `(` sans rapport avec l'appel).
 */
function callSpan(corpus: string, openParenIndex: number): string {
  let depth = 0
  let inTemplate = false
  for (let i = openParenIndex; i < corpus.length; i++) {
    const ch = corpus[i]
    if (ch === '`') inTemplate = !inTemplate
    if (inTemplate) continue
    if (ch === '(') depth++
    if (ch === ')') {
      depth--
      if (depth === 0) return corpus.slice(openParenIndex, i + 1)
    }
  }
  throw new Error('parenthèse fermante introuvable — la garde ne peut plus borner son corpus')
}

/**
 * L'appel `this.repo.query(...)` qui PROMEUT l'agrégat — reconnu par son
 * marqueur `subcontracting_declared_at = current_date`, qui n'apparaît que
 * dans CETTE requête (la remise à `inconnu`, elle, pose `NULL`, jamais une
 * date). Isoler CET appel précis évite de faire échouer la garde sur les
 * quatre autres requêtes du service, qu'elle ne concerne pas.
 */
function promotingQueryCall(corpus: string): string {
  const marker = corpus.indexOf('subcontracting_declared_at = current_date')
  if (marker < 0) {
    throw new Error('le marqueur de la promotion est introuvable — la garde ne lit plus rien')
  }
  const calleeStart = corpus.lastIndexOf('this.repo.query(', marker)
  if (calleeStart < 0) throw new Error('aucun `this.repo.query(` ne précède le marqueur')
  const openParen = calleeStart + 'this.repo.query'.length
  return callSpan(corpus, openParen)
}

describe('GA-174 — l’agrégat de sous-traitance ne fait jamais fuiter le texte libre d’une déclaration', () => {
  const source = stripComments(readFileSync(SERVICE, 'utf8'))

  it('LIT quelque chose — la requête de promotion existe bien dans le service', () => {
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toContain('subcontracting_declared_at = current_date')
  })

  it('sait dire NON — un appel FABRIQUÉ qui lie `.evidence` en paramètre est détecté', () => {
    // Corpus fabriqué : rejouer la vraie faute sur le vrai service romprait le
    // dépôt le temps du test. Le mécanisme testé est identique.
    const fautif = [
      'async recomputeSubcontractingAggregate() {',
      '  await this.repo.query(',
      '    `UPDATE esn_directory SET subcontracting_declared_at = current_date`,',
      '    [esnId, aggregate.value, aggregate.confidence, declaration.evidence, aggregate.sourcesCount],',
      '  )',
      '}',
    ].join('\n')
    expect(promotingQueryCall(fautif)).toMatch(/\.evidence\b/)
  })

  it('le VRAI appel ne lie JAMAIS le texte libre d’une déclaration — seul un décompte anonyme traverse', () => {
    const call = promotingQueryCall(source)
    // Négatif : aucune propriété `.evidence` — d'une déclaration, d'une ligne,
    // d'une entrée — ne voyage jusqu'à cet appel.
    expect(call).not.toMatch(/\.evidence\b/)
    expect(call).not.toMatch(/\binput\.evidence\b/)
    // Positif : ce qui traverse est un GABARIT littéral portant un COMPTE, pas
    // une valeur individuelle — la preuve que l'anonymat n'est pas un hasard
    // de ce qui manque, mais ce qui est effectivement écrit.
    expect(call).toContain('espaces indépendants')
    expect(call).toContain('aggregate.sourcesCount')
  })
})
