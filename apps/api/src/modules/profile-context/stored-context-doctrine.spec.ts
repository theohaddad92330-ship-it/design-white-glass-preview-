import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION, type ProfileContext } from '@bellum/contracts'
import { withheldStoredContext } from './stored-context-doctrine'

/**
 * #2062 R16-1 — UN corpus, à UN seul endroit (GA-26). Avant ce lot,
 * `WELCOME_FIELDS`/`PHRASE_FIELDS` ci-dessous étaient deux listes de cinq
 * écrites à la main ici, et une TROISIÈME (`_WELCOME_SUMMARY_FIELDS`) vivait
 * dans la garde IA (`apps/ia/tests/test_welcome_summary_tutoiement.py`) — ni
 * les mêmes, ni celle du produit (21 champs de texte rendus verbatim). Les
 * deux gardes relisent maintenant `profile-context-rendered-fields.json`.
 */
const RENDERED_FIELDS = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'packages/contracts/src/schemas/profile-context-rendered-fields.json',
    ),
    'utf8',
  ),
) as ReadonlyArray<{ model: string; field: string; kind: 'text' | 'list'; audience: 'user' | 'external' }>

/** Un instantané écrit par le producteur qui PROUVE ses noms. */
const PROVEN = { schemaVersion: PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION }
/** Un instantané d'avant — celui que servait la production le 15/09/2026. */
const UNPROVEN = { schemaVersion: PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION - 1 }

/**
 * #2062.1 — CORRIGER LE PROMPT NE CORRIGE PAS CE QUI EST DÉJÀ SERVI.
 *
 * Mesuré en production le 15/09/2026 sur `/welcome`, compte réel, verbatim :
 *
 *   « Le scoring évaluera la couverture stakeholders IT (…), la probabilité
 *     d'un besoin urgent en Data/Cloud/Cybosécurité, et l'alignement avec tes
 *     secteurs réglementés. »
 *
 * « Aucune PROBABILITÉ » a été refusée SIX fois (arbitrage n°4 du 16/08 ; D10
 * du PDF 1 ; §7.7 du PDF 2 ; PDF 4 ; PDF 5 ; PDF 8 — `c26_probabilite` au
 * registre de doctrine). Le schéma du Profiler porte l'interdit depuis le
 * 14/09 — mais `profiles.profile_context` est une colonne PERSISTÉE : la phrase
 * fautive est stockée, et elle est re-servie à chaque ouverture de l'écran,
 * pour toujours. Un interdit posé à la GÉNÉRATION ne redescend jamais tout
 * seul sur ce qui a déjà été écrit.
 *
 * D'où une garde de LECTURE. Elle ne réécrit rien : on n'invente pas une phrase
 * de remplacement (« JAMAIS de donnée fictive »), et on ne touche pas la ligne
 * stockée (« on archive, on ne supprime pas » — la révision reste intacte, et
 * une prochaine génération la remplacera). Elle NOMME ce qu'elle retient : les
 * chemins rendus remontent à l'écran, qui dit que ce texte date du <date> et
 * sera réécrit. Un champ vidé en silence déguiserait un « non mesuré » en
 * « rien à dire », et c'est exactement ce que la doctrine refuse.
 */

const PROD_VERBATIM =
  "Le scoring évaluera la couverture stakeholders IT (nombre et séniorité des décideurs identifiés), la probabilité d'un besoin urgent en Data/Cloud/Cybosécurité, et l'alignement avec tes secteurs réglementés (Fintech, Aéronautique, Industrie)."

