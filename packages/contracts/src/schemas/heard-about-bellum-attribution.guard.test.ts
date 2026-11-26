import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2059.8/.9/.10 — « Comment as-tu connu {{brand}} ? » sert UNIQUEMENT à
 * l'attribution marketing. Même raison que l'interdit des critères protégés
 * (GA-06, `apps/api/src/architecture/protected-criteria.spec.ts`) : un champ
 * n'a pas besoin d'être multiplié par un poids pour peser dans un classement —
 * il suffit qu'il soit dans ce qui NOTE. `photoUrl` voyageait ainsi jusqu'à
 * `bellum_contacts` sans qu'aucune ligne ne le « lise ».
 *
 * Trois preuves exigées par la doctrine (« une garde protège une règle, elle
 * ne l'invente pas ») :
 *  1. qu'elle LIT quelque chose — le corpus (la fonction/le fichier réel)
 *     n'est pas vide ;
 *  2. qu'elle sait dire NON — une fixture SYNTHÉTIQUE qui ajoute
 *     `heard_about_bellum` au chemin de notation fait rougir l'assertion ;
 *  3. qu'elle n'attrape pas ce qu'elle ne vise pas — un champ légitime voisin
 *     (`target_sectors`, qui DOIT peser dans la notation) passe sans rougir.
 *
 * ⚠️ `RegExp.test()` sans le drapeau `g` : avec `g`, l'objet est STATEFUL et
 * alterne vrai/faux d'un appel à l'autre — l'une des six gardes borgnes déjà
 * mesurées dans ce dépôt (`CLAUDE.md`).
 */

const FORBIDDEN_FIELD = 'heard_about_bellum'
const LEGITIMATE_NEIGHBOUR_FIELD = 'target_sectors'

/** La fonction pont TS — le chemin explicitement nommé par #2059.9/.10. */
function esnAnswersToProfileDataSource(): string {
  const full = readFileSync(join(__dirname, 'analysis.ts'), 'utf8')
  const start = full.indexOf('export function esnAnswersToProfileData(')
  const end = full.indexOf('\nexport const ANALYSIS_STEPS')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('esnAnswersToProfileData introuvable — la garde ne peut plus lire son corpus')
  }
  return full.slice(start, end)
}

/** Les trois fichiers IA qui construisent le contexte envoyé au modèle. */
const IA_PROMPT_PATHS = [
  join(__dirname, '..', '..', '..', '..', 'apps', 'ia', 'app', 'services', 'seller_context.py'),
  join(__dirname, '..', '..', '..', '..', 'apps', 'ia', 'app', 'models', 'profile_context.py'),
  join(__dirname, '..', '..', '..', '..', 'apps', 'ia', 'app', 'prompts', 'bellum_profiler.py'),
]

/** N'importe quel champ, cherché comme identifiant entier (pas une sous-chaîne). */
function referencesField(source: string, field: string): boolean {
  return new RegExp(`\\b${field}\\b`).test(source)
}

describe('#2059.9/.10 — l’attribution marketing ne pèse dans AUCUN chemin de notation', () => {
  it('lit vraiment `esnAnswersToProfileData` — le corpus n’est pas vide', () => {
    const source = esnAnswersToProfileDataSource()
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain('out.sectors')
  })

  it('`esnAnswersToProfileData` ne lit jamais `heard_about_bellum`', () => {
    expect(referencesField(esnAnswersToProfileDataSource(), FORBIDDEN_FIELD)).toBe(false)
  })

  it('sait dire NON — une fixture SYNTHÉTIQUE qui ajoute le champ au pont rougit', () => {
    // Fixture locale, jamais le vrai fichier : prouve que le test AURAIT
    // détecté la faute si `esnAnswersToProfileData` avait lu le champ.
    const synthetic = `${esnAnswersToProfileDataSource()}\n  if (answers.heard_about_bellum) out.heardAboutBellum = answers.heard_about_bellum\n`
    expect(referencesField(synthetic, FORBIDDEN_FIELD)).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — `target_sectors` (qui DOIT noter) passe sans rougir', () => {
    expect(referencesField(esnAnswersToProfileDataSource(), LEGITIMATE_NEIGHBOUR_FIELD)).toBe(true)
  })

  it.each(IA_PROMPT_PATHS)('%s — le contexte envoyé au modèle ne porte jamais le champ', path => {
    const source = readFileSync(path, 'utf8')
    // Le corpus n'est pas vide : une garde qui lit un fichier vide passe au
    // vert pour toujours.
    expect(source.length).toBeGreaterThan(200)
    expect(referencesField(source, FORBIDDEN_FIELD)).toBe(false)
  })

  it('les trois fichiers IA surveillés existent tous — une entrée périmée ne garde plus rien', () => {
    for (const path of IA_PROMPT_PATHS) {
      expect(() => readFileSync(path, 'utf8')).not.toThrow()
    }
  })
})
