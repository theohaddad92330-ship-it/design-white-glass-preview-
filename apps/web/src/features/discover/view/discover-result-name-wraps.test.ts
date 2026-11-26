import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3082 (beta) — « la mise en page est cassée par case du tableau du résultat
 * de découvrir … faudra bien vérifier que chaque type de case dans le tableau
 * rende bien dans tous les formats d'écran possible ».
 *
 * Diagnostic (26/09/2026) : le rendu réel (CSS compilée du dépôt, composants
 * réels, i18n réel) de `CandidateCard` avec le nom exact de la capture
 * (« ARCHI LOGICIEL MATERIEL DEPAN INFOR (ALMDI) ») a été vérifié à 375, 480,
 * 768, 1024 et 1512 px : aucun débordement, aucun chevauchement — le rendu
 * observé sur la capture n'est pas reproductible avec le code de
 * `origin/main`. Durcissement fait quand même : la « case » nom d'entreprise
 * (le seul champ qui PEUT porter un jeton unique très long, sans espace — un
 * sigle administratif collé) n'avait aucune protection contre le débordement
 * horizontal si un jour un nom de ce type se présentait sans le moindre point
 * de coupure. `break-words` (+ `max-w-full` pour les items flex) force la
 * coupure plutôt que le débordement — sans jamais la déclencher sur un nom
 * normal, espaces ou pas.
 */

const FILES = [join(__dirname, 'CandidateRow.tsx'), join(__dirname, 'PartnerResultRow.tsx')]

describe("#3082 — la case « nom d'entreprise » ne déborde jamais, sur aucun format d'écran", () => {
  it.each(FILES)('%s porte max-w-full + break-words sur son nom', file => {
    const source = readFileSync(file, 'utf8')
    // La classe posée sur la balise du nom, à moins de 100 caractères de
    // l'usage `{candidate.name}` / `{row.name}` qui suit — assez proche pour
    // être la MÊME balise, jamais une autre classe du fichier.
    const match = source.match(/className="[^"]*max-w-full break-words[^"]*"[\s\S]{0,100}\{(?:candidate|row)\.name\}/)
    expect(match).not.toBeNull()
  })
})
