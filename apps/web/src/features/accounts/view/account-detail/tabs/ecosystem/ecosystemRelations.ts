import {
  applyEcosystemCorrection,
  ecosystemPresence,
  observedCertainty,
  relationMayAssert,
  type AccountPartner,
  type EcosystemRelation,
  type EcosystemRelationType,
  type EsnPresenceCertainty,
} from '@bellum/contracts'

/**
 * #2122.12-.19 / .20-.27 / .33 / .35 / .37 / .53-.55 / .62 — LIRE L'ÉCOSYSTÈME
 * D'UN COMPTE AVEC LE VOCABULAIRE DES HUIT TYPES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout est déjà servi par `GET /accounts/:id/partners` depuis #1605 / #1624 :
 * `evidence_origins` (les trois façons dont une ESN est connue, simultanément),
 * `certainty` (la confiance de la DÉTECTION), `market_observation_count` (les
 * parcours du corpus), `rank`, `relationship`, `detected_at`. Aucun champ neuf
 * n'est demandé au serveur, et aucun champ existant n'est renommé (#2122.5/.6).
 *
 * Ce qui manquait : un NOM pour le lien. « ALTEN est là » ne dit pas s'il faut
 * l'attaquer, passer par lui, ou se placer derrière lui — et sans nom, l'écran
 * ne peut ni proposer une action juste, ni refuser d'affirmer ce qu'il ne sait
 * pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UNE DÉRIVATION, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `presence` sort du MÊME appel que `relations` (#2122.62). C'est la seule
 * façon de rendre IMPOSSIBLE — et pas seulement improbable — la contradiction
 * entre « N ESN observées » et « aucune ESN présente » : deux phrases qui
 * lisent deux sources finissent toujours par diverger sur un compte.
 */

/** La correction humaine, telle que l'écran la tient — avant toute persistance. */
export type EcosystemCorrectionInput = {
  type: EcosystemRelationType
  corrected_at: string
  corrected_by: string | null
}

/** Pourquoi cette ligne atterrit dans « Informations à qualifier ». Deux
 *  raisons, et elles appellent deux gestes différents : arbitrer entre deux
 *  sources, ou aller chercher la preuve qui manque. */
type EcosystemQualificationReason = 'divergent_sources' | 'no_proof'

type EcosystemReading = {
  relations: EcosystemRelation[]
  toQualify: { id: string; name: string; reason: EcosystemQualificationReason }[]
  presence: { observed: number | null; none: boolean; historicOnly: boolean }
}

/** Les origines dont on sait dire la source d'une preuve. Une origine inconnue
 *  (déploiement en avance côté serveur) ne prouve rien : elle n'invente pas une
 *  preuve, elle laisse la ligne à qualifier. */
const PROVING_ORIGINS = ['workspace_declared', 'declared_subcontracting', 'current_inference', 'market_observation']

/**
 * La preuve ATTACHÉE, ou `null`.
 *
 * ⚠️ Une détection SANS DATE ne prouve rien — c'est la règle déjà tenue par
 * l'onglet : « l'écran refuse d'afficher une ESN détectée sans sa date »
 * (tome 1 §21.5). Une déclaration de l'équipe, elle, porte la date de sa
 * saisie : c'est une parole datée, et elle vaut preuve.
 */
function proofOf(partner: AccountPartner, origins: readonly string[]): EcosystemRelation['proof'] {
  const source = PROVING_ORIGINS.find(origin => origins.includes(origin))
  if (!source) return null
  const declared = source === 'workspace_declared'
  const observedAt = declared ? partner.detected_at || partner.created_at || null : partner.detected_at
  if (!observedAt) return null
  return { label: partner.scope ?? partner.note ?? null, source, observed_at: observedAt }
}

/**
 * Les origines de la ligne — avec le repli sur `source` pour une réponse d'API
 * antérieure à `evidence_origins` (#1605 : le champ est `.optional()` pour le
 * deploy-skew, et l'écran retombe sur `source` seul, comme avant).
 */
function originsOf(partner: AccountPartner): string[] {
  if (partner.evidence_origins && partner.evidence_origins.length > 0) return [...partner.evidence_origins]
  return partner.source === 'declared' ? ['workspace_declared'] : []
}

