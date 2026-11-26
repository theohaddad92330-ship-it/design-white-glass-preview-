import { z } from 'zod'

/**
 * Ce que le CRM sait, et que Bellum ignorait (recette finale §58, P1-07).
 *
 * L'export existait : Bellum POUSSE un contact vers le CRM. La lecture entrante
 * manquait au niveau du contact, et le trou avait une conséquence concrète —
 * « déjà connu » ne connaissait que les contacts que NOUS avions poussés. Un
 * collègue qui ajoute la fiche à la main dans le CRM restait invisible, et
 * Bellum proposait tranquillement d'aller contacter quelqu'un que l'équipe
 * travaille déjà. C'est la faute qui coûte le plus cher en crédibilité, parce
 * que le client, lui, la voit.
 *
 * **La règle de résolution (arbitrage Louis, 03/08).** En cas d'écart, la valeur
 * BELLUM fait foi par défaut, et l'utilisateur peut adopter celle du CRM d'un
 * geste explicite.
 *
 * Le défaut n'est pas arbitraire : la valeur Bellum vient d'un enrichissement
 * daté et sourcé, là où une fiche CRM peut dormir depuis deux ans sans que rien
 * ne le dise. Choisir l'inverse ferait régulièrement remplacer une donnée
 * fraîche par une donnée périmée, en silence.
 *
 * Ce qu'on ne fait toujours PAS : réconcilier tout seul. Adopter la valeur du
 * CRM est un geste de l'utilisateur, jamais une décision du produit — et le
 * produit n'écrit rien dans le CRM de sa propre initiative. Une réconciliation
 * automatique dans un sens fabrique des doublons, dans l'autre elle efface une
 * donnée juste, et les deux se découvrent trop tard.
 *
 * C'est aussi pourquoi le produit dit « lecture et export », jamais
 * « synchronisation complète » : la garde anti-promesse continue de refuser la
 * seconde formulation, et elle a raison de le faire.
 */

/** Ce que le CRM rend sur un contact, réduit à ce qui sert. */
export type CrmContactSnapshot = {
  /** Identifiant de la fiche côté CRM. */
  recordId: string
  provider: string
  email?: string | null
  phone?: string | null
  /** Le commercial à qui la fiche est attribuée dans le CRM. */
  ownerName?: string | null
  /** Dernière activité enregistrée côté CRM (ISO). */
  lastActivityAt?: string | null
}

/** Ce que Bellum sait du même contact. */
export type BellumContactFacts = {
  email?: string | null
  phone?: string | null
}

/** Un écart entre les deux, nommé. */
export type CrmDivergence = {
  field: 'email' | 'phone'
  bellum: string
  crm: string
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * Les écarts entre ce que Bellum a et ce que le CRM a.
 *
 * Une valeur ABSENTE d'un côté n'est pas un écart : c'est un complément. Le
 * traiter comme une divergence noierait les vrais désaccords sous des dizaines
 * de « le CRM n'a pas le téléphone », et personne ne lirait plus la liste.
 */
export function detectDivergences(
  bellum: BellumContactFacts,
  crm: CrmContactSnapshot | null | undefined,
): CrmDivergence[] {
  if (!crm) return []
  const out: CrmDivergence[] = []
  for (const field of ['email', 'phone'] as const) {
    const mine = norm(bellum[field])
    const theirs = norm(crm[field])
    if (mine && theirs && mine !== theirs) {
      out.push({ field, bellum: (bellum[field] as string).trim(), crm: (crm[field] as string).trim() })
    }
  }
  return out
}

/** D'où vient la valeur retenue pour un champ en écart. */
export type DivergenceWinner = 'bellum' | 'crm'

/**
 * La valeur qui fait foi sur un champ en écart.
 *
 * `adopted` porte le choix EXPLICITE de l'utilisateur pour ce champ. Absent, la
 * valeur Bellum gagne — c'est le défaut arbitré, et il est du bon côté : une
 * donnée enrichie récemment vaut mieux qu'une fiche CRM qui peut dormir depuis
 * deux ans.
 */
export function resolveDivergence(
  divergence: CrmDivergence,
  adopted?: DivergenceWinner | null,
): { value: string; source: DivergenceWinner; overridden: boolean } {
  const source: DivergenceWinner = adopted === 'crm' ? 'crm' : 'bellum'
  return {
    value: source === 'crm' ? divergence.crm : divergence.bellum,
    source,
    overridden: adopted === 'crm',
  }
}

/**
 * Ce contact est-il DÉJÀ connu de l'équipe ?
 *
 * Vrai dès qu'une fiche existe côté CRM, qu'elle vienne de notre export ou de
 * la main d'un collègue. C'est la correction du §58 : l'ancien test ne
 * regardait que notre propre trace, donc il répondait « non » sur un contact
 * que toute l'équipe travaillait.
 */
export function isKnownToTeam(input: {
  crmSnapshot?: CrmContactSnapshot | null
  /** Notre propre trace d'export, conservée pour les CRM non lisibles. */
  exportedAt?: string | null
  emailSentAt?: string | null
}): boolean {
  if (input.crmSnapshot) return true
  return Boolean((input.exportedAt ?? '').trim() || (input.emailSentAt ?? '').trim())
}

/**
 * Faut-il proposer d'exporter ce contact ?
 *
 * Non s'il est déjà côté CRM : reproposer l'export d'une fiche existante est
 * précisément ce qui crée les doublons que le §58 veut éviter. Le bouton devient
 * « mettre à jour », et c'est un geste différent, que l'utilisateur choisit.
 */
export function shouldOfferExport(snapshot: CrmContactSnapshot | null | undefined): boolean {
  return !snapshot
}

/**
 * Adopter la valeur du CRM sur UN champ (arbitrage Louis du 03/08).
 *
 * Volontairement étroit : un champ nommé, une valeur, et rien d'autre. Un
 * endpoint générique « modifier un contact » ouvrirait un chemin d'écriture
 * qu'aucune règle ne borne, alors que ce geste-ci a un sens précis — « le CRM a
 * raison sur ce point » — et se journalise comme tel.
 */
export const adoptCrmValueSchema = z.object({
  field: z.enum(['email', 'phone']),
})
export type AdoptCrmValue = z.infer<typeof adoptCrmValueSchema>
