import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_LAURA_GESTURES_COVERAGE } from './demo-coverage'

/**
 * #2470 / #2471 — « et en démonstration, Laura propose quoi ? »
 *
 * Les deux gestes nommés (tour d'horizon et analyse de fond) n'ont aucune table,
 * aucune colonne, aucune clé de `raw_analysis` : la garde PAR TABLE ne pose
 * jamais la question, et c'est le silence exact qui fait découvrir une capacité
 * vide en réunion plutôt qu'en CI (craft rule n°9).
 *
 * ⚠️ Elle LIT le script réel de la salle (`demo-chat-script.ts`, côté web) et
 * non une liste recopiée : une liste recopiée ne voit jamais ce qui n'y est pas.
 *
 * ⚠️ Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer ce
 * test. La raison doit tenir devant quelqu'un qui présente le produit.
 */

const SCRIPT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts')

/** Le SEUL bloc du tour d'horizon : de `p-market-sweep` jusqu'à l'entrée suivante du
 *  script (intégration M, 09/10) — sans quoi toute entrée ajoutée APRÈS lui (ex. la
 *  recherche de personnes de M05 sur le dossier SNCF) était lue comme du tour d'horizon. */
function marketSweepBlock(): string {
  const after = script().split("id: 'p-market-sweep'")[1] ?? ''
  return after.split(/\n {2}\{\n/)[0] ?? ''
}

function script(): string {
  return readFileSync(SCRIPT, 'utf8')
}

/** Les amorces proposées au visiteur, lues dans le script lui-même. */
function amorces(): string[] {
  return [...script().matchAll(/id: '([^']+)'/g)].map(match => match[1])
}

describe('couverture démo — les deux gestes de Laura (#2470, #2471)', () => {
  it('LIT un corpus non vide — sans ça, la garde passerait au vert sur du vide', () => {
    const ids = amorces()
    expect(ids.length).toBeGreaterThan(2)
    expect(Object.keys(DEMO_LAURA_GESTURES_COVERAGE)).toEqual(['tourHorizon', 'analyseDeFond', 'appelsQuiRecrutent'])
    // Contrôle positif : l'amorce qui porte les deux gestes existe VRAIMENT.
    // Sans elle, tout le reste du fichier serait vert sans rien vérifier.
    expect(ids).toContain('p-market-sweep')
  })

  it('la réponse préparée NOMME les deux gestes, dans la même bulle', () => {
    // Si ce test tombe : la salle montre un geste et tait l'autre — c'est le
    // défaut exact que #2471 remonte (« proposer découvrir … mais aussi et
    // surtout une vraie analyse »).
    const source = script()
    const manquants = ['le tour d’horizon', 'l’analyse de fond'].filter(geste => !source.includes(geste))
    expect(manquants).toEqual([])
  })

  it('le tour d’horizon rend une CARTE, pas une phrase', () => {
    // Le retour #2470 demandait que la recherche « alimente la conversation ».
    // Une réponse en prose ne le fait pas : la carte `account_ranking` porte la
    // liste, ses axes et ce qui n'a pas pu être évalué.
    const sweep = marketSweepBlock()
    expect(sweep.length).toBeGreaterThan(0)
    expect(sweep).toContain("type: 'account_ranking'")
    expect(sweep).toContain('axes:')
    expect(sweep).toContain('not_evaluated:')
  })

  // #4463/#4468 (crédits implicites) — la salle ne dit plus aucun coût : ni « aucun crédit débité », ni
  // « coûte des crédits », ni montant. Le débit continue en coulisse, l'écran n'en parle pas.
  it('la salle ne dit aucun crédit, ni coût ni montant', () => {
    const sweep = marketSweepBlock()
    expect(sweep.length).toBeGreaterThan(0)
    expect(sweep).not.toMatch(/cr[ée]dits?/i)
  })

  it('la salle ne cite aucune société réelle dans le tour d’horizon', () => {
    // Le registre ne répond pas à une salle de démonstration : toute entreprise
    // montrée ici est fabriquée, donc elle se NOMME comme telle. C'est la même
    // règle que la recherche scriptée de `/discover`.
    const sweep = marketSweepBlock()
    const noms = [...sweep.matchAll(/name: '([^']+)'/g)].map(match => match[1])
    expect(noms.length).toBeGreaterThan(0)
    expect(noms.filter(nom => !nom.endsWith('(démo)'))).toEqual([])
  })

  it('LC.6 — « avec qui appeler » : chaque entreprise cite son signal daté et sa personne, ou « à trouver »', () => {
    const block = (script().split("id: 'p-call-hiring'")[1] ?? '').split(/\n {2}\{\n/)[0] ?? ''
    expect(block).toContain("type: 'account_ranking'")
    expect(block).toContain('Signal daté :')
    expect(block).toContain('À appeler :')
    expect(block).toContain('Personne connue : à trouver')
    const noms = [...block.matchAll(/name: '([^']+)'/g)].map(match => match[1])
    expect(noms.length).toBeGreaterThan(0)
    expect(noms.filter(nom => !nom.endsWith('(démo)'))).toEqual([])
  })

  it('exige une raison SUBSTANTIELLE pour tout geste laissé vide à dessein', () => {
    const tropCourtes = Object.entries(DEMO_LAURA_GESTURES_COVERAGE)
      .filter(([, entree]) => entree.state !== 'seede' && entree.reason.length <= 200)
      .map(([geste]) => geste)
    expect(tropCourtes).toEqual([])
  })

  it('n’attrape PAS ce qu’elle ne vise pas — les autres amorces n’ont aucun geste à porter', () => {
    // Témoin de cas légitime voisin : « Quels signaux justifient de prioriser
    // SNCF ? » est une lecture de dossier, pas une recherche de comptes. Une
    // garde qui exigerait les deux gestes sur TOUTE réponse de la salle ferait
    // de Laura une vendeuse d'analyses à chaque phrase.
    const signals = script().split("id: 'p-signals'")[1]?.split("id: '")[0] ?? ''
    expect(signals.length).toBeGreaterThan(0)
    expect(signals).not.toContain('le tour d’horizon')
    expect(signals).not.toContain('l’analyse de fond')
  })
})
