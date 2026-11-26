/**
 * LAU-FINAL-038 (#2297), section LOT — restituer un lot d'enrichissements en
 * comptes nommés (« 38 emails trouvés / 17 mobiles trouvés / 9 identités à
 * confirmer / 6 sans résultat / 0 envoyé »), jamais un total muet. Pure —
 * testable sans réseau ni React ; l'appelant (`useBulkVerifyContacts`) ne fait
 * qu'assembler les résultats déjà pollés par contact.
 */

/** Le résultat par contact, une fois son job d'enrichissement réglé.
 *  `matched` porte les deux coordonnées séparément : un contact peut compter à
 *  la fois dans « emails trouvés » et « mobiles trouvés » — ce ne sont pas des
 *  compartiments exclusifs, contrairement à `ambiguous`/`no_result`. */
type BulkEnrichmentOutcome =
  | { status: 'matched'; email: boolean; phone: boolean }
  | { status: 'ambiguous' }
  | { status: 'no_result' }

type BulkEnrichmentSummary = {
  emailsFound: number
  mobilesFound: number
  toConfirm: number
  /** Introuvable, refusé (opt-out, permission), panne fournisseur, ou matché
   *  sans aucune coordonnée — le lot ne distingue pas la RAISON ici, chaque
   *  fiche porte la sienne (même discipline que `enqueueBulk`, #2296.39). */
  noResult: number
  /** Toujours 0 : cette vérification ne prépare ni n'envoie jamais un message
   *  (doctrine — Laura prépare, le commercial envoie). Porté explicitement,
   *  pas omis, pour que le gabarit du retour reste celui du ticket. */
  sent: number
}

export function summarizeBulkEnrichmentOutcomes(outcomes: readonly BulkEnrichmentOutcome[]): BulkEnrichmentSummary {
  const summary: BulkEnrichmentSummary = { emailsFound: 0, mobilesFound: 0, toConfirm: 0, noResult: 0, sent: 0 }
  for (const outcome of outcomes) {
    if (outcome.status === 'ambiguous') {
      summary.toConfirm += 1
      continue
    }
    if (outcome.status === 'no_result') {
      summary.noResult += 1
      continue
    }
    if (outcome.email) summary.emailsFound += 1
    if (outcome.phone) summary.mobilesFound += 1
    if (!outcome.email && !outcome.phone) summary.noResult += 1
  }
  return summary
}

/** Le sous-ensemble d'`EnrichContactResponse` dont ce module a besoin — pas
 *  d'import du type complet pour rester découplé de `api.ts`. */
type SettledEnrichmentValue = {
  email?: string | null
  phone?: string | null
  last_enrichment_result?: string | null
}

/**
 * Convertit le résultat brut d'un `Promise.allSettled` (une entrée par contact
 * du lot, chacune pollée jusqu'à son terme) en `BulkEnrichmentOutcome`. Un
 * rejet — job introuvable, refus serveur (`permission_denied`, `opt_out`,
 * crédits insuffisants), panne fournisseur, timeout de suivi — devient
 * `no_result` : le lot ne masque aucune fiche, mais ne distingue pas ICI la
 * raison individuelle, déjà consignée fiche par fiche.
 */
export function settledEnrichmentToOutcome(
  settled: PromiseSettledResult<SettledEnrichmentValue>,
): BulkEnrichmentOutcome {
  if (settled.status === 'rejected') return { status: 'no_result' }
  if (settled.value.last_enrichment_result === 'ambiguous') return { status: 'ambiguous' }
  return { status: 'matched', email: Boolean(settled.value.email), phone: Boolean(settled.value.phone) }
}
