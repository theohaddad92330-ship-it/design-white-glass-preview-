import { DEMO_MISSION_CHAIN_STEPS, DEMO_MISSION_TO_CASH_TIMELINE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DE LA CHAÎNE D'UNE MISSION (#2199, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE À CÔTÉ DE `demo-coverage.spec.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * La bande n'ajoute AUCUNE table : elle compose `missions`,
 * `mission_timesheets`, `mission_commercial_terms` et `invoice_readiness`, tous
 * déjà classés. La garde par table ne lui pose donc aucune question — et une
 * bande dont les cinq cellules diraient « non mesuré » se découvrirait en
 * réunion, pas en CI. **Une garde aveugle n'est pas une exemption.**
 *
 * ⚠️ Elle ne LIT PAS la prose de `demo-coverage.ts`. Une raison écrite est une
 * AFFIRMATION sur les données, et ce dépôt a déjà payé « un audit documentaire
 * n'est pas le code ». Chaque état `seede` est RECOMPTÉ sur
 * `DEMO_DELIVERY_CLIENT`.
 *
 * ⚠️ Et chaque contrôle vérifie les DEUX moitiés — ce qui est franchi et ce qui
 * bloque. Une salle où tout serait vert ne montrerait jamais le motif NOMMÉ,
 * c'est-à-dire la seule chose qui distingue cette bande d'un compteur.
 */

const STEPS = ['timesheet', 'billable', 'invoice', 'collection', 'reposition'] as const

/** Les statuts de relevé qui APPELLENT un geste — ceux qui font dire « bloquée »
 *  à l'étape CRA. `validated` et `not_required` en sont exclus, chacun pour sa
 *  raison : le premier est réglé, le second ne se pose pas. */
const BLOCKING_TIMESHEET_STATUSES = ['draft', 'submitted', 'rejected', 'disputed', 'missing', 'expected']

/** L'échelle de renouvellement par défaut du produit : au-delà du plus grand
 *  palier, une mission est « loin de sa fin ». Recopiée ici volontairement à un
 *  seul nombre — le plus grand — parce que ce fichier ne juge QUE la salle. */
const LARGEST_RENEWAL_WINDOW_DAYS = 60

describe('parité démo — la chaîne d’une mission', () => {
  const missions = DEMO_DELIVERY_CLIENT.missions
  const invoices = DEMO_DELIVERY_CLIENT.invoices

  it('la garde LIT quelque chose — le jeu n’est pas vide', () => {
    // Le faux zéro silencieux : sur un jeu vide, tous les comptes ci-dessous
    // vaudraient 0 et seuls les seuils « au moins un » rougiraient.
    expect(missions.length).toBeGreaterThan(5)
    expect(invoices.length).toBeGreaterThan(5)
  })

  it('les cinq étapes sont classées — aucune ne passe sans réponse écrite', () => {
    expect(Object.keys(DEMO_MISSION_CHAIN_STEPS).sort()).toEqual([...STEPS].sort())
    for (const step of STEPS) {
      const entry = DEMO_MISSION_CHAIN_STEPS[step]
      expect(entry).toBeDefined()
      // Une raison d'une ligne n'est pas une raison : elle doit tenir devant
      // quelqu'un qui présente le produit.
      expect((entry?.reason ?? '').length).toBeGreaterThan(180)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  Les états `seede` sont RECOMPTÉS, pas crus sur parole                  */
  /* ---------------------------------------------------------------------- */

  it('le RELEVÉ se voit dans ses trois états — validé, bloquant, et sans objet', () => {
    const withTimesheet = missions.filter(m => 'timesheet' in m && m.timesheet)
    const validated = withTimesheet.filter(m => m.timesheet?.status === 'validated')
    const blocking = withTimesheet.filter(m => BLOCKING_TIMESHEET_STATUSES.includes(m.timesheet?.status ?? ''))
    // Une mission qui ne se facture pas au mois ne produit pas de relevé
    // mensuel : c'est « sans objet », et ce n'est pas « non mesuré ».
    const notMonthly = missions.filter(m => m.billing_cadence !== 'monthly')
    expect(DEMO_MISSION_CHAIN_STEPS['timesheet']?.state).toBe('seede')
    expect(validated.length).toBeGreaterThan(0)
    // ⚠️ La moitié qu'on oublie : sans un relevé qui BLOQUE, le motif nommé —
    // la seule chose qui distingue cette bande d'un compteur — ne se montre
    // nulle part.
    expect(blocking.length).toBeGreaterThan(0)
    expect(notMonthly.length).toBeGreaterThan(0)
  })

  it('le CA FACTURABLE a un motif QUI LUI APPARTIENT — le bon de commande', () => {
    // La bande refuse par construction de redire le motif de l'étape
    // précédente : sans un bloqueur étranger au relevé, cette cellule ne
    // montrerait jamais de motif à elle.
    const requiringPo = missions.filter(m => m.requires_po === true)
    const notRequiringPo = missions.filter(m => m.requires_po === false)
    expect(DEMO_MISSION_CHAIN_STEPS['billable']?.state).toBe('seede')
    expect(requiringPo.length).toBeGreaterThan(0)
    // …et la moitié inverse, sans quoi un prospect conclurait que Bellum
    // réclame un bon de commande à tout le monde.
    expect(notRequiringPo.length).toBeGreaterThan(0)
  })

  it('la FACTURE a son historique, et RIEN sur le mois que la bande lit', () => {
    // Les deux sont voulus, et le second est une décision écrite au-dessus du
    // tableau `invoices` : une facture sur le mois précédent rendrait
    // « facturé » les trois états que les missions de la salle existent pour
    // montrer. Si ce test tombe, ce n'est pas la bande qu'il faut réparer —
    // c'est cette décision-là qui vient d'être défaite.
    expect(DEMO_MISSION_CHAIN_STEPS['invoice']?.state).toBe('seede')
    expect(invoices.length).toBeGreaterThan(0)
    expect(invoices.filter(invoice => invoice.months_ago <= 1)).toEqual([])
  })

  it('l’ENCAISSEMENT porte ses deux vérités — des mois réglés, et un litige qui court', () => {
    const settled = invoices.filter(invoice => invoice.payment_delay_days !== null)
    const openDispute = invoices.filter(
      invoice =>
        invoice.dispute_opened_days_after_invoice !== null && invoice.dispute_resolved_days_after_invoice === null,
    )
    expect(DEMO_MISSION_CHAIN_STEPS['collection']?.state).toBe('seede')
    expect(settled.length).toBeGreaterThan(0)
    // Un litige qui court est ce qui prouve que les relances S'ARRÊTENT : sans
    // lui, « bloquée » ne se distingue jamais de « en retard ».
    expect(openDispute.length).toBeGreaterThan(0)
  })

  it('le REPOSITIONNEMENT se voit dans ses QUATRE positions semées (#2195.50)', () => {
    const inWindow = missions.filter(
      m => typeof m.ends_in_days === 'number' && m.ends_in_days > 0 && m.ends_in_days <= LARGEST_RENEWAL_WINDOW_DAYS,
    )
    const pastDue = missions.filter(m => typeof m.ends_in_days === 'number' && m.ends_in_days <= 0)
    // ⚠️ La moitié qu'on oublie : sans une mission SANS date de fin, la phrase
    // « impossible de dire quand repositionner » ne se montre nulle part, et
    // c'est exactement la partie du produit qui dit ce qu'il ignore.
    const noEndDate = missions.filter(m => m.ends_in_days === null)
    // #2195.50 (20/09/2026) — la QUATRIÈME position, « sans objet » : une fin
    // encore lointaine. Absente par choix jusqu'à ce lot (#2195.2), elle est
    // désormais seedée elle aussi — voir le test suivant pour la preuve que
    // c'est bien elle qui a changé, et pas une des trois autres.
    const far = missions.filter(m => typeof m.ends_in_days === 'number' && m.ends_in_days > LARGEST_RENEWAL_WINDOW_DAYS)
    expect(DEMO_MISSION_CHAIN_STEPS['reposition']?.state).toBe('seede')
    expect(inWindow.length).toBeGreaterThan(0)
    expect(pastDue.length).toBeGreaterThan(0)
    expect(noEndDate.length).toBeGreaterThan(0)
    expect(far.length).toBeGreaterThan(0)
  })

  it('la QUATRIÈME position du repositionnement est désormais PRÉSENTE, et la raison le DIT', () => {
    // Avant #2195.50 : « sans objet » (une fin encore lointaine) ne se voyait
    // sur AUCUNE mission de la salle — conséquence d'un choix ANTÉRIEUR
    // (#2195.2), que ce test gardait en creux (`far` devait être `[]`).
    // Depuis #2195.50 (Louis, 20/09/2026), `GET /delivery/renewals` sert la
    // fenêtre lointaine et l'écran l'ordonne après « Sans date de fin » — une
    // pastille qui resterait à zéro en démonstration serait la même panne que
    // celle que #2195.2 évitait déjà pour « Sous 60 jours ». La salle porte
    // donc désormais UNE mission au-delà de la fenêtre (Marc Ouedraogo,
    // soixante et onze jours), et la raison écrite doit le dire : une entrée
    // qui affirmerait encore « trois positions » serait un audit documentaire
    // périmé, pas une garde.
    const far = missions.filter(m => typeof m.ends_in_days === 'number' && m.ends_in_days > LARGEST_RENEWAL_WINDOW_DAYS)
    expect(far.length).toBeGreaterThan(0)
    expect(DEMO_MISSION_CHAIN_STEPS['reposition']?.reason).toContain('sans objet')
    expect(DEMO_MISSION_CHAIN_STEPS['reposition']?.reason).toContain('2195.50')
  })

  it('#2421 — la timeline mission-to-cash est classée, et ses trois étapes de mission ont de quoi PROUVER', () => {
    expect(DEMO_MISSION_TO_CASH_TIMELINE.state).toBe('seede')
    expect(DEMO_MISSION_TO_CASH_TIMELINE.reason.length).toBeGreaterThan(180)
    // « Mission prête / active » se prouvent par le statut et la date de
    // démarrage : une mission sans eux rendrait « inconnue » en démonstration.
    for (const mission of missions) {
      expect(typeof mission.status).toBe('string')
      expect(typeof mission.started_days_ago).toBe('number')
    }
  })
})