/**
 * LE TYPE, dans l'ordre de ce qui se sait le mieux.
 *
 * Le rang passe avant l'origine : « Rang 1 déclaré » et « Rang 2 confirmé »
 * disent quelque chose de plus précis que « déclarée par l'équipe ». Sous le
 * rang, l'origine la plus FORTE gagne (la parole de l'espace, puis la source
 * actuelle, puis le corpus). Et tout en bas, quand rien ne prouve rien, on
 * retombe sur une HYPOTHÈSE nommée — jamais sur un constat.
 *
 * #2316.10 — un rang 2 SANS preuve reste un rang 2 : il retombe sur
 * `rank2_potential`, jamais sur l'hypothèse générique du bas (qui perdrait
 * l'info de rang). Le rang continue de passer avant l'origine, comme pour
 * `rank2_confirmed` juste au-dessus.
 */
function typeOf(partner: AccountPartner, origins: readonly string[], hasProof: boolean): EcosystemRelationType {
  if (partner.rank === 'rank1' && hasProof) return 'rank1_declared'
  if (partner.rank === 'rank2' && hasProof) return 'rank2_confirmed'
  if (partner.rank === 'rank2') return 'rank2_potential'
  // L'ESN a déclaré ELLE-MÊME, ailleurs dans le produit, être ouverte à la
  // sous-traitance (#1624.7) : sans rang chez ce client, ce n'est pas une
  // position, c'est une porte — celle d'un tiers.
  if (origins.includes('declared_subcontracting')) return 'intermediation_platform'
  if (origins.includes('workspace_declared')) return 'team_declared'
  if (origins.includes('current_inference') && hasProof) return 'current_sourced'
  if (origins.includes('market_observation') && hasProof) return 'historic_observed'
  return partner.relationship === 'partner' ? 'partner_potential' : 'competitor_potential'
}

/**
 * #2122.35 — LE DÉSACCORD DES DEUX SEULES SOURCES QUI PORTENT CHACUNE UNE VALEUR.
 *
 * La paire est celle que `TabPartners` compare déjà depuis #1624.4 : la
 * certitude de la DÉTECTION récente contre celle que le corpus tire lui-même
 * du nombre de parcours. Aucune des deux ne l'emporte — c'est l'utilisateur
 * qui tranche, et tant qu'il n'a pas tranché, les deux sont affichées.
 */
function divergencesOf(partner: AccountPartner, origins: readonly string[]): EcosystemRelation['divergences'] {
  if (!origins.includes('market_observation') || !origins.includes('current_inference')) return []
  const count = partner.market_observation_count
  if (typeof count !== 'number' || !partner.certainty) return []
  const market: EsnPresenceCertainty = observedCertainty(count)
  if (market === partner.certainty) return []
  return [
    { source: 'current_inference', statement: partner.certainty, observed_at: partner.detected_at },
    { source: 'market_observation', statement: market, observed_at: null },
  ]
}

/**
 * La lecture complète de l'écosystème d'un compte.
 *
 * `corrections` est la carte des corrections humaines connues de l'écran,
 * indexée par identifiant de ligne. Elle passe PAR-DESSUS la dérivation et
 * n'efface rien : le type observé survit dans `correction.previous_type`, et
 * la preuve reste attachée (#2122.53-.55).
 */
export function readEcosystem(input: {
  partners: readonly AccountPartner[]
  corrections?: ReadonlyMap<string, EcosystemCorrectionInput>
}): EcosystemReading {
  const relations: EcosystemRelation[] = []
  const toQualify: EcosystemReading['toQualify'] = []

  for (const partner of input.partners) {
    const origins = originsOf(partner)
    const proof = proofOf(partner, origins)
    const divergences = divergencesOf(partner, origins)
    const derived: EcosystemRelation = {
      id: partner.id,
      name: partner.name,
      type: typeOf(partner, origins, proof !== null),
      proof,
      confidence: partner.certainty,
      // #2122.33 — « déduit » est ce que SEULE une source actuelle porte. Une
      // ligne que l'équipe a déclarée ne l'est pas, même si une source actuelle
      // vient la confirmer : la parole de l'espace n'est pas une déduction.
      deduced: origins.includes('current_inference') && !origins.includes('workspace_declared'),
      divergences,
      correction: null,
    }
    const correction = input.corrections?.get(partner.id)
    const relation = correction ? applyEcosystemCorrection(derived, correction) : derived
    relations.push(relation)

    if (divergences.length > 0) {
      toQualify.push({ id: partner.id, name: partner.name, reason: 'divergent_sources' })
    } else if (!relationMayAssert(relation) && proof === null && origins.length > 0) {
      // Une ligne dont l'origine PROMET une preuve qui n'est pas là : c'est
      // exactement ce qu'il faut aller chercher, et pas ce qu'il faut afficher
      // comme un fait.
      toQualify.push({ id: partner.id, name: partner.name, reason: 'no_proof' })
    }
  }

  return { relations, toQualify, presence: ecosystemPresence(relations) }
}