function storedContext(overrides: Record<string, unknown> = {}): ProfileContext {
  return {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'expert',
    welcomeSummary: {
      profileRecap: 'Vous êtes une ESN "Data & Cloud" de 30 consultants.',
      searchesPersonalization: 'Les recherches cibleront en priorité "data" et "cloud".',
      contactsPersonalization: 'Les contacts identifiés seront des "DSI" et des "CTO".',
      messagesPersonalization: 'Les messages seront rédigés sur un ton "expert direct".',
      scoringPersonalization: "Le scoring évaluera l'urgence du besoin en Data et Cloud.",
      firstAnalysisSuggestions: [],
    },
    bellumPhrases: {
      welcome: 'Bienvenue !',
      firstAnalysisCta: 'Commence par une ETI de la banque.',
      weeklySummaryIntro: 'Cette semaine, concentre-toi sur tes ETI.',
      emptyState: 'Ton pipeline est vide.',
      scoreContext: 'Un score se justifie par ses axes.',
      ...((overrides.bellumPhrases as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  } as unknown as ProfileContext
}

describe('withheldStoredContext — la phrase mesurée en production (#2062.1)', () => {
  it('ne sert PAS la phrase qui nomme une probabilité', () => {
    const stored = storedContext({
      welcomeSummary: { ...storedContext().welcomeSummary, scoringPersonalization: PROD_VERBATIM },
    })

    const { context, withheld } = withheldStoredContext(stored, PROVEN)

    expect(context?.welcomeSummary?.scoringPersonalization).toBe('')
    // NOMMÉ, pas silencieux : l'écran reçoit le chemin exact du texte retenu.
    expect(withheld).toEqual(['welcomeSummary.scoringPersonalization'])
  })

  it("ne touche PAS la valeur stockée qu'on lui passe — la ligne en base reste intacte", () => {
    const stored = storedContext({
      welcomeSummary: { ...storedContext().welcomeSummary, scoringPersonalization: PROD_VERBATIM },
    })

    withheldStoredContext(stored, PROVEN)

    expect(stored.welcomeSummary?.scoringPersonalization).toBe(PROD_VERBATIM)
  })
})

describe('withheldStoredContext — elle LIT quelque chose (#2062.1)', () => {
  // Une garde qui n'inspecterait qu'un champ serait verte sur les neuf autres.
  // Chaque champ de texte libre rendu VERBATIM par l'écran est porté ici, et
  // chacun est vérifié SÉPARÉMENT : c'est le corpus de la garde, et il n'est
  // pas vide.
  //
  // #2062 R16-1 — dérivés du corpus UNIQUE (GA-26), pas recopiés : avant ce
  // lot, cette liste ET `_WELCOME_SUMMARY_FIELDS` côté IA
  // (`test_welcome_summary_tutoiement.py`) étaient deux listes de cinq qui
  // n'étaient NI identiques entre elles NI celle du produit (21 champs de
  // texte rendus verbatim — voir `profile-context-rendered-fields.json`).
  const WELCOME_FIELDS = RENDERED_FIELDS.filter(f => f.model === 'WelcomeSummary').map(f => f.field)
  const PHRASE_FIELDS = RENDERED_FIELDS.filter(f => f.model === 'BellumPhrases').map(f => f.field)

  it('inspecte un corpus NON VIDE de champs', () => {
    expect(WELCOME_FIELDS.length + PHRASE_FIELDS.length).toBe(10)
  })

  it('le corpus PARTAGÉ rend bien les 23 champs de texte du produit (#2088.34 : +2)', () => {
    expect(RENDERED_FIELDS.length).toBe(23)
  })

  it.each(WELCOME_FIELDS)('silence une probabilité écrite dans welcomeSummary.%s', field => {
    const base = storedContext()
    const stored = storedContext({
      welcomeSummary: { ...base.welcomeSummary, [field]: 'Bellum estime la probabilité de signature.' },
    })

    const { context, withheld } = withheldStoredContext(stored, PROVEN)

    expect((context?.welcomeSummary as unknown as Record<string, string>)[field]).toBe('')
    expect(withheld).toHaveLength(1)
  })

  it.each(PHRASE_FIELDS)('silence une probabilité écrite dans bellumPhrases.%s', field => {
    const stored = storedContext({ bellumPhrases: { [field]: 'Tu as 70 % de chances de signer.' } })

    const { context, withheld } = withheldStoredContext(stored, PROVEN)

    expect((context?.bellumPhrases as unknown as Record<string, string>)[field]).toBe('')
    expect(withheld).toHaveLength(1)
  })

  it("descend jusqu'au motif d'une suggestion — le texte libre n'est pas qu'au premier niveau", () => {
    const base = storedContext()
    const stored = storedContext({
      welcomeSummary: {
        ...base.welcomeSummary,
        firstAnalysisSuggestions: [
          { companyName: 'Société Générale', sector: 'Banque', reason: 'Forte probabilité de closing ce trimestre.' },
        ],
      },
    })

    const { context, withheld } = withheldStoredContext(stored, PROVEN)

    const suggestions = context?.welcomeSummary?.firstAnalysisSuggestions ?? []
    expect(suggestions[0]?.reason).toBe('')
    expect(suggestions[0]?.companyName).toBe('Société Générale')
    expect(withheld).toHaveLength(1)
  })
})

describe('withheldStoredContext — un nom stocké non prouvé ne se sert pas (#2069.1)', () => {
  // Les quatre noms mesurés en production le 15/09/2026, cliquables, chacun
  // lançant une analyse — donc débitant un crédit. Le producteur ne les génère
  // plus (`keep_sourced`), mais ils DORMENT dans la colonne persistée.
  const PROD_NAMES = ['BNP Paribas', 'Stellantis', 'Airbus', 'LVMH']

  function withNames(names: string[]): ProfileContext {
    const base = storedContext()
    return storedContext({
      welcomeSummary: {
        ...base.welcomeSummary,
        firstAnalysisSuggestions: names.map(companyName => ({
          companyName,
          sector: 'Grand compte',
          reason: 'Nom connu du marché français.',
        })),
      },
    })
  }

  it("SAIT DIRE NON : les quatre noms du 15/09 ne sortent pas d'un instantané d'avant la preuve", () => {
    const stored = withNames(PROD_NAMES)
    expect(stored.welcomeSummary?.firstAnalysisSuggestions).toHaveLength(4)

    const { context, withheld } = withheldStoredContext(stored, UNPROVEN)

    expect(context?.welcomeSummary?.firstAnalysisSuggestions).toEqual([])
    expect(withheld).toEqual(['welcomeSummary.firstAnalysisSuggestions'])
  })

  it("SAIT DIRE NON aussi quand AUCUN instantané n'est lisible — « je n'ai pas pu lire » ne vaut pas preuve", () => {
    const { context, withheld } = withheldStoredContext(withNames(PROD_NAMES), { schemaVersion: null })

    expect(context?.welcomeSummary?.firstAnalysisSuggestions).toEqual([])
    expect(withheld).toEqual(['welcomeSummary.firstAnalysisSuggestions'])
  })

  it('TÉMOIN : un instantané écrit par le producteur qui prouve ses noms les sert', () => {
    const { context, withheld } = withheldStoredContext(withNames(['Société Générale']), PROVEN)

    expect(context?.welcomeSummary?.firstAnalysisSuggestions?.[0]?.companyName).toBe('Société Générale')
    expect(withheld).toEqual([])
  })

  it("une liste DÉJÀ vide ne se nomme pas — il n'y a rien à retenir", () => {
    const { withheld } = withheldStoredContext(storedContext(), UNPROVEN)

    expect(withheld).toEqual([])
  })
})

describe("withheldStoredContext — elle n'attrape pas ce qu'elle ne vise pas (#2062.1)", () => {
  // Les témoins. L'interdit porte sur une CHANCE présentée comme un résultat,
  // pas sur l'urgence, ni sur un taux MESURÉ — « ton taux de transformation est
  // de 22 % sur 40 affaires » est une observation, et une garde qui la mangerait
  // rendrait le produit muet sur ses propres mesures.
  it.each([
    "Le scoring évaluera l'urgence du besoin en Data/Cloud et la couverture des décideurs.",
    'Ton taux de transformation est de 22 % sur 40 affaires analysées.',
    "Un score se justifie par ses axes, et ce qui n'a pas pu être évalué est nommé.",
    'Les messages seront rédigés sur un ton "expert direct", pas consultative corporate.',
    'Ce compte a un besoin urgent : une migration cloud est en cours.',
  ])('laisse passer : %s', phrase => {
    const base = storedContext()
    const stored = storedContext({ welcomeSummary: { ...base.welcomeSummary, scoringPersonalization: phrase } })

    const { context, withheld } = withheldStoredContext(stored, PROVEN)

    expect(context?.welcomeSummary?.scoringPersonalization).toBe(phrase)
    expect(withheld).toEqual([])
  })

  it("rend le contexte INCHANGÉ, à l'identité près, quand rien n'est en cause", () => {
    const stored = storedContext()

    const { context, withheld } = withheldStoredContext(stored, PROVEN)

    expect(context).toBe(stored)
    expect(withheld).toEqual([])
  })

  it('garde les blocs snake_case hérités que `.passthrough()` conserve', () => {
    const stored = storedContext({ analysis_parameters: { search_depth: 'deep' } })

    const { context } = withheldStoredContext(stored, PROVEN)

    expect((context as unknown as Record<string, unknown>).analysis_parameters).toEqual({ search_depth: 'deep' })
  })

  it("accepte un contexte absent — un profil pas encore généré n'est pas une erreur", () => {
    expect(withheldStoredContext(null, PROVEN)).toEqual({ context: null, withheld: [] })
  })
})
