import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS, creditCostOf, type CreditedAction } from '../billing/credit-weights.js'
import { PLAN_FEATURE_KEYS } from './plan-features.js'
import { LAUNCHER_TYPES, LAUNCHER_TYPE_ORDER, launcherRunCost, launcherTypeOf, runsOfType } from './launcher.js'

describe('le catalogue du lanceur', () => {
  it('n’annonce que des types qui ont au moins un run', () => {
    for (const type of LAUNCHER_TYPES) {
      expect(runsOfType(type.key).length).toBeGreaterThan(0)
    }
  })

  it('ne porte AUCUN nombre de crédits — il porte une action, le prix vit ailleurs', () => {
    // La loi « un réglage vit à un seul endroit » appliquée au prix : si le
    // catalogue portait « 8 », la barre de lancement et le panneau de
    // confirmation pourraient diverger, et c'est exactement le défaut de
    // production du 02/08 (annoncé 1, débité 8).
    const source = JSON.stringify(LAUNCHER_TYPES)
    expect(source).not.toMatch(/"credits?":\s*\d/)

    for (const type of LAUNCHER_TYPES) {
      for (const run of type.runs) {
        expect(Object.keys(CREDIT_WEIGHTS)).toContain(run.action)
      }
    }
  })

  it('fait dire au matching de besoin qu’il est GRATUIT', () => {
    // Ce zéro n'est pas un détail d'affichage : le matching est déterministe et
    // reproductible (PDF 4), et c'est le seul endroit du produit où on peut le
    // dire. Aujourd'hui personne ne le lit.
    const run = runsOfType('need').find(r => r.action === 'need_matching')
    expect(run).toBeDefined()
    expect(launcherRunCost(run!)).toBe(0)
  })

  it('facture l’enrichissement de contact au SUCCÈS seulement', () => {
    // « 0 résultat = 0 débit » est la garantie annoncée sur la carte avant le
    // clic ; un lanceur qui annonce « 1 crédit » sec la reprendrait en silence.
    const run = runsOfType('contact').find(r => r.action === 'contact_enrichment')
    expect(run?.billedOnSuccessOnly).toBe(true)
    expect(launcherRunCost(run!)).toBe(1)
  })

  it('n’accepte un nom INCONNU que sur le compte', () => {
    // On peut analyser une entreprise qu'on n'a jamais ouverte ; on ne peut pas
    // enrichir un contact qui n'existe pas, ni matcher un besoin qui n'est pas
    // saisi. Promettre le contraire produirait « aucun résultat » là où la
    // vraie réponse est « cet objet n'existe pas encore ».
    const open = LAUNCHER_TYPES.filter(t => t.acceptsUnknown).map(t => t.key)
    expect(open).toEqual(['account'])
  })

  it('rattache chaque type à une clé de palier qui EXISTE', () => {
    for (const type of LAUNCHER_TYPES) {
      if (type.feature === null) continue
      expect(PLAN_FEATURE_KEYS).toContain(type.feature)
    }
  })

  it('ne fait porter deux fois la même clé ni à un type ni à un run', () => {
    const typeKeys = LAUNCHER_TYPES.map(t => t.key)
    expect(new Set(typeKeys).size).toBe(typeKeys.length)

    const runKeys = LAUNCHER_TYPES.flatMap(t => t.runs.map(r => r.key))
    expect(new Set(runKeys).size).toBe(runKeys.length)
  })

  it('garde son ORDRE — les chips sont une barre, pas un ensemble', () => {
    // Même raison que GA-08 : l'ordre est une décision d'interface (le compte
    // d'abord parce que c'est 90 % des lancements), et un tri qui bougerait
    // d'un rendu à l'autre déplacerait la cible sous le curseur.
    expect(LAUNCHER_TYPES.map(t => t.key)).toEqual(LAUNCHER_TYPE_ORDER)
    // #2149.27 — reformulé (RÉFUTÉ prod 23/09, doctrine #2486) : le territoire
    // a QUITTÉ le catalogue (décision Louis 16/09/2026, #2486, commit
    // 04b8c8fb4 : « le bouton Territoire ET le panneau qu'il ouvrait quittent
    // Découvrir »), il n'y revient pas déguisé en 5e sortie. Le run laissé ici
    // pointait sur `/discover/territoire`, une route qui n'a jamais existé sur
    // le disque, puis ne servait plus qu'à ouvrir `/discover` nu — un lanceur
    // qui menait nulle part, puis un lanceur qui ne fait rien de plus que
    // l'absence de lanceur (doctrine GA-38, GA-87).
    expect(LAUNCHER_TYPE_ORDER).toEqual(['account', 'contact', 'need', 'talent'])
  })

  it('retrouve un type par sa clé, et rend `undefined` sur une clé inventée', () => {
    expect(launcherTypeOf('need')?.key).toBe('need')
    expect(launcherTypeOf('licorne' as never)).toBeUndefined()
  })

  it('retire le champ de saisie plutôt que de jeter une frappe', () => {
    // `queryParam: null` veut dire « ce run ne se cherche pas au clavier ».
    // #2149.27 — le territoire, seul cas connu, a quitté le catalogue (#2486) :
    // plus aucun run ne se passe de saisie aujourd'hui, et c'est un fait, pas
    // un oubli — le jour où un nouveau run l'exigera, cette liste grossira.
    const sansSaisie = LAUNCHER_TYPES.flatMap(t => t.runs).filter(r => r.queryParam === null)
    expect(sansSaisie.map(r => r.key)).toEqual([])
  })

  // #2149.27 — « le territoire pointe vers /discover, pas vers l'écran retiré
  // le 10/09 (#1796.2) » testait un run qui a lui-même quitté le catalogue le
  // 23/09/2026 (#2486 : le bouton et le panneau ont quitté Découvrir, le run
  // ne faisait plus qu'ouvrir `/discover` nu). Rien à garder ici sans fabriquer
  // une clé de catalogue qui n'existe plus.

  it('n’envoie le texte tapé que par un paramètre que la ROUTE accepte', () => {
    // Les deux noms viennent des schémas de route existants : `/search` lit
    // `company`, les listes lisent `q`. En inventer un troisième produirait une
    // URL que TanStack Router écarte en silence — donc une liste non filtrée
    // qui se lit « aucun résultat ».
    const params = new Set(
      LAUNCHER_TYPES.flatMap(t => t.runs)
        .map(r => r.queryParam)
        .filter((p): p is string => p !== null),
    )
    expect([...params].sort()).toEqual(['company', 'q'])
  })

  it('n’écrit jamais `:` dans une clé i18n — ce serait un espace de noms', () => {
    // Leçon déjà payée : cinq raisons d'exclusion sont devenues muettes parce
    // qu'un `:` dans la clé envoyait i18next chercher un autre espace de noms.
    const keys = LAUNCHER_TYPES.flatMap(t => t.runs.map(r => r.labelKey))
    for (const key of keys) expect(key).not.toContain(':')
  })

  it('fait passer chaque run par une route de DESTINATION non vide', () => {
    for (const type of LAUNCHER_TYPES) {
      for (const run of type.runs) {
        expect(run.to.startsWith('/')).toBe(true)
      }
    }
  })
})

describe('le prix d’un run', () => {
  it('se lit dans la table des poids et nulle part ailleurs', () => {
    const actions = LAUNCHER_TYPES.flatMap(t => t.runs.map(r => r.action))
    for (const action of actions) {
      const run = LAUNCHER_TYPES.flatMap(t => t.runs).find(r => r.action === action)!
      expect(launcherRunCost(run)).toBe(creditCostOf(action as CreditedAction))
    }
  })
})
