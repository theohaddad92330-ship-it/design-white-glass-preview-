import { z } from 'zod'
import type { OfferDomain } from './onboarding.js'
import type { ResolvedPortfolio } from './offer-portfolio.js'

/**
 * LAURA SUR UN DOSSIER DE COMPTE — la surface contextuelle (maquette SOL6 n°6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS un second moteur de conversation. Laura reste une porte
 * (`useLaura`, GA-39) et un seul arbitre (`canInterrupt`,
 * `interruption-budget.ts`). Ce fichier ne porte que ce qui manquait vraiment :
 * la FORME de ce qu'une intervention posée sur un dossier de compte doit
 * rapporter avec elle pour qu'on puisse la décomposer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES QU'IL FAIT TENIR
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Le RÉSULTAT, jamais une phrase.** C'est le précédent de `benchCost`
 *    (`laura.service.ts:70-95`) : une phrase composée côté serveur est
 *    nécessairement dans UNE langue, et un client anglophone la recevait telle
 *    quelle. L'écran, qui connaît la langue, compose ; le serveur rend le fait.
 * 2. **Une suggestion se DÉCOMPOSE.** « Pourquoi cette suggestion ? » n'est pas
 *    décoratif : il rend les faits ET leurs sources. Une suggestion qu'on ne
 *    peut pas décomposer est une boîte noire, et le dépôt en refuse
 *    (`ScoreWithAxes`, `Provenance`). D'où `.min(1)` sur `facts` : une
 *    suggestion sans fait EST la boîte noire, et le contrat la refuse plutôt
 *    que de la laisser arriver vide à l'écran.
 * 3. **« Non mesuré » n'est jamais « 0 ».** Le vivier illisible se TAIT ; le
 *    vivier lisible et vide DIT zéro, parce que c'est un fait. La même forme
 *    que `SurfaceAcceptanceMeasure` (`laura-interventions.ts`) et que
 *    `AlertMeasure` (`observability-alerts.ts`) — il n'y a pas de second motif.
 */

/* ------------------------------------------------------------------ */
/*  L'ÉCRAN, ET LA CLÉ                                                 */
/* ------------------------------------------------------------------ */

/**
 * L'écran du catalogue pour un dossier de compte OUVERT.
 *
 * C'est un MOTIF et non un chemin : le dossier vit sur `/accounts/<identifiant>`,
 * donc aucune valeur littérale ne peut le désigner. `matchesScreen`
 * (`apps/api/src/modules/laura/laura-detector.ts`) est le seul endroit qui le
 * compare, pour que la règle vive à un seul endroit (GA-26).
 *
 * ⚠️ L'unicité par écran (`screensServed`, §5.3) reste calculée sur le chemin
 * RÉEL, pas sur ce motif : deux dossiers différents sont deux écrans différents,
 * et c'est le plafond journalier — pas le motif — qui borne le total.
 */
export const ACCOUNT_CONTEXT_SCREEN = '/accounts/:id'

/** La première intervention posée sur un dossier de compte : recrutement × vivier. */
export const ACCOUNT_HIRING_INTERVENTION_KEY = 'account_hiring_with_available_bench'

/**
 * #3939.3 (décision Louis 13/10, « oui, code-la ») — la SECONDE intervention du
 * dossier ouvert : une hypothèse de douleur qualifiée, fondée sur au moins un
 * signal DATÉ du compte (`accountPainFacts`, `laura-account-pain.ts`). Laura la
 * PROPOSE ; elle n'écrit rien, n'envoie rien, et se tait quand rien ne la fonde.
 */
export const ACCOUNT_PAIN_INTERVENTION_KEY = 'account_pain_with_dated_signal'

/* ------------------------------------------------------------------ */
/*  LA RESSOURCE DISPONIBLE                                            */
/* ------------------------------------------------------------------ */

/**
 * Ce que le vivier répond, croisé avec ce compte.
 *
 * ⚠️ **Deux nombres et non un**, et c'est la moitié qui manquait : « 0
 * disponible » sur un vivier de douze fiches dont personne n'a renseigné la
 * disponibilité se lit « personne n'est libre », alors que la vérité est
 * « personne ne l'a dit ». `consultants.availability` porte `inconnu`, et
 * l'entité écrit noir sur blanc qu'un `inconnu` n'est JAMAIS présenté comme
 * disponible — le compter à part est la seule façon de ne pas transformer un
 * silence en refus.
 */
export type AccountResourceMeasure =
  | { state: 'measured'; availableNow: number; undeclared: number }
  | { state: 'unmeasured'; reason: 'talent_pool_unreadable' }

const accountResourceMeasureSchema: z.ZodType<AccountResourceMeasure> = z.union([
  z.object({
    state: z.literal('measured'),
    availableNow: z.number().int().min(0),
    undeclared: z.number().int().min(0),
  }),
  z.object({ state: z.literal('unmeasured'), reason: z.literal('talent_pool_unreadable') }),
])

/**
 * La mesure, à partir de ce que la sonde a pu lire.
 *
 * `null` sur l'UNE des deux moitiés suffit à ne rien affirmer : un « 3
 * disponibles » sans savoir combien de fiches se taisent est un chiffre
 * orphelin, et un chiffre orphelin rassure toujours.
 */
