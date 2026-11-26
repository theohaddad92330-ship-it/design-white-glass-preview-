import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INVOICE_BLOCKERS, type InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  MISSION_CHAIN_DESTINATIONS,
  MISSION_CHAIN_STEPS,
  deriveMissionChain,
  missingChainSteps,
  type MissionChainInput,
} from '@/features/missions/chain/missionChain'

/**
 * GA-351 — LA CHAÎNE D'UNE MISSION REND SES CINQ ÉTAPES, ET CHACUNE MÈNE À UN
 * ÉCRAN QUI EXISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QU'ELLE PROTÈGE (#2199, décision de Louis du 16/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une chaîne COMPACTE dans le dossier Mission, montrant les cinq étapes, où
 * en est la mission et ce qui la bloque — chaque étape menant à l'écran qui
 * existe DÉJÀ. On ne recode aucun écran : on les relie. »
 *
 * Trois choses se cassent silencieusement ici, et ce sont les trois que cette
 * garde surveille :
 *
 *  1. une étape DISPARAÎT de la chaîne (une branche qui rend `null`, un filtre
 *     mal placé) — et la chaîne se lit alors « il n'y a que quatre étapes »,
 *     l'absente étant justement celle dont personne ne s'occupe ;
 *  2. une destination est RENOMMÉE côté routes — le maillon mène sur « Page
 *     introuvable », ce qui est pire qu'un maillon sans porte : le premier fait
 *     douter du produit entier ;
 *  3. une étape NON MESURÉE se rend comme une étape FRANCHIE — le défaut le
 *     plus probable des trois, parce qu'une donnée absente et une donnée
 *     satisfaisante se ressemblent beaucoup à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas si l'écran de destination RÉPARE effectivement l'étape — ça
 * demanderait de reconnaître un geste métier dans du JSX, et c'est la limite
 * que `adv-blockers-lead-somewhere` s'est déjà fixée. Ce qu'elle sait dire est
 * exact : la porte existe, ou elle n'existe pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES, ET LE ROUGE EXACT DE CHACUNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde doit savoir dire NON, LIRE quelque chose, et ne pas attraper ce
 * qu'elle ne vise pas. Les messages ci-dessous ont été VUS en rouge, en cassant
 * volontairement le code protégé le 16/09/2026 :
 *
 *  - étape retirée (`deriveMissionChain` amputé de son maillon `collection`) :
 *      « La chaîne ne rend pas ces étapes : collection »
 *      → `AssertionError: expected [ 'collection' ] to deeply equal []`
 *  - destination inventée (`collection: { route: '/missions/encaissement' }`) :
 *      « Étapes dont la destination n'existe pas dans l'arbre de routes :
 *        collection → /missions/encaissement »
 *  - témoin du zéro (`timesheetLink` rendant `done` sur une lecture absente) :
 *      « Étapes rendues FRANCHIES sans aucune donnée : timesheet »
 */

const SRC = join(__dirname, '..')
const ROUTE_TREE = readFileSync(join(SRC, 'routeTree.gen.ts'), 'utf8')
const STRIP = readFileSync(join(SRC, 'features', 'missions', 'chain', 'view', 'MissionChainStrip.tsx'), 'utf8')

/** Les chemins déclarés par l'arbre — extraits des lignes `path: '/…'` qu'il
 *  génère, jamais d'une liste tenue à la main : une liste recopiée ne voit pas
 *  la route qu'on vient de renommer, et reste verte. */
function declaredRoutes(): Set<string> {
  return new Set([...ROUTE_TREE.matchAll(/^\s*path: '([^']+)'/gm)].map(match => match[1] as string))
}

const NOW = new Date('2026-09-16T12:00:00.000Z')

function readiness(overrides: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Mission de contrôle',
    accountName: 'Compte de contrôle',
    accountId: '22222222-2222-4222-8222-222222222222',
    periodMonth: '2026-08-01',
    state: 'blocked',
    blockers: ['missing_po'],
    days: null,
    preparedAmountCents: null,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...overrides,
  }
}

/** Une mission MESURÉE de bout en bout : c'est sur elle que se vérifient les
 *  destinations, parce qu'une chaîne sans données n'ouvre presque aucune porte
 *  et ne prouverait donc rien. */
