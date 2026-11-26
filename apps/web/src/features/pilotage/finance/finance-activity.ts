/**
 * L'ACTIVITÉ RÉCENTE — la bande du bas de la variante 1, REFUSÉE le 26/08,
 * **rouverte et levée par Louis le 31/08/2026**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT REFUSÉ, ET CE QUI TIENT ENCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le refus tenait en une phrase : « un journal ne fait prendre aucune
 * décision ». Il était juste **contre la bande d'alertes**, qui transforme un
 * chiffre en file de travail, et le dossier avait raison de préférer la seconde
 * quand il fallait n'en garder qu'une.
 *
 * Louis a tranché le 31/08 : les deux, **et dans cet ordre**. La bande d'alertes
 * reste au-dessus — elle dit ce qu'on fait aujourd'hui —, l'activité récente
 * arrive dessous et répond à une autre question : « est-ce que ça bouge ? ».
 * Un tableau de bord dont rien ne bouge et un tableau de bord en panne se
 * ressemblent, et c'est le seul manque que le journal comble.
 *
 * ⚠️ Ce qui n'est PAS levé : l'activité récente ne remplace pas les alertes, ne
 * porte aucun geste d'écriture, et ne montre RIEN dont la date soit inconnue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS ÉVÉNEMENTS QU'ON SAIT DATER, ET LES DEUX QU'ON NE SAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette en montre cinq : mission démarrée · facture envoyée · CRA validé ·
 * paiement reçu · CRA bloqué. Trois ont une source datée dans le dépôt :
 *
 *  · **mission démarrée** — `missions.started_on`, servi par la file ADV ;
 *  · **relevé validé**    — `TimesheetLine.validatedByClientAt` ;
 *  · **relevé refusé**    — `TimesheetLine.rejectedAt`.
 *
 * Les deux autres n'en ont pas, et ce ne sont pas les mêmes absences :
 *
 *  · **facture envoyée** — le produit **n'émet aucune facture**, et Louis l'a
 *    reconfirmé le 31/08/2026. Il n'y a pas de source parce qu'il n'y a pas
 *    d'objet : ce n'est pas une lacune à combler, c'est une frontière.
 *  · **paiement reçu** — les encaissements existent, mais la seule dérivation
 *    (`summarizeCollections`) rend des MONTANTS par mois, pas des événements
 *    datés. Un « paiement reçu il y a 5 h » supposerait une date qu'aucune
 *    lecture atteignable depuis cet écran ne porte.
 *
 * Elles sont donc NOMMÉES à l'écran plutôt que tues : une bande qui montre trois
 * types d'événements sans dire qu'elle en ignore deux fait croire qu'il ne s'est
 * rien passé d'autre.
 */

/** Ce qu'on sait dater. `ADV_START` vient de la file ADV, les deux autres des relevés. */
export const FINANCE_ACTIVITY_KINDS = ['mission_started', 'timesheet_validated', 'timesheet_rejected'] as const
/** Local : il ne sert qu'à typer `FinanceActivityItem.kind` juste en dessous.
 *  L'exporter élargirait la surface du module pour rien (règle knip du dépôt). */
type FinanceActivityKind = (typeof FINANCE_ACTIVITY_KINDS)[number]

/**
 * Ce que la maquette montre et que le dépôt ne sait PAS dater — avec, pour
 * chacun, le blocage exact. Le registre est la moitié la plus utile du lot :
 * sans lui, la prochaine personne croit à un oubli et recode une source.
 */
export const FINANCE_ACTIVITY_NOT_DATED = ['invoice_sent', 'payment_received'] as const

export type FinanceActivityItem = {
  /** Stable et unique : deux relevés d'une même mission sont deux lignes. */
  id: string
  kind: FinanceActivityKind
  /** L'horodatage ISO. **Jamais absent** — voir `usableDate`. */
  at: string
  /** Ce dont on parle : « Ingénieur DevOps — Lacoste ». `null` si non lu. */
  subject: string | null
}

/** Cinq, comme la bande d'alertes juste au-dessus : deux plafonds différents
 *  pour deux bandes empilées se liraient comme un bug d'affichage. */
export const FINANCE_ACTIVITY_MAX = 5

/** Les entrées de la file ADV dont ce calcul a besoin, et rien de plus. */
type AdvLike = {
  missionId: string
  kind: 'start' | 'renewal'
  startedOn: string | null
  missionLabel: string | null
  accountName: string | null
}

/** Les lignes de relevés dont ce calcul a besoin, et rien de plus. */
type TimesheetLike = {
  timesheetId: string | null
  missionId: string
  missionLabel: string | null
  accountName: string | null
  consultantName: string | null
  validatedByClientAt: string | null
  rejectedAt: string | null
}

