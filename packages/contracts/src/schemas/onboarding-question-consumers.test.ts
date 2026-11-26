import { describe, expect, it } from 'vitest'
import { esnAnswersSchema } from './onboarding.js'
import { AIRES_SANS_CONSOMMATEUR_VERIFIE, QUESTION_CONSUMERS } from './onboarding-question-consumers.js'
import { PRODUCT_CONSUMER_AREAS } from './onboarding-answer-contract.js'

/**
 * #2006.12 → .21 / #2007.13 (fusionnés — le registre nomme #2007.13 le
 * doublon de #2006.12-.21, « à fusionner en un seul artefact ») — un seul
 * artefact : la table de correspondance question → consommateur(s) produit,
 * et la garde qui empêche une question d'exister sans y figurer.
 *
 * « Aucune question sans dire ce qu'elle modifie » ne veut pas dire qu'une
 * réponse doit forcément avoir un consommateur AUJOURD'HUI — le motif n°1 de
 * ce dépôt est justement le nombre de champs enregistrés que rien ne lit
 * encore (`question-consequences.ts`). Ça veut dire que le SILENCE est
 * interdit : chaque clé a une ligne, avec ses aires réelles ou un tableau vide
 * et sa raison écrite. Un tableau vide sans raison serait un mensonge par
 * omission — cette garde vérifie donc aussi que `reason` n'est jamais blanc.
 */
const ALL_KEYS = Object.keys(esnAnswersSchema.shape)

describe('QUESTION_CONSUMERS — le corpus n’est pas vide (garde qui LIT quelque chose)', () => {
  it('couvre au moins les 114 clés mesurées le 16/09/2026', () => {
    expect(ALL_KEYS.length).toBeGreaterThanOrEqual(114)
  })
})

describe('QUESTION_CONSUMERS — aucune question sans une ligne', () => {
  it('chaque clé d’`EsnAnswers` a une entrée dans la table', () => {
    const sansEntree = ALL_KEYS.filter(key => !(key in QUESTION_CONSUMERS))
    expect(sansEntree, `clés sans entrée : ${sansEntree.join(', ')}`).toEqual([])
  })

  it('sait dire NON : une clé retirée de la table fait rougir le test au-dessus', () => {
    const { esn_name: _omitted, ...amputee } = QUESTION_CONSUMERS
    const sansEntree = ALL_KEYS.filter(key => !(key in amputee))
    expect(sansEntree).toEqual(['esn_name'])
  })

  it('chaque entrée porte une raison non vide, même quand `areas` est vide', () => {
    const sansRaison = Object.entries(QUESTION_CONSUMERS).filter(([, entry]) => !entry.reason?.trim())
    expect(sansRaison.map(([key]) => key)).toEqual([])
  })

  it('les aires citées appartiennent toutes à la liste fermée', () => {
    const inconnues = Object.entries(QUESTION_CONSUMERS).flatMap(([key, entry]) =>
      entry.areas
        .filter(area => !(PRODUCT_CONSUMER_AREAS as readonly string[]).includes(area))
        .map(area => `${key}:${area}`),
    )
    expect(inconnues).toEqual([])
  })
})

/**
 * Les clés qu'`apps/ia/app/prompts/bellum_profiler.py` NE REND PAS — mesurées
 * une par une (`grep -c "<clé>" apps/ia/app/prompts/bellum_profiler.py` → 0)
 * à l'intégration de la vague 12. Elles portent `areas: []` dans la table.
 *
 * Cette liste existe parce que la version précédente de cette garde écrivait
 * `expect(surAudit.length).toBe(ALL_KEYS.length)` : « audit couvre TOUTES les
 * clés ». C'était vrai des 114 clés du 16/09/2026 au matin, et faux dès qu'une
 * branche ajoute une clé qu'aucun prompt ne lit — la garde forçait alors à
 * coller `audit` sur une clé non lue, c'est-à-dire à mentir pour passer au
 * vert. **Une garde protège une règle, elle ne l'invente pas** : la règle est
 * « aucune question sans une ligne », jamais « toute question est lue par
 * l'audit ».
 */
/**
 * Les clés dont l'absence du prompt est VOULUE, pas subie — `areas: []` y est
 * un état visé. Les confondre avec la liste ci-dessus ferait passer un futur
 * lot pour une correction attendue alors qu'il violerait une doctrine.
 */