function measured(): MissionChainInput {
  return {
    mission: { renewal: 'j30' },
    readiness: readiness(),
    readinessKnown: true,
    consultantId: '33333333-3333-4333-8333-333333333333',
    now: NOW,
  }
}

/** Ce qu'on ne sait pas : aucune ligne du mois, aucune échéance transmise. */
function unmeasured(): MissionChainInput {
  return { mission: {}, readiness: undefined, readinessKnown: false, consultantId: null, now: NOW }
}

describe('GA-351 — la chaîne d’une mission mène quelque part', () => {
  const routes = declaredRoutes()

  /* ---------------------------------------------------------------------- */
  /*  PREUVE 2 — elle LIT quelque chose                                      */
  /* ---------------------------------------------------------------------- */

  it('la garde LIT un corpus non vide — cinq étapes, quatorze motifs, un arbre de routes', () => {
    // Sans ce contrôle, un arbre tronqué, une taxonomie vidée ou un motif
    // d'extraction cassé rendraient tous les tests ci-dessous verts en ne
    // vérifiant plus rien. Les nombres sont écrits pour qu'on les VOIE bouger.
    expect(MISSION_CHAIN_STEPS.length, `étapes lues : ${MISSION_CHAIN_STEPS.length}`).toBe(5)
    expect(INVOICE_BLOCKERS.length, `motifs de blocage lus : ${INVOICE_BLOCKERS.length}`).toBe(14)
    expect(routes.size, `routes lues dans l’arbre : ${routes.size}`).toBeGreaterThan(20)
    expect(STRIP.length, `caractères lus dans la bande : ${STRIP.length}`).toBeGreaterThan(1000)
    // Et la chaîne rend bien quelque chose sur une mission mesurée : un tableau
    // vide passerait « aucune étape manquante » et « aucune porte morte ».
    expect(deriveMissionChain(measured()).length).toBe(5)
  })

  /* ---------------------------------------------------------------------- */
  /*  PREUVE 1 — elle sait dire NON                                          */
  /* ---------------------------------------------------------------------- */

  it('les cinq étapes sont rendues, mesurées ou non', () => {
    for (const input of [measured(), unmeasured()]) {
      const missing = missingChainSteps(deriveMissionChain(input))
      expect(missing, `La chaîne ne rend pas ces étapes : ${missing.join(', ')}`).toEqual([])
    }
  })

  it('elle sait dire NON — une chaîne amputée NOMME l’étape qui manque', () => {
    // La preuve qu'elle mord : on retire un maillon et on vérifie que le
    // détecteur le nomme. Sans cette assertion, on ne saurait pas distinguer
    // « toutes les étapes sont là » de « le détecteur ne détecte rien ».
    const amputated = deriveMissionChain(measured()).filter(item => item.step !== 'collection')
    expect(missingChainSteps(amputated)).toEqual(['collection'])
    // …et il ne nomme QUE celle-là : une garde qui rendrait toujours toute la
    // taxonomie serait bruyante au point d'être ignorée.
    expect(missingChainSteps(deriveMissionChain(measured()))).toEqual([])
  })

  it('chaque étape rendue POINTE vers une route déclarée dans l’arbre', () => {
    const dangling = deriveMissionChain(measured())
      .filter(item => item.route !== null && !routes.has(item.route))
      .map(item => `${item.step} → ${item.route}`)
    expect(dangling, `Étapes dont la destination n’existe pas dans l’arbre de routes : ${dangling.join(', ')}`).toEqual(
      [],
    )
    // La table elle-même, et pas seulement ce qu'une mission de contrôle rend :
    // une étape qu'aucun état de ce test ne fait apparaître garde sa porte.
    const declared = MISSION_CHAIN_STEPS.filter(step => !routes.has(MISSION_CHAIN_DESTINATIONS[step].route))
    expect(declared, `Destinations absentes de l’arbre : ${declared.join(', ')}`).toEqual([])
  })

  it('elle sait dire NON sur une route — une destination inventée est refusée', () => {
    // Sans cette assertion, « toutes les routes sont bonnes » et « l'ensemble
    // des routes est vide » se ressembleraient exactement.
    expect(routes.has('/missions/encaissement')).toBe(false)
    expect(routes.has('/missions/encaissements')).toBe(true)
  })

  /* ---------------------------------------------------------------------- */
  /*  PREUVE 3 — LE TÉMOIN : « non mesuré » n'est ni « 0 » ni « fait »       */
  /* ---------------------------------------------------------------------- */

  it('une mission sans donnée ne rend AUCUNE étape franchie — elle dit qu’elle ne sait pas', () => {
    const chain = deriveMissionChain(unmeasured())
    const claimed = chain.filter(item => item.state === 'done').map(item => item.step)
    expect(claimed, `Étapes rendues FRANCHIES sans aucune donnée : ${claimed.join(', ')}`).toEqual([])
    for (const item of chain) {
      expect(item.state).toBe('not_measured')
      // « Non mesuré » répond à « combien ? », pas à « pourquoi je ne sais
      // pas ? » — et c'est la seconde qui dit s'il y a un geste à faire.
      expect(item.reasonKey, `L’étape « ${item.step} » dit « non mesuré » sans dire pourquoi.`).not.toBeNull()
    }
  })

  it('aucun maillon ne porte de NOMBRE — ni compte de blocages, ni taux d’avancement', () => {
    // « 2 blocages » envoie ouvrir trois écrans pour savoir lesquels, et
    // « 3 étapes sur 5 » serait un taux de complétude de NOS données déguisé en
    // avancement d'une mission — c'est-à-dire la probabilité refusée six fois.
    for (const item of deriveMissionChain(measured())) {
      for (const value of Object.values(item)) expect(typeof value).not.toBe('number')
    }
  })

  it('la bande rend « non mesuré » par la primitive, et n’écrit jamais un zéro de repli', () => {
    // La dérivation peut être juste et l'écran écrire `{value ?? 0}` : tout le
    // travail est alors perdu à la dernière ligne. C'est exactement ce que la
    // règle « une valeur absente ne s'affiche JAMAIS 0 » a déjà payé.
    expect(STRIP).toContain('UnknownValue')
    expect(STRIP).toContain("link.state === 'not_measured'")
    expect(stripComments(STRIP)).not.toMatch(/\?\?\s*0\b|\|\|\s*0\b/)
  })

  it('la bande PARCOURT la taxonomie — elle ne rend pas cinq étapes écrites à la main', () => {
    // Une bande qui listerait ses maillons en dur resterait au vert le jour où
    // une sixième étape naîtrait : elle ne la rendrait simplement jamais.
    expect(STRIP).toContain('deriveMissionChain')
    expect(STRIP).toContain('chain.map(')
    // …et aucun nom d'étape n'est écrit en dur dans le JSX de la bande.
    const hardcoded = MISSION_CHAIN_STEPS.filter(step => stripComments(STRIP).includes(`'${step}'`))
    expect(hardcoded, `Étapes écrites en dur dans la bande : ${hardcoded.join(', ')}`).toEqual([])
  })

  /* ---------------------------------------------------------------------- */
  /*  LE TÉMOIN DE CE QU'ELLE NE VISE PAS                                    */
  /* ---------------------------------------------------------------------- */

  it('une étape LÉGITIMEMENT sans porte n’est pas comptée comme une porte morte', () => {
    // Le repositionnement d'une mission dont aucune affectation ne porte
    // d'identité n'ouvre rien — on n'ouvre pas la fiche d'un homonyme deviné.
    // Une garde qui compterait ce cas parmi les liens morts obligerait à
    // inventer une URL pour la faire taire, c'est-à-dire exactement le défaut
    // qu'elle existe pour empêcher.
    const chain = deriveMissionChain({ ...measured(), consultantId: null })
    const reposition = chain.find(item => item.step === 'reposition')
    expect(reposition?.route).toBeNull()
    const dangling = chain.filter(item => item.route !== null && !routes.has(item.route))
    expect(dangling).toEqual([])
    // …et l'étape reste VISIBLE : c'est la porte qui manque, pas la position.
    expect(missingChainSteps(chain)).toEqual([])
  })
})

/**
 * Les commentaires sont retirés avant tout comptage : la doc d'une règle CITE
 * la règle, et deux comptages faux la même nuit ont été payés pour l'avoir
 * oublié.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
