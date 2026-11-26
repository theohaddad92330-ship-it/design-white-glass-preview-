import { MEASURABILITY_THRESHOLDS } from '@bellum/contracts'
import { DEMO_PROPAGATION_AGGREGATES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DES CINQ AGRÉGATS DE PROPAGATION (PDF 2 §4, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE À CÔTÉ DE `demo-coverage.spec.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces cinq chiffres n'ajoutent AUCUNE table : la garde par table ne leur pose
 * donc aucune question, et un bandeau « ce client vous a rapporté » vide se
 * découvrirait en réunion. La maille manquante est ici.
 *
 * ⚠️ Et surtout : cette garde ne LIT PAS la prose de `demo-coverage.ts`. Une
 * raison écrite est une AFFIRMATION sur les données ; le dépôt a déjà payé
 * « un audit documentaire n'est pas le code » (cinq affirmations sur cinq
 * fausses). Chaque état `seede` est donc recompté sur `DEMO_DELIVERY_CLIENT`,
 * et une raison qui cesserait d'être vraie ferait rougir la CI.
 */

const AGGREGATES = [
  'account_revenue_cents',
  'account_average_sold_rate',
  'consultant_placements',
  'consultant_average_margin',
  'contact_signed_missions',
] as const

/** Les relevés qui portent des jours EXPLOITABLES — le même filtre que le SQL. */
const DAYS_BEARING_STATUSES = ['validated', 'submitted', 'rejected', 'disputed']

describe('parité démo — les cinq agrégats de propagation', () => {
  it('la garde LIT quelque chose — le jeu de données n’est pas vide', () => {
    // Le faux zéro silencieux : sur un jeu vide, tous les comptes ci-dessous
    // vaudraient 0 et les seuils « au moins un » seraient les seuls à rougir.
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
    expect(DEMO_DELIVERY_CLIENT.invoices.length).toBeGreaterThan(10)
  })

  it('les cinq agrégats sont classés — aucun ne passe sans réponse écrite', () => {
    expect(Object.keys(DEMO_PROPAGATION_AGGREGATES).sort()).toEqual([...AGGREGATES].sort())
    for (const key of AGGREGATES) {
      const entry = DEMO_PROPAGATION_AGGREGATES[key]
      expect(entry).toBeDefined()
      // Une raison d'une ligne n'est pas une raison : elle doit tenir devant
      // quelqu'un qui présente le produit.
      expect((entry?.reason ?? '').length).toBeGreaterThan(180)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  Les états `seede` sont RECOMPTÉS, pas crus sur parole                 */
  /* ---------------------------------------------------------------------- */

  it('le CA cumulé est réellement chiffrable — des mois facturés portent un montant', () => {
    const rated = new Set(
      DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.daily_rate !== null).map(mission => mission.label),
    )
    // `demoInvoiceHistory` ne pose un montant que si la mission porte un TJM :
    // sans mission chiffrée derrière une facture, le bandeau resterait `null`.
    const withAmount = DEMO_DELIVERY_CLIENT.invoices.filter(invoice => rated.has(invoice.mission))
    expect(DEMO_PROPAGATION_AGGREGATES['account_revenue_cents']?.state).toBe('seede')
    expect(withAmount.length).toBeGreaterThan(0)
  })

  it('le tarif vendu moyen est calculable ET partiel — les deux moitiés sont montrées', () => {
    const withRate = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.daily_rate !== null)
    const withoutRate = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.daily_rate === null)
    expect(DEMO_PROPAGATION_AGGREGATES['account_average_sold_rate']?.state).toBe('seede')
    expect(withRate.length).toBeGreaterThan(0)
    // ⚠️ La moitié qu'on oublie de montrer : sans une seule mission SANS TJM,
    // le « N missions non chiffrées » resterait invisible en démonstration, et
    // un prospect croirait la moyenne complète.
    expect(withoutRate.length).toBeGreaterThan(0)
  })

  it('les placements sont visibles, et l’un d’eux DIFFÈRE de son compte de positionnements', () => {
    const placements = new Map<string, number>()
    for (const mission of DEMO_DELIVERY_CLIENT.missions) {
      placements.set(mission.consultant, (placements.get(mission.consultant) ?? 0) + 1)
    }
    expect(DEMO_PROPAGATION_AGGREGATES['consultant_placements']?.state).toBe('seede')
    expect(placements.size).toBeGreaterThan(3)
    // Le point de la colonne : « placé » n'est pas « positionné ». Si tout le
    // monde était placé une fois, l'écart ne se verrait pas et la démonstration
    // ne dirait pas ce que le compteur sert à dire.
    expect([...placements.values()].some(value => value > 1)).toBe(true)
  })

  it('la marge par consultant se calcule pour certains et vaut `null` pour d’autres', () => {
    const measurable = DEMO_DELIVERY_CLIENT.missions.filter(
      mission =>
        mission.daily_rate !== null &&
        mission.loaded_daily_cost_cents !== null &&
        mission.timesheet !== null &&
        DAYS_BEARING_STATUSES.includes(mission.timesheet.status),
    )
    const unmeasurable = DEMO_DELIVERY_CLIENT.missions.filter(
      mission => mission.daily_rate === null || mission.loaded_daily_cost_cents === null || mission.timesheet === null,
    )
    expect(DEMO_PROPAGATION_AGGREGATES['consultant_average_margin']?.state).toBe('seede')
    expect(measurable.length).toBeGreaterThan(0)
    // Les deux états, comme partout : un chiffre, et une absence NOMMÉE.
    expect(unmeasurable.length).toBeGreaterThan(0)

    /**
     * Et la salle reste SOUS le seuil, à dessein : chaque fiche talent montre
     * donc « non mesurable — N missions sur les 5 nécessaires », qui est l'état
     * juste. Franchir le seuil afficherait une marge d'espace calculée sur une
     * poignée d'observations, avec toute l'autorité d'un pourcentage.
     *
     * ⚠️ Le compte se fait PAR CONSULTANT depuis le 29/08/2026 — c'est la maille
     * de l'écran. `PropagationService.consultantMargins` groupe les missions
     * `byConsultant` et appelle `aggregateMargin` sur CHAQUE groupe : le seuil
     * de mesurabilité s'applique donc à un consultant, jamais au total de la
     * salle. La version précédente comptait toutes les missions du jeu
     * ensemble ; elle tombait au vert dès la neuvième mission alors qu'aucune
     * fiche n'avait bougé d'état — une garde qui lit une autre maille que son
     * écran finit par interdire ce qu'elle devait protéger.
     */
    const measurableByConsultant = new Map<string, number>()
    for (const mission of measurable) {
      measurableByConsultant.set(mission.consultant, (measurableByConsultant.get(mission.consultant) ?? 0) + 1)
    }
    // Corpus non vide : sans cette ligne, un groupement raté passerait au vert
    // sur une table vide.
    expect(measurableByConsultant.size).toBeGreaterThan(0)
    const auDessus = [...measurableByConsultant].filter(([, count]) => count >= MEASURABILITY_THRESHOLDS.averageMargin)
    expect(auDessus).toEqual([])
  })

  /* ---------------------------------------------------------------------- */
  /*  Le cliquet — et ce qu'il devient une fois le trou comblé              */
  /* ---------------------------------------------------------------------- */

  it('« à semer » reste un AVEU — au plus un à la fois, et il nomme ses lignes', () => {
    const toSeed = AGGREGATES.filter(key => DEMO_PROPAGATION_AGGREGATES[key]?.state === 'a_semer')
    // ⚠️ Un cliquet, pas une tolérance. `a_semer` dit « cet écran s'ouvrira
    // vide » : un second exige une décision, pas une ligne de plus. Et ce n'est
    // JAMAIS un synonyme de « vide à dessein », qui affirme que le silence est
    // le bon état.
    //
    // ⚠️ « AU PLUS un », et non « exactement un » depuis le 28/08/2026 : le seul
    // aveu de la liste a été semé, et zéro est l'état normal. Un cliquet qui
    // EXIGERAIT un trou obligerait à en garder un ouvert pour rester vert —
    // c'est-à-dire l'inverse de ce qu'il sert à obtenir.
    expect(toSeed.length).toBeLessThanOrEqual(1)
    for (const key of toSeed) {
      // Une entrée « à semer » sans les lignes exactes est un post-it, pas une
      // décision : elle doit nommer le fichier et les champs.
      const reason = DEMO_PROPAGATION_AGGREGATES[key]?.reason ?? ''
      expect(reason).toContain('demo-dataset.ts')
    }
  })

  /**
   * LE TROU EST COMBLÉ — recompté, jamais cru sur parole.
   *
   * Ce test disait l'inverse le 28/08 au matin : « aucune mission du jeu ne
   * porte de contact de facturation », avec pour consigne de tomber le jour où
   * quelqu'un sèmerait le contact. Il est tombé le jour même, et c'est le lot
   * qui a semé les fiches qui l'a retourné — un cliquet qu'on désactive au lieu
   * de le retourner rend la garde muette pour toujours.
   *
   * Il recompte donc la MÊME chose dans l'autre sens, et garde les deux moitiés
   * de la démonstration : des missions signées, et des missions qui ne le sont
   * pas.
   */
  it('le trou est COMBLÉ — l’agrégat rend deux lignes, à des comptes différents', () => {
    const signed = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.billing_contact !== null)
    const unsigned = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.billing_contact === null)
    expect(DEMO_PROPAGATION_AGGREGATES['contact_signed_missions']?.state).toBe('seede')

    // Chaque nom cité doit exister : un `billing_contact` qui ne résout pas
    // partirait en base à `null`, et la mission se lirait comme une mission
    // sans contact — le semis le dit dans son journal, ce test l'interdit ici.
    // Décision Louis 04/10/2026 — les signataires sont des SIÈGES du dossier du
    // client de livraison (aucune personne créée).
    const carrier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name)
    const known = new Set((carrier?.contacts ?? []).map(contact => contact.full_name))
    expect(known.size).toBeGreaterThanOrEqual(2)
    for (const mission of signed) expect(known.has(mission.billing_contact ?? '')).toBe(true)

    // Le point de l'agrégat : DEUX lignes, et des comptes qui DIFFÈRENT. Une
    // seule ligne montrerait un badge, jamais la comparaison entre deux
    // interlocuteurs ; deux comptes égaux ne diraient pas que le compteur compte.
    const perContact = new Map<string, number>()
    for (const mission of signed) {
      const name = mission.billing_contact ?? ''
      perContact.set(name, (perContact.get(name) ?? 0) + 1)
    }
    expect(perContact.size).toBeGreaterThanOrEqual(2)
    expect([...perContact.values()].some(count => count > 1)).toBe(true)

    // ⚠️ La contrepartie : sans mission SANS contact, le bloqueur
    // `missing_billing_contact` disparaîtrait de la salle et un prospect ne
    // verrait jamais l'écran qui le lui demande.
    expect(unsigned.length).toBeGreaterThanOrEqual(1)
  })
})
