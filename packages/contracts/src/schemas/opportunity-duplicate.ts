import { TRIAGED_STAGES } from './opportunity-ontology.js'

/**
 * #2325.33 — « détecte les doublons [d'affaires] ».
 *
 * Même discipline que la fusion de contacts/comptes (« on PROPOSE une fusion de
 * doublons, on ne fusionne JAMAIS ») : ce module ne fusionne rien, il NOMME des
 * groupes candidats. Et même refus de la RESSEMBLANCE que le reste du dépôt
 * applique déjà aux personnes (`odoo.client.ts`, `import-writer.service.ts` :
 * « jamais une ressemblance de noms ») — ici, un EXACT match sur le libellé
 * (`label`, normalisé en casse et en espaces, jamais une similarité devinée)
 * ET sur le compte (`accountId`). Deux affaires du même compte qui portent
 * exactement le même titre sont le signal le plus probable d'une double saisie
 * (import relancé, signal redétecté et confirmé une seconde fois) — jamais une
 * comparaison entre DEUX comptes différents, où deux homonymes ne se
 * rapprochent pas (même principe que la fusion de contacts).
 *
 * Portée : seules les affaires ACTIVES (`TRIAGED_STAGES`, le même sous-ensemble
 * que `pipelineHealth`, opportunity-pipeline-health.ts) entrent en jeu — une
 * affaire gagnée/perdue/endormie dupliquée n'est plus un conflit de travail.
 *
 * Un libellé vide (`''`) ne compare RIEN : deux titres absents ne sont pas
 * « identiques », ils sont tous les deux non renseignés — les compter comme un
 * doublon inventerait un rapprochement.
 */
export type DuplicateOpportunityCandidate = {
  id: string
  accountId: string
  /** Le titre court de l'affaire (`opportunities.label`). */
  label: string
  stage: string
}

/** Un groupe de doublons NOMMÉS : au moins deux affaires du même compte, même titre. */
export type DuplicateOpportunityGroup = {
  accountId: string
  /** Le libellé tel qu'écrit sur la PREMIÈRE affaire du groupe — jamais renormalisé à l'affichage. */
  label: string
  /** Les affaires candidates au rapprochement, au moins deux. */
  opportunityIds: readonly string[]
}

function normalisedLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Les groupes de doublons d'un ensemble d'affaires.
 *
 * Déterministe, sans effet de bord, et vide quand il n'y a rien : une liste
 * vide veut dire « aucun doublon parmi CE QU'ON A LU », jamais « aucun doublon
 * dans l'espace ».
 */
export function detectDuplicateOpportunities(
  opportunities: readonly DuplicateOpportunityCandidate[],
): DuplicateOpportunityGroup[] {
  const byKey = new Map<string, DuplicateOpportunityCandidate[]>()
  for (const opportunity of opportunities) {
    if (!(TRIAGED_STAGES as readonly string[]).includes(opportunity.stage)) continue
    // Un compte INCONNU ne collisionne avec rien — même garde que `needId` sur
    // les collisions de staffing : un rapprochement sur une absence inventerait
    // un conflit.
    if (!opportunity.accountId) continue
    const label = normalisedLabel(opportunity.label ?? '')
    // Un titre vide ne rapproche rien — deux absences ne sont pas un doublon.
    if (!label) continue
    const key = `${opportunity.accountId}::${label}`
    const bucket = byKey.get(key)
    if (bucket) bucket.push(opportunity)
    else byKey.set(key, [opportunity])
  }

  const groups: DuplicateOpportunityGroup[] = []
  for (const bucket of byKey.values()) {
    // DEUX affaires DISTINCTES, pas une seule relue deux fois.
    if (bucket.length < 2) continue
    const first = bucket[0]
    if (!first) continue
    groups.push({
      accountId: first.accountId,
      label: first.label,
      opportunityIds: bucket.map(opportunity => opportunity.id),
    })
  }
  return groups
}
