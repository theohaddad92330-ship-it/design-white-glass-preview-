import { parseAccountAnalysis, type Account, type Contact, type RecordFieldAudit } from '@bellum/contracts'

/**
 * #2163.45-.49/.51/.52 — les 6 blocs « ce que BellumAI sait déjà », lus depuis
 * les données DÉJÀ en base pour CE compte. Cinq lots successifs (25/09 au
 * 27/09) avaient classé ces six blocs « reste, chantier backend séparé » en
 * les traitant comme un problème de LECTURE PRÉ-PAIEMENT à construire pour
 * une société JAMAIS analysée — mais `/search?accountId=…` (relance) connaît
 * déjà un compte, et `useAccount` charge déjà ses contacts
 * (`GET /contacts/account/:id`, gratuit) SANS que `Search.tsx` les transmette
 * plus loin : la donnée existe, elle n'était simplement pas lue jusqu'ici.
 *
 * CE fichier ne livre qu'UN des six blocs (#2163.48, « Contacts et relations
 * internes ») — les cinq autres (identité/structure, analyses du workspace,
 * DataForge, résultats publics frais, historique des corrections) restent
 * hors de cette tranche, chacun un appelant distinct à câbler.
 *
 * #2163.53-.56 — séparer faits et hypothèses : réutilise le CALCUL EXISTANT
 * (`Contact.source_tag`, déjà posé par `contactSourceTag` côté serveur), pas
 * une seconde classification. `INTERNE`/`PUBLIC`/`RISQUE`/`ARRIVEE` reposent
 * sur un identifiant réel (CRM, registre, employeur confirmé) — des FAITS.
 * `HYPOTHÈSE` (inféré par IA/web) ou l'absence de calcul (ancien instantané)
 * restent des HYPOTHÈSES, jamais comptées comme un fait vérifié.
 */
type KnownContactsSummary = {
  total: number
  facts: number
  hypotheses: number
}

const FACT_SOURCE_TAGS: ReadonlySet<string> = new Set(['INTERNE', 'PUBLIC', 'RISQUE', 'ARRIVEE'])

/** `null` = bloc ABSENT (« on n'affiche pas ce qu'on n'a pas ») — jamais un
 *  bloc affiché avec des zéros. */
export function deriveKnownContactsSummary(contacts: readonly Contact[]): KnownContactsSummary | null {
  if (contacts.length === 0) return null
  const facts = contacts.filter(
    c => c.source_tag !== null && c.source_tag !== undefined && FACT_SOURCE_TAGS.has(c.source_tag),
  ).length
  return { total: contacts.length, facts, hypotheses: contacts.length - facts }
}

/**
 * #2163.46 — « Identité et structure », le 2ᵉ des six blocs. Même source que
 * #2163.48 (déjà chargée par `useAccount`, aucune lecture neuve) : les champs
 * FIRMOGRAPHIQUES déjà sur `sourceAccount` (raison sociale, secteur, effectif,
 * siège, SIREN, code NAF) — jamais une collecte neuve avant paiement.
 *
 * « On n'affiche pas ce qu'on n'a pas » (doctrine, Louis 20/09/2026) : dans
 * une LISTE, une absence ne fait AUCUNE ligne — `knownFields` ne nomme QUE ce
 * qui est renseigné, jamais un champ manquant.
 */
type KnownIdentitySummary = { knownFields: readonly string[] }

const IDENTITY_FIELDS: readonly (readonly [keyof Account, string])[] = [
  ['trade_name', 'tradeName'],
  ['sector', 'sector'],
  ['employees', 'employees'],
  ['headquarters', 'headquarters'],
  ['siren', 'siren'],
  ['naf_code', 'nafCode'],
]

export function deriveKnownIdentitySummary(account: Account | null): KnownIdentitySummary | null {
  if (!account) return null
  const knownFields = IDENTITY_FIELDS.filter(([column]) => Boolean(account[column])).map(([, field]) => field)
  if (knownFields.length === 0) return null
  return { knownFields }
}

/**
 * #2163.47 — « Analyses du workspace », le 3ᵉ bloc. Distinct des « Analyses
 * du workspace » qu'on pourrait imaginer sur D'AUTRES comptes : celui-ci ne
 * répond qu'à « CE compte a-t-il déjà été analysé DANS CET espace ? » —
 * `last_analyzed_at` (max des runs TERMINÉS, jamais dérivé de `created_at`),
 * déjà lu par `useAccount`. `null` = jamais analysé ici : bloc absent, pas un
 * « société inconnue » qui laisserait deviner un jugement.
 */
type KnownWorkspaceAnalysisSummary = { lastAnalyzedAt: string }

export function deriveKnownWorkspaceAnalysisSummary(account: Account | null): KnownWorkspaceAnalysisSummary | null {
  if (!account?.last_analyzed_at) return null
  return { lastAnalyzedAt: account.last_analyzed_at }
}

/**
 * #2163.51 — « Résultats publics encore frais », le 5ᵉ bloc. Réutilise la
 * classification de fraîcheur EXISTANTE (`signalFreshnessSchema`, posée par
 * le pipeline sur chaque `recent_signal`) plutôt que d'inventer un second
 * calcul de fraîcheur — seuls les signaux `'current'` comptent : `'archive'`
 * et `'undated'` répondraient au mot « frais » par une donnée fausse.
 */
type KnownFreshSignalsSummary = { current: number }

export function deriveKnownFreshSignalsSummary(account: Account | null): KnownFreshSignalsSummary | null {
  if (!account) return null
  const analysis = parseAccountAnalysis(account.raw_analysis)
  const current = (analysis.recent_signals ?? []).filter(signal => signal.freshness === 'current').length
  if (current === 0) return null
  return { current }
}

/**
 * #2163.52 — « Historique des corrections », le 6ᵉ et dernier des blocs « ce
 * que BellumAI sait déjà ». Le lecteur générique existe depuis #2953
 * (`RecordHistory`, dossier de mission) mais n'était encore appelé nulle
 * part sur `/search` — la donnée (`GET crm/history`) existe déjà pour un
 * compte, seul l'appelant manquait (le motif que `chantiers-livres.md`
 * nomme : chercher l'APPELANT, pas la fonction).
 */
type KnownCorrectionsSummary = { total: number }

export function deriveKnownCorrectionsSummary(
  entries: readonly RecordFieldAudit[] | undefined,
): KnownCorrectionsSummary | null {
  if (!entries || entries.length === 0) return null
  return { total: entries.length }
}