const CLES_INTERDITES_AU_PROMPT: readonly string[] = ['heard_about_bellum']

// ⚠️ #2029 revient sur #2364, délibérément : `heard_about_bellum` était rangée
// ICI par la PR #2364, avec la note « elle ne quittera JAMAIS cette liste ».
// La vague 12 bis la DÉPLACE dans `CLES_INTERDITES_AU_PROMPT` ci-dessus, et
// c'est le même fait dit plus juste — une clé interdite par doctrine n'est pas
// une clé qui attend son câblage. Ce qui tient encore, inchangé : elle n'aura
// jamais `audit`, et `heard-about-bellum-attribution.guard.test.ts` fait
// rougir la CI si quelqu'un l'y branche.
const CLES_SANS_CONSOMMATEUR_MESURE: readonly string[] = [
  'esn_objectives',
  'rfp_platforms_used',
  'rfp_referencing_status',
  'rfp_lot_allocation',
  'rfp_response_templates',
  'rfp_volume',
  'rfp_volume_period',
  'rfp_outcomes',
  'rfp_go_no_go_process',
  'rfp_document_readiness',
  'content_active_profile',
  'content_audience_size',
  'content_visible_expertise',
  'content_reactions',
  'content_conversations_generated',
  'content_funnel_stages_reached',
  // #2015.7 / #2056.11 / #2057.10 (feat/questionnaire-filiation-owner-economie-16-09).
  'company_group_structure',
  'rfp_deal_value',
  'rfp_owner_assignment',
  // #2053.3 / #2053.4 (feat/accueil-cout-intercontrat-et-encaissement-18-09).
  'intercontrat_cost',
  'payment_delay_visibility',
  'payment_delay_band',
  // #2033.2-.8 (D3, décision Louis 18/09/2026, périmètre d'autorité déclaré) —
  // absentes de `bellum_profiler.py` (`audit`). Les quatre échelles
  // (`recruitment_accounts_authority` / `staffing_authority` /
  // `margin_billing_authority` / `invite_authority`) atteignent `laura` quand
  // même (voir leur `reason` dans `onboarding-question-consumers.ts`) —
  // « sans audit » n'est pas « sans consommateur ».
  'decisions_alone',
  'decisions_to_validate',
  'people_managed',
  'recruitment_accounts_authority',
  'staffing_authority',
  'margin_billing_authority',
  'tools_access',
  'invite_authority',
  // #2039.6 (épopée #2880, feat/nuit-14-25-09, tranché sans Louis).
  'expertise_no_concrete_proof',
  // #2039.2 (épopée #2880, feat/soir-s10-26-09, tranché sans Louis).
  'expertise_client_reference',
  // #2039.3/.4/.5 (épopée #2880, vague G lot g10, tranché sans Louis).
  'expertise_personal_experience',
  'expertise_partner',
  'expertise_talent_pool',
  // #3923.a (lot M04, 09/10) — lue par Découvrir (`signalRelevance`), pas par le profiler.
  'placed_roles',
]

