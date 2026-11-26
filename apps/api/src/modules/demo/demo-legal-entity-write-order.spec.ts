import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2869 (lot V5, 28/09/2026) — LA SOCIÉTÉ DU CONTRAT S'ÉCRIT AVANT D'ÊTRE LUE.
 *
 * Mesuré au code : le contrat juridique de démonstration (Société Générale,
 * `legal_contracts`, #2422.4) résolvait sa société (`legal_entity_id`) par un
 * `SELECT` sur `legal_entities`, alors que l'`INSERT` des deux sociétés de
 * l'ESN (`DEMO_LEGAL_ENTITIES`, bloc `legalEntityIds`) vivait PLUS BAS dans le
 * même fichier — après, donc, dans l'ordre d'exécution d'une fonction
 * `async` sans parallélisme. Sur une salle JAMAIS encore semée, le `SELECT`
 * ne trouvait rien : `legal_entity_id` partait `null`, la fiche affichait
 * « société non mesurée », et le NO-GO (#2422.11) ne pouvait jamais comparer
 * deux sociétés puisque l'une était systématiquement absente — un écran
 * livré mais vide, l'exact défaut que la parité démo existe pour empêcher.
 *
 * ⚠️ jsdom / Jest ne rejouent pas l'ordre d'exécution d'une requête SQL
 * mockée par défaut (`manager.query` rend `[]` pour toute requête, qu'elle
 * arrive avant ou après une autre) : un test qui APPELLERAIT `seedWorkspace`
 * ne verrait donc PAS la régression, dans un sens comme dans l'autre. Ce qui
 * est vérifiable sans base de données, c'est l'ORDRE ÉCRIT dans le fichier —
 * la garde lit donc le SOURCE, comme `chat-mise-en-page.test.ts` le fait déjà
 * pour un autre défaut d'ordre.
 */
const SOURCE = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

/** `true` si les sociétés (`legalEntityIds`) s'écrivent avant le contrat qui les lit. */
function entitiesWrittenBeforeContract(source: string): boolean {
  const entities = source.indexOf('for (const entity of DEMO_LEGAL_ENTITIES)')
  const contract = source.indexOf('INSERT INTO legal_contracts')
  if (entities < 0 || contract < 0) throw new Error('repère introuvable — la garde ne lit plus rien')
  return entities < contract
}

describe('#2869 — les sociétés de l’ESN s’écrivent avant le contrat qui les nomme', () => {
  it('lit bien les deux repères : les sociétés une seule fois, au moins un contrat', () => {
    expect(SOURCE.split('for (const entity of DEMO_LEGAL_ENTITIES)')).toHaveLength(2)
    // #2422.6 (lot R24) pose un DEUXIÈME contrat, sur le dossier porteur, pour
    // le lien signé : il lit lui aussi `legalEntityIds`. La garde vérifie donc
    // que le PREMIER contrat (`indexOf`) suit les sociétés — tous les suivants
    // aussi, par construction.
    expect(SOURCE.split('INSERT INTO legal_contracts').length).toBeGreaterThanOrEqual(2)
  })

  it('le bloc des sociétés précède le contrat Société Générale qui les lit', () => {
    expect(entitiesWrittenBeforeContract(SOURCE)).toBe(true)
  })

  it('le contrat lit `legalEntityIds`, il ne relit plus `legal_entities` par un SELECT à part', () => {
    const contract = SOURCE.indexOf('INSERT INTO legal_contracts')
    const next = SOURCE.indexOf('INSERT INTO legal_contracts', contract + 1)
    const window = SOURCE.slice(contract, next < 0 ? contract + 1500 : next)
    expect(window).toContain("legalEntityIds.get('BELLUM CONSEIL")
    expect(window).not.toContain('SELECT id FROM legal_entities')
  })

  it('sait dire NON : l’ordre INVERSE — le défaut mesuré — est refusé', () => {
    const avant = `
      if (flagshipAccountId) {
        await this.accounts.manager.query(\`SELECT id FROM legal_entities WHERE ...\`)
        await this.accounts.manager.query(\`INSERT INTO legal_contracts (...) VALUES (...)\`)
      }
      const legalEntityIds = new Map()
      for (const entity of DEMO_LEGAL_ENTITIES) {
        await this.accounts.manager.query(\`INSERT INTO legal_entities (...) VALUES (...)\`)
      }
    `
    expect(entitiesWrittenBeforeContract(avant)).toBe(false)
  })
})
