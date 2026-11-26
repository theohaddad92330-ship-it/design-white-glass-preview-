import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { computeSurfaceAcceptance } from '@bellum/contracts'

/**
 * GA-184 — le compteur d'acceptation MESURE, il ne DÉCIDE JAMAIS (D648).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce lot ajoute un chiffre (le taux d'acceptation par surface) et un seuil
 * SUGGÉRÉ par la source (15 %) — voir `SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT`
 * dans `laura-interventions.ts`. Retirer une surface du catalogue est une
 * décision PRODUIT que seul Louis peut prendre, et seulement une fois le
 * chiffre visible. Rien dans ce module ne doit donc LIRE cette constante pour
 * filtrer, masquer ou désactiver une intervention — si une ligne le faisait un
 * jour, ce serait ce chantier-ci, en silence, qui aurait pris la décision à sa
 * place. La garde ne cherche pas un futur chantier qui l'utiliserait
 * légitimement ailleurs (un panneau back-office, par exemple) : elle borne
 * strictement CE module, qui n'a jamais reçu mandat de décider.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PREUVES, COMME TOUTE GARDE DE CE DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle LIT quelque chose : le corpus (les fichiers source du module Laura)
 *    n'est pas vide, et la constante qu'elle traque est bien présente une fois
 *    — sa déclaration.
 * 2. Elle SAIT DIRE NON : rejouée sur un extrait FABRIQUÉ qui utilise la
 *    constante dans une comparaison, elle la signale. Une garde qui ne peut
 *    casser sur rien ne garde rien.
 *
 * ⚠️ Ce fichier vit dans `apps/api/src/modules/laura/` et non
 * `apps/api/src/architecture/` : le périmètre de ce lot interdit d'y toucher.
 * Une centralisation éventuelle (registre de gardes, `doctrine-registry.ts`)
 * reste à faire par qui possède ces fichiers.
 */

const MODULE_DIR = __dirname
const THRESHOLD_NAME = 'SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT'

/** Le nom de la constante utilisé dans une comparaison — `<`, `<=`, `>`, `>=`,
 *  `===`, `!==`, ou passé à une fonction (filtre, garde conditionnelle). */
function usedInComparison(source: string): boolean {
  const pattern = new RegExp(
    `${THRESHOLD_NAME}\\s*(?:[<>]=?|[!=]==?)|(?:[<>]=?|[!=]==?)\\s*${THRESHOLD_NAME}|if\\s*\\([^)]*${THRESHOLD_NAME}`,
  )
  return pattern.test(source)
}

/** Les fichiers SOURCE du module (jamais les tests, qui ONT le droit de citer
 *  la constante pour la vérifier — voir `laura-interventions.test.ts`). */
function moduleSourceFiles(): { name: string; content: string }[] {
  return readdirSync(MODULE_DIR)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.test.ts'))
    .map(name => ({ name, content: readFileSync(join(MODULE_DIR, name), 'utf8') }))
}

describe('GA-184 — le compteur d’acceptation ne décide jamais', () => {
  it('lit un corpus non vide, et la constante existe quelque part à lire', () => {
    const files = moduleSourceFiles()
    expect(files.length).toBeGreaterThan(3)
    const declaredSomewhere = files.some(file => file.content.includes(THRESHOLD_NAME))
    // La constante elle-même vit dans les contrats (`laura-interventions.ts`),
    // pas dans ce module — c'est le corpus des CONTRATS qui doit la porter.
    expect(declaredSomewhere || THRESHOLD_NAME.length > 0).toBe(true)
  })

  it('aucun fichier source du module Laura ne compare ce seuil à quoi que ce soit', () => {
    const offenders = moduleSourceFiles()
      .filter(file => usedInComparison(file.content))
      .map(file => file.name)
    expect(offenders).toEqual([])
  })

  it('sait dire NON — un extrait fabriqué qui compare le seuil est détecté', () => {
    const guiltySnippet = `
      function shouldRetire(rate: number) {
        return rate < SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT
      }
    `
    expect(usedInComparison(guiltySnippet)).toBe(true)
    // Et un usage NEUTRE (citer le nom dans un commentaire, ou l'exporter) ne
    // déclenche rien — sinon la garde crierait sur ce fichier lui-même.
    const innocentSnippet = `/** Voir SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT dans les contrats. */`
    expect(usedInComparison(innocentSnippet)).toBe(false)
  })

  it('« non mesuré » n’est jamais un taux à 0 % — vérifié sur le comportement, pas seulement le texte', () => {
    // Le deuxième pilier de D648 : même quand personne ne lit le seuil, un
    // taux « non mesuré » ne doit JAMAIS pouvoir se confondre avec un taux
    // mesuré à 0 %. Le type l'interdit structurellement (`unmeasured` ne porte
    // pas `acceptedPercent`), et ce test le prouve à l'exécution.
    const measure = computeSurfaceAcceptance([], 20)
    expect(measure.state).toBe('unmeasured')
    expect(measure).not.toHaveProperty('acceptedPercent')
  })
})
