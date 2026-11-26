import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { METHOD_CORPUS_RUNTIME_GOVERNANCE } from './method-corpus.js'

/**
 * #3274.3 — la parité TypeScript ↔ JSON ↔ Python.
 *
 * `apps/ia/app/services/method_knowledge.py` ne peut pas importer ce module
 * (racine Railway = `apps/ia`, `packages/` hors de son contexte de build), donc
 * l'activation d'une règle voyage en JSON versionné — même mécanique que
 * `ingestion-guard.constants.json`. Ce test garantit que le JSON commité est
 * bien une PHOTO de `METHOD_CORPUS_V1` au moment du build, jamais une copie
 * tapée à la main qui pourrait diverger silencieusement.
 */
const SNAPSHOT_PATH = new URL('./method-corpus.runtime-governance.json', import.meta.url)

function readSnapshot(): unknown {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
}

describe('METHOD_CORPUS_RUNTIME_GOVERNANCE — le miroir JSON pour apps/ia', () => {
  it('le snapshot commité est identique à la valeur calculée depuis METHOD_CORPUS_V1', () => {
    const snapshot = readSnapshot()
    // JSON.parse(JSON.stringify(...)) : même round-trip que le snapshot lui-même,
    // pour comparer deux valeurs JSON pures (pas des tuples readonly TS).
    expect(snapshot).toEqual(JSON.parse(JSON.stringify(METHOD_CORPUS_RUNTIME_GOVERNANCE)))
  })

  it('couvre CHAQUE règle de la gouvernance, sans orphelin ni doublon', () => {
    const ids = METHOD_CORPUS_RUNTIME_GOVERNANCE.map(entry => entry.rule_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(0)
  })

  it('nomme au moins une entrée désactivée — la preuve que ce test lit vraiment quelque chose', () => {
    // Un JSON vidé ou une gouvernance qui n'exclurait plus rien rendrait toute
    // garde de désactivation vraie par vacuité.
    const inactive = METHOD_CORPUS_RUNTIME_GOVERNANCE.filter(entry => entry.superseded || !entry.enabled)
    expect(inactive.length).toBeGreaterThan(0)
    expect(inactive.map(entry => entry.rule_id)).toContain('bellum_accelere_mais_ne_pense_pas')
  })

  it('les 21 règles INVARIANT (feature_flag_key null) restent la seule tranche active sans flag', () => {
    // Les 162 règles SalesConnect portent TOUTES un feature_flag_key (#3250) :
    // tant qu'aucune source de flags n'existe côté apps/ia (ce lot ne l'invente
    // pas), `resolveRuleActivation` les exclut. Seules les entrées sans flag
    // peuvent être actives — ce sont exactement les 20 invariants/politiques adaptatives sans flag + l'exemple
    // SUPERSEDED (lui, exclu par `superseded`, pas par le flag).
    const withoutFlag = METHOD_CORPUS_RUNTIME_GOVERNANCE.filter(entry => entry.feature_flag_key === null)
    expect(withoutFlag).toHaveLength(21)
    const activeWithoutFlag = withoutFlag.filter(entry => entry.enabled && !entry.superseded)
    expect(activeWithoutFlag).toHaveLength(20)
  })
})