export function accountResourceMeasure(read: {
  availableNow: number | null
  undeclared: number | null
}): AccountResourceMeasure {
  const unreadable = { state: 'unmeasured', reason: 'talent_pool_unreadable' } as const
  const { availableNow, undeclared } = read
  if (availableNow === null || undeclared === null) return unreadable
  if (!Number.isInteger(availableNow) || !Number.isInteger(undeclared)) return unreadable
  if (availableNow < 0 || undeclared < 0) return unreadable
  return { state: 'measured', availableNow, undeclared }
}

/* ------------------------------------------------------------------ */
/*  LES FAITS QUI ONT PRODUIT LA SUGGESTION                            */
/* ------------------------------------------------------------------ */

/**
 * De quoi parle un fait. Une liste FERMÉE : l'écran traduit chaque nature, et
 * une valeur inconnue afficherait sa clé brute.
 *
 * ⚠️ ADDITIF UNIQUEMENT (GA-08).
 */
export const ACCOUNT_SUGGESTION_FACT_KINDS = [
  'hiring_signal',
  'available_resource',
  // #3939.3 — l'hypothèse de douleur, puis les signaux datés qui la fondent.
  'pain_hypothesis',
  'pain_signal',
] as const
export type AccountSuggestionFactKind = (typeof ACCOUNT_SUGGESTION_FACT_KINDS)[number]

/**
 * UN fait, avec sa provenance.
 *
 * `statement` est la donnée TELLE QU'ELLE EST EN BASE — le texte du signal que
 * l'analyse a écrit dans le dossier, celui que l'onglet Signaux affiche déjà.
 * Ce n'est pas une phrase composée pour l'occasion : la recomposer ici en
 * ferait une seconde vérité, dans une seule langue, à côté de l'écran qui la
 * montre déjà.
 *
 * `source` et `observedOn` sont la provenance au sens du dépôt — la source ET
 * la date. `null` des deux côtés quand le dossier ne les porte pas : une source
 * devinée est pire qu'une source absente, parce qu'elle se cite.
 */
export const accountSuggestionFactSchema = z.object({
  kind: z.enum(ACCOUNT_SUGGESTION_FACT_KINDS),
  statement: z.string().min(1).max(400).nullable(),
  source: z.string().min(1).max(200).nullable(),
  /** La date telle que le dossier la porte (souvent `AAAA-MM-JJ`, parfois une
   *  année seule). Relayée BRUTE : la normaliser inventerait une précision. */
  observedOn: z.string().min(1).max(40).nullable(),
  /** Le dénombrement, quand le fait en est un. `null` = ce fait ne compte rien. */
  count: z.number().int().min(0).nullable(),
})
export type AccountSuggestionFact = z.infer<typeof accountSuggestionFactSchema>

/**
 * Ce que le serveur rapporte AVEC l'intervention posée sur un dossier.
 *
 * `facts` porte au moins un élément — voir la règle 2 du docblock de tête.
 */
export const accountSuggestionSchema = z.object({
  accountId: z.string().guid(),
  facts: z.array(accountSuggestionFactSchema).min(1).max(10),
  /** #3939.3 — `null` = cette suggestion ne croise PAS le vivier (douleur du
   *  compte) : rien à mesurer, donc rien d'affiché — ni « 0 », ni « illisible ». */
  resource: accountResourceMeasureSchema.nullable(),
})
export type AccountSuggestion = z.infer<typeof accountSuggestionSchema>

/* ------------------------------------------------------------------ */
/*  LE BANDEAU « ANALYSE PERSONNALISÉE AVEC TON PORTEFEUILLE »         */
/* ------------------------------------------------------------------ */

/**
 * Le prisme sous lequel ce dossier est lu — ou l'aveu qu'il n'y en a pas.
 *
 * ⚠️ **`not_configured` est la moitié qui compte.** Un bandeau qui afficherait
 * un portefeuille par défaut ferait croire à une personnalisation qui n'a pas eu
 * lieu — le mensonge le plus coûteux de cet écran, parce qu'il porte sur ce que
 * le produit prétend savoir du vendeur. `ResolvedPortfolio.source` le dit déjà
 * (`'legacy'` = rien n'a jamais été enregistré) ; cette dérivation ne fait que
 * le rendre lisible par un écran, à UN seul endroit (GA-26).
 */
export type OfferLens =
  | { state: 'not_configured' }
  | {
      /** Le type de société RETENU (correction humaine, sinon dérivation).
       *  `null` = rien ne le dit, et rien ne le déduit d'un silence. */
      state: 'configured'
      companyType: OfferDomain | null
      /** Les zones de chasse déclarées. Vide = aucune préférence — surtout pas
       *  « France entière », qui n'a jamais été saisi par personne. */
      territories: readonly string[]
    }

export function offerLensFrom(portfolio: ResolvedPortfolio): OfferLens {
  if (portfolio.source === 'legacy') return { state: 'not_configured' }
  return {
    state: 'configured',
    companyType: portfolio.company_type,
    territories: portfolio.target_geographies,
  }
}
