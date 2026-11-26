import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OUTGOING_PAYMENT_STATUSES } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * CE QUE LA SALLE MONTRE DE L'ÉCRAN DES PAIEMENTS SORTANTS (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, EN PLUS DE `demo-coverage.spec.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde PAR TABLE vérifie qu'une décision a été prise et qu'un `INSERT INTO
 * outgoing_payments` existe quelque part. Elle ne peut pas voir si les lignes
 * semées sont COHÉRENTES avec ce que l'écran lit — un paiement `valide` sur un
 * relevé jamais validé passerait sa vérification et ouvrirait devant un
 * prospect une ligne que le produit REFUSE de créer.
 *
 * C'est le défaut « le semis doit lire comme l'écran », et il se paie en
 * réunion, pas en CI.
 *
 * ⚠️ Cette garde LIT — le premier test le prouve — et elle sait dire NON : les
 * deux tests de cohérence tombent dès qu'on déplace un état sur une mission
 * dont le relevé ne l'autorise pas, ou qu'on retire une facture.
 */

/** Les missions du client de démonstration qui portent un paiement sortant. */
const seeded = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.outgoing_payment)

describe('la salle de démonstration montre le cycle du paiement sortant', () => {
  it('a un corpus — une garde qui ne lit rien est verte sur du vide', () => {
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
    expect(seeded.length).toBeGreaterThan(0)
  })

  it('sème QUATRE paiements, et laisse les autres missions en `non_genere` DÉDUIT', () => {
    // En semer un par mission ferait mesurer notre propre semis au compteur
    // « paiement non généré » de la maquette. Le quatrième — `paye` — a
    // rejoint les trois premiers le 31/08/2026 : la salle ne montrait jusque
    // là JAMAIS le seau « Payés » de la maquette.
    expect(seeded).toHaveLength(4)
    expect(seeded.length).toBeLessThan(DEMO_DELIVERY_CLIENT.missions.length)
  })

  it('porte quatre états DISTINCTS, tous connus du contrat', () => {
    const states = seeded.map(mission => mission.outgoing_payment?.status)
    expect(new Set(states).size).toBe(4)
    for (const state of states) {
      expect(OUTGOING_PAYMENT_STATUSES).toContain(state)
    }
  })

  it('montre au moins un paiement PAYÉ — le seau « Payés » de la maquette ne reste plus vide', () => {
    const paid = seeded.filter(mission => mission.outgoing_payment?.status === 'paye')
    expect(paid.length).toBeGreaterThan(0)
    // Un montant SORTI distinct du DÛ, jamais recopié : l'écart EST
    // l'information (une retenue, un acompte…).
    for (const mission of paid) {
      const settled = mission.outgoing_payment?.settled_amount_cents
      const due = mission.outgoing_payment?.amount_cents
      expect(settled).not.toBeNull()
      expect(settled).not.toBe(due)
    }
  })

  it('montre au moins un paiement EN RETARD — sinon la relance en masse s’ouvre désactivée', () => {
    // C'est le seul état sur lequel le bouton « Relancer les paiements » agit.
    // Sans lui, la capacité entière est invisible devant un prospect.
    const overdue = seeded.filter(
      mission =>
        mission.outgoing_payment?.status === 'valide' && (mission.outgoing_payment?.scheduled_days_ago ?? 0) > 0,
    )
    expect(overdue.length).toBeGreaterThan(0)
  })

  it('n’assume un paiement QUE sur un relevé validé par le client', () => {
    // La condition qui protège d'un décaissement sur des jours que le client
    // n'a jamais signés. Semer l'inverse montrerait une ligne que
    // `OutgoingPaymentsService.generate` refuse de produire.
    for (const mission of seeded) {
      if (mission.outgoing_payment?.status === 'rejete') continue
      expect(mission.timesheet?.status).toBe('validated')
    }
  })

  it('ne chiffre un paiement QUE sur une mission qui porte une facture entrante', () => {
    // On ne paie pas sur parole : un montant sans pièce s'afficherait à côté de
    // « aucune facture ne chiffre encore ce paiement ».
    for (const mission of seeded) {
      if (mission.outgoing_payment?.amount_cents === null) continue
      expect(mission.supplier_invoices?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('exige un MOTIF sur tout paiement refusé — la contrainte SQL le tient aussi', () => {
    for (const mission of seeded) {
      if (mission.outgoing_payment?.status !== 'rejete') continue
      expect((mission.outgoing_payment?.rejection_reason ?? '').trim().length).toBeGreaterThan(20)
    }
  })

  it('n’écrit AUCUN montant à zéro — « non mesuré » n’est jamais « 0 »', () => {
    for (const mission of seeded) {
      expect(mission.outgoing_payment?.amount_cents).not.toBe(0)
      expect(mission.outgoing_payment?.settled_amount_cents).not.toBe(0)
    }
  })

  it('est réellement ÉCRITE par le service de seed, pas seulement déclarée', () => {
    // Sans ce test, poser les trois lignes dans le jeu de données et oublier
    // l'`INSERT` ferait passer la CI au vert sur un écran vide — le défaut
    // « code jamais RE-exécuté », dans sa forme la plus pure.
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain('INSERT INTO outgoing_payments')
    expect(source).toContain('mission.outgoing_payment')
  })

  it('sème le paiement APRÈS la facture qui le justifie', () => {
    // « Ce qui LIT après ce qui ÉCRIT » : l'`INSERT` va chercher la plus récente
    // facture de la mission. Écrit avant elles, il laisserait
    // `supplier_invoice_id` à `null` sur toutes les lignes, en silence.
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source.indexOf('INSERT INTO supplier_invoices')).toBeLessThan(
      source.indexOf('INSERT INTO outgoing_payments'),
    )
  })

  it('n’écrit AUCUNE coordonnée bancaire — Bellum ne stocke aucun IBAN', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const insert = source.slice(
      source.indexOf('INSERT INTO outgoing_payments'),
      source.indexOf('INSERT INTO mission_timesheets'),
    )
    expect(insert.length).toBeGreaterThan(200)
    expect(/iban|bic\b|swift|domiciliation/i.test(insert)).toBe(false)
  })
})
