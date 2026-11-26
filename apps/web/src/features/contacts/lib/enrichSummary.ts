/**
 * #2297.48 — le récapitulatif chiffré d'un lot d'enrichissement, PAR CHAMP.
 *
 * Avant ce module, `ContactContent.enrichSelectedContacts` ne comptait qu'un
 * seul agrégat (« trouvé » = email OU téléphone confondus), perdant la
 * ventilation par champ que l'issue #2297 demande explicitement (« 38 emails
 * trouvés / 17 mobiles trouvés / 9 identités à confirmer / 6 sans résultat /
 * 0 envoyé »). « Mobile » n'est pas modélisé séparément du téléphone
 * professionnel (#2297.8, absent du produit) — ce module compte le TÉLÉPHONE
 * trouvé, jamais un champ plus précis que ce que le produit a réellement.
 *
 * Une identité AMBIGUË (#2297.17/#2297.18) n'est jamais comptée comme
 * « sans résultat » : les deux questions sont différentes (rien trouvé, vs.
 * une décision humaine manque) et le mélange masquerait la seconde.
 *
 * Pur : aucune dépendance, aucun I/O — comme `enrichBilling.ts`, dont ce
 * module est le compagnon (celui-ci compte l'ISSUE d'un lot déjà envoyé,
 * celui-là décide qui PART et ce qu'il coûte).
 */
export type BulkEnrichmentOutcome = {
  email: string | null
  phone: string | null
  /** `Contact['last_enrichment_result']` côté web — vocabulaire de la contrainte SQL. */
  last_enrichment_result?: string | null
}

type BulkEnrichmentSummary = {
  emailsFound: number
  phonesFound: number
  identitiesToConfirm: number
  withoutResult: number
  failed: number
}

/**
 * `failed` vient de l'appelant (les exceptions catchées n'ont pas d'`outcome`
 * à lire) — jamais recompté ici, une seule source par compteur.
 */
export function bulkEnrichmentSummaryOf(
  outcomes: readonly BulkEnrichmentOutcome[],
  failed: number,
): BulkEnrichmentSummary {
  let emailsFound = 0
  let phonesFound = 0
  let identitiesToConfirm = 0
  let withoutResult = 0

  for (const outcome of outcomes) {
    if (outcome.last_enrichment_result === 'ambiguous') {
      identitiesToConfirm += 1
      continue
    }
    let matchedAField = false
    if (outcome.email) {
      emailsFound += 1
      matchedAField = true
    }
    if (outcome.phone) {
      phonesFound += 1
      matchedAField = true
    }
    if (!matchedAField) withoutResult += 1
  }

  return { emailsFound, phonesFound, identitiesToConfirm, withoutResult, failed }
}
