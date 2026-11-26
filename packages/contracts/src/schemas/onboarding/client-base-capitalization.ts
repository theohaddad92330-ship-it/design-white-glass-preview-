/**
 * Ce que l'audit MESURE à partir de la base de clients déclarée — #2047.13 → .18.
 *
 * Distinct du bloc `BASE_CLIENTS_ANSWER_FIELDS` (`answers-base-clients.ts`) :
 * celui-là COLLECTE des réponses au questionnaire, celui-ci DÉRIVE un constat
 * d'audit à partir de ces réponses — rien n'est demandé de plus à l'ESN.
 *
 * Six liens NOMMÉS (jamais un score unique qui les fondrait) : est-ce que la
 * base de clients déclarée alimente un renouvellement, un nouveau besoin
 * (cross-sell), un témoignage, une recommandation, le vivier de consultants,
 * ou du contenu.
 *
 * Trois états par lien, jamais deux : `'observe'` / `'non_observe'` /
 * `'inconnu'` — la question à se poser sur chaque lien est « si la réponse
 * source est absente, "non observé" est-il VRAI ? ». Non : l'absence de
 * réponse ne dit rien du client, elle dit qu'on n'a pas demandé. Une bande
 * absente reste donc `'inconnu'`, jamais `'non_observe'` (« non mesuré n'est
 * jamais 0 », GA-18/GA-19).
 *
 * ⚠️ #2047.18 — le ton : une mission SANS capitalisation est une OPPORTUNITÉ
 * PERDUE, jamais un ÉCHEC. `describeCapitalizationGap` ne nomme jamais
 * l'absence de lien comme une faute — c'est ce que `client-base-capitalization.test.ts`
 * vérifie en interdisant le vocabulaire accusatoire.
 */

export const CLIENT_BASE_CAPITALIZATION_LINKS = [
  'renewal',
  'newNeed',
  'testimonial',
  'referral',
  'talentPool',
  'content',
] as const

export type ClientBaseCapitalizationLink = (typeof CLIENT_BASE_CAPITALIZATION_LINKS)[number]

export type CapitalizationSignal = 'observe' | 'non_observe' | 'inconnu'

export type ClientBaseCapitalizationSignals = Record<ClientBaseCapitalizationLink, CapitalizationSignal>

/** Les seules réponses dont ce fichier a besoin — typées ici plutôt
 *  qu'importées d'`EsnAnswers` pour ne pas créer de cycle avec `onboarding.ts`,
 *  qui compose ce module en amont. */
export type ClientBaseCapitalizationInput = {
  client_base_renewals_band?: string | null
  client_base_cross_sell_band?: string | null
  client_base_referrals_band?: string | null
  client_base_case_studies_band?: string | null
  client_base_rex_band?: string | null
}

/** `null`/`undefined`/chaîne vide → inconnu ; toute valeur déclarée qui n'est
 *  pas la valeur « aucun »/« jamais »/« 0 » du champ source → observé. */
function fromBand(value: string | null | undefined, negativeValues: readonly string[]): CapitalizationSignal {
  const v = value?.trim()
  if (!v) return 'inconnu'
  return negativeValues.includes(v) ? 'non_observe' : 'observe'
}

/**
 * #2047.13 → .18 — dérive les six liens depuis les réponses AGRÉGÉES de la
 * base de clients. Une dérivation à un seul endroit (GA-26) : deux prompts qui
 * la refaisaient chacun de son côté finiraient par diverger.
 */
export function deriveClientBaseCapitalizationSignals(
  answers: ClientBaseCapitalizationInput,
): ClientBaseCapitalizationSignals {
  return {
    // #2047.13 — un renouvellement.
    renewal: fromBand(answers.client_base_renewals_band, ['aucun']),
    // #2047.14 — un nouveau besoin (cross-sell).
    newNeed: fromBand(answers.client_base_cross_sell_band, ['jamais_tente']),
    // #2047.15 — un témoignage : un cas client exploitable en est la preuve la
    // plus proche parmi ce qui est collecté ici.
    testimonial: fromBand(answers.client_base_case_studies_band, ['0']),
    // #2047.16 — une recommandation.
    referral: fromBand(answers.client_base_referrals_band, ['aucune']),
    // #2047.17 — le vivier : un REX systématique est ce qui nourrit le
    // contenu de recrutement (annonces, preuves de mission) — le lien le
    // moins direct des six, documenté comme tel plutôt que deviné plus fort
    // qu'il ne l'est.
    talentPool: fromBand(answers.client_base_rex_band, ['jamais']),
    // #2047.18 — du contenu (cas d'usage, retour d'expérience réutilisable).
    content: fromBand(answers.client_base_rex_band, ['jamais']),
  }
}

const CAPITALIZATION_GAP_LABEL_FR: Record<ClientBaseCapitalizationLink, string> = {
  renewal: 'un renouvellement',
  newNeed: 'un nouveau besoin',
  testimonial: 'un témoignage',
  referral: 'une recommandation',
  talentPool: 'le vivier de consultants',
  content: 'du contenu',
}

/**
 * #2047.18 — le libellé d'un lien NON observé. Jamais accusatoire : une
 * mission qui n'alimente rien encore est une opportunité qui reste à saisir,
 * pas une faute de quelqu'un. `'inconnu'` n'a pas de libellé : on ne décrit
 * pas un manque qu'on n'a pas mesuré.
 */
export function describeCapitalizationGap(link: ClientBaseCapitalizationLink): string {
  // ⚠️ Le mot qu'on évite ne se NIE pas, il s'ABSENTE : un libellé se lit hors
  // contexte (une notification, une liste triée) où la négation se perd et le
  // mot reste — même défaut que `c65_couverture_nest_pas_un_fait_de_marche`
  // (GA-259), un cran plus bas. Le texte reste positif de bout en bout.
  return `${CAPITALIZATION_GAP_LABEL_FR[link]} : une opportunité qui reste à saisir.`
}