/**
 * Une date EXPLOITABLE, ou `null`.
 *
 * ⚠️ Une date illisible fait SORTIR l'événement, elle ne le fait pas remonter à
 * « maintenant » ni tomber à l'époque zéro. Les deux replis existent dans la
 * nature et sont pires que l'absence : l'un met un vieil événement en tête de
 * bande, l'autre le range en 1970 juste sous les vrais.
 */
function usableDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

/** « Ingénieur DevOps — Lacoste », ou la moitié qu'on connaît, ou `null`. */
function subjectOf(parts: ReadonlyArray<string | null | undefined>): string | null {
  const kept = parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
  return kept.length === 0 ? null : kept.join(' — ')
}

/**
 * La bande d'activité récente : ce qui a bougé, du plus récent au plus ancien.
 *
 * @param now Le moment de lecture. Les événements **postérieurs** en sortent :
 *            une mission qui démarre le mois prochain est un PLAN, pas une
 *            activité récente, et l'annoncer au passé serait faux.
 */
export function financeActivity(
  input: { adv?: readonly AdvLike[] | null; timesheets?: readonly TimesheetLike[] | null },
  now: Date = new Date(),
): { shown: FinanceActivityItem[]; all: FinanceActivityItem[]; hidden: number } {
  const nowMs = now.getTime()
  const items: FinanceActivityItem[] = []

  for (const dossier of input.adv ?? []) {
    // Seulement les DÉMARRAGES : un renouvellement à traiter est une échéance
    // future, il n'a pas « eu lieu ». Le confondre avec un démarrage mettrait
    // du futur dans un journal.
    if (dossier.kind !== 'start') continue
    const at = usableDate(dossier.startedOn)
    if (at === null || Date.parse(at) > nowMs) continue
    items.push({
      id: `mission_started:${dossier.missionId}`,
      kind: 'mission_started',
      at,
      subject: subjectOf([dossier.missionLabel, dossier.accountName]),
    })
  }

  for (const line of input.timesheets ?? []) {
    // ⚠️ Une ligne SANS relevé déposé (`timesheetId: null`) n'a rien à dater.
    // Sa clé retombe sur la mission, ce qui suffit : elle ne peut porter ni
    // validation ni refus, donc aucun doublon possible.
    const key = line.timesheetId ?? line.missionId
    const who = subjectOf([line.missionLabel, line.accountName, line.consultantName])

    const validatedAt = usableDate(line.validatedByClientAt)
    if (validatedAt !== null && Date.parse(validatedAt) <= nowMs) {
      items.push({ id: `timesheet_validated:${key}`, kind: 'timesheet_validated', at: validatedAt, subject: who })
    }
    // Un relevé peut avoir été refusé PUIS redéposé et validé : les deux
    // événements ont eu lieu, et « on archive, on ne supprime pas ». La bande
    // les montre tous les deux, chacun à sa date.
    const rejectedAt = usableDate(line.rejectedAt)
    if (rejectedAt !== null && Date.parse(rejectedAt) <= nowMs) {
      items.push({ id: `timesheet_rejected:${key}`, kind: 'timesheet_rejected', at: rejectedAt, subject: who })
    }
  }

  // Le plus récent en tête. `id` départage les ex æquo — sans quoi l'ordre
  // dépendrait de celui des deux requêtes, et la bande se réordonnerait toute
  // seule d'un rendu à l'autre.
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))

  return {
    shown: items.slice(0, FINANCE_ACTIVITY_MAX),
    /**
     * L'UNION COMPLÈTE des trois familles — la destination de « voir toute
     * l'activité » (01/09/2026).
     *
     * Le lot d'origine posait `seeAllHref={null}` avec une raison exacte :
     * « aucun écran ne montre l'union de ces trois événements — les relevés
     * vivent sur `/missions/cra`, les démarrages sur `/missions/adv` ; un lien
     * qui n'en montrerait qu'un tiers est le lien mort que ce dépôt refuse ».
     *
     * La conclusion était juste et incomplète : la seule destination qui montre
     * l'union est CET écran, et elle n'avait pas besoin d'une route. Les trois
     * familles sont déjà réunies, triées et datées ICI — les replier à cinq
     * puis renvoyer ailleurs pour les revoir était le détour, pas le lien. La
     * bande les déplie sur place.
     *
     * ⚠️ Ce n'est PAS un journal d'espace, et ça ne le devient pas : la
     * population reste celle du mois demandé, celle que les deux lectures de
     * l'écran ont déjà chargée. Aucune requête de plus, donc aucun périmètre de
     * plus — un « voir tout » qui élargirait la population en silence
     * répondrait à une autre question que celle qu'on a posée.
     */
    all: items,
    // Replier en silence, c'est laisser croire qu'il ne s'est rien passé d'autre.
    hidden: Math.max(0, items.length - FINANCE_ACTIVITY_MAX),
  }
}