describe('QUESTION_CONSUMERS — chaque aire mesurée a au moins un exemple vérifié, sauf aveu explicite', () => {
  it('audit couvre toutes les clés SAUF celles dont l’absence du profiler est mesurée ou voulue', () => {
    const sansAudit = Object.entries(QUESTION_CONSUMERS)
      .filter(([, entry]) => !entry.areas.includes('audit'))
      .map(([key]) => key)
      .sort()
    expect(sansAudit).toEqual([...CLES_SANS_CONSOMMATEUR_MESURE, ...CLES_INTERDITES_AU_PROMPT].sort())
  })

  it('une clé INTERDITE au prompt n’est jamais rangée avec celles qui attendent leur câblage', () => {
    const melange = CLES_INTERDITES_AU_PROMPT.filter(key => CLES_SANS_CONSOMMATEUR_MESURE.includes(key))
    expect(melange).toEqual([])
  })

  it('chaque clé interdite dit POURQUOI, et cite la doctrine qui la tient', () => {
    const muettes = CLES_INTERDITES_AU_PROMPT.filter(
      key => !/INTERDIT/.test(QUESTION_CONSUMERS[key as keyof typeof QUESTION_CONSUMERS]?.reason ?? ''),
    )
    expect(muettes).toEqual([])
  })

  it('le plancher de couverture `audit` ne recule jamais — cliquet à 114', () => {
    const surAudit = Object.values(QUESTION_CONSUMERS).filter(entry => entry.areas.includes('audit'))
    expect(surAudit.length).toBeGreaterThanOrEqual(114)
  })

  it('sait dire NON : une clé qui perdrait `audit` sans être déclarée fait rougir', () => {
    const amputee = { ...QUESTION_CONSUMERS, esn_name: { areas: [], reason: 'témoin' } }
    const sansAudit = Object.entries(amputee)
      .filter(([, entry]) => !entry.areas.includes('audit'))
      .map(([key]) => key)
    expect(sansAudit).toContain('esn_name')
    expect(CLES_SANS_CONSOMMATEUR_MESURE).not.toContain('esn_name')
  })

  it('n’attrape pas ce qu’elle ne vise pas : une clé déclarée et VRAIMENT sans aire reste verte', () => {
    const sansAudit = Object.entries(QUESTION_CONSUMERS)
      .filter(([, entry]) => !entry.areas.includes('audit'))
      .map(([key]) => key)
    expect(sansAudit).toEqual(expect.arrayContaining(['esn_objectives']))
  })

  it('chaque clé déclarée sans consommateur AVOUE la mesure dans sa raison', () => {
    const muettes = CLES_SANS_CONSOMMATEUR_MESURE.filter(
      key => !/grep = 0/.test(QUESTION_CONSUMERS[key as keyof typeof QUESTION_CONSUMERS]?.reason ?? ''),
    )
    expect(muettes).toEqual([])
  })

  it.each(['scoring', 'decouvrir', 'priorisation', 'contacts', 'reverse_market', 'laura', 'messages'] as const)(
    'l’aire « %s » a au moins un exemple réel',
    area => {
      const count = Object.values(QUESTION_CONSUMERS).filter(entry => entry.areas.includes(area)).length
      expect(count).toBeGreaterThan(0)
    },
  )
})

/**
 * #2006.16 / #2006.19 / #2006.20 — `routines` et `pilotage` (et `messages`
 * avant d'être câblée ci-dessus) étaient citées par `PRODUCT_CONSUMER_AREAS`
 * sans qu'aucune ligne de la table ne les nomme jamais : ni consommées, ni
 * NOMMÉES comme non alimentées — une aire purement décorative, invisible à
 * toute garde. Un commentaire en tête de fichier ne suffit pas (« commentaire
 * ≠ preuve ») : {@link AIRES_SANS_CONSOMMATEUR_VERIFIE} et les deux tests
 * ci-dessous PROUVENT l'état plutôt que de l'affirmer, exactement comme
 * `CLES_SANS_CONSOMMATEUR_MESURE` le fait déjà par CLÉ, ici par AIRE.
 */
describe('#2006.16 / #2006.19 / #2006.20 — routines / pilotage : nommées non alimentées, pas décoratives', () => {
  it('aucune entrée ne cite une aire nommée non alimentée — la preuve, pas l’allégation', () => {
    const citations = Object.entries(QUESTION_CONSUMERS).flatMap(([key, entry]) =>
      entry.areas
        .filter(area => (AIRES_SANS_CONSOMMATEUR_VERIFIE as readonly string[]).includes(area))
        .map(a => `${key}:${a}`),
    )
    expect(citations).toEqual([])
  })

  it('sait dire NON : une citation ajoutée en douce sur une aire non alimentée fait rougir', () => {
    const witness = { ...QUESTION_CONSUMERS, esn_name: { areas: ['routines' as const], reason: 'témoin' } }
    const citations = Object.entries(witness).flatMap(([key, entry]) =>
      entry.areas
        .filter(area => (AIRES_SANS_CONSOMMATEUR_VERIFIE as readonly string[]).includes(area))
        .map(a => `${key}:${a}`),
    )
    expect(citations).toEqual(['esn_name:routines'])
  })

  it('les aires nommées non alimentées appartiennent à la liste fermée du produit', () => {
    expect(
      AIRES_SANS_CONSOMMATEUR_VERIFIE.every(area => (PRODUCT_CONSUMER_AREAS as readonly string[]).includes(area)),
    ).toBe(true)
  })

  it('`messages` a quitté la liste des aires non alimentées une fois câblée', () => {
    expect(AIRES_SANS_CONSOMMATEUR_VERIFIE).not.toContain('messages')
  })
})
