import { buildInvoiceConnectorPreview } from './invoice-connector-write-preview'

/**
 * #2418.3 — la facture PRÉPARÉE porte les champs utiles à la préparer (bon de
 * commande, lignes, devise, responsable, conditions de règlement), pas
 * seulement mission/compte/mois/montant. Additif : les quatre champs déjà
 * couverts restent inchangés (voir le test « champs déjà couverts »).
 *
 * `taxes` et `échéance` restent HORS de ce fichier : aucun taux de TVA n'est
 * suivi pour une facture CLIENT dans ce dépôt (seul `expense-report.ts` en
 * porte un, pour une note de frais FOURNISSEUR — un autre domaine), et
 * l'échéance réelle d'UNE facture ne se connaît qu'après émission (voir
 * `invoice-readiness.ts`, `dueOn` — distinct de la CONDITION qui la produira,
 * montrée ici). Un champ sans source ne s'invente pas (doctrine, jamais de
 * donnée fictive).
 */
describe('buildInvoiceConnectorPreview — #2418.3, champs additifs', () => {
  const base = {
    missionLabel: 'Renfort plateforme',
    accountName: 'ACME',
    periodMonth: '2026-09-01',
    preparedAmountCents: 1_170_000,
    days: 18,
    dailyRateCents: 65_000,
    poNumber: 'PO-2026-042',
    ownerName: 'Camille Dupuis',
    currency: 'EUR',
    paymentTermsDays: 60,
    paymentTermsBasis: 'invoice_date' as const,
  }

  it('champs déjà couverts : mission/compte/mois/montant restent identiques', () => {
    const preview = buildInvoiceConnectorPreview(base)
    expect(preview).toEqual(
      expect.arrayContaining([
        { field: 'Mission', value: 'Renfort plateforme' },
        { field: 'Compte', value: 'ACME' },
        { field: 'Mois couvert', value: '2026-09-01' },
        { field: 'Montant préparatoire', value: '11700.00 €' },
      ]),
    )
  })

  it('ajoute la ligne (jours × TJM), le bon de commande, la devise, les conditions et le chargé d’affaires', () => {
    const preview = buildInvoiceConnectorPreview(base)
    expect(preview).toEqual(
      expect.arrayContaining([
        { field: 'Ligne', value: '18 j × 650.00 €' },
        { field: 'Bon de commande', value: 'PO-2026-042' },
        { field: 'Devise', value: 'EUR' },
        { field: 'Conditions de règlement', value: '60 jours (date de facture)' },
        { field: 'Chargé d’affaires', value: 'Camille Dupuis' },
      ]),
    )
  })

  it('un champ absent s’affiche « non renseigné », jamais 0 ni vide (GA-18/19)', () => {
    const preview = buildInvoiceConnectorPreview({
      missionLabel: null,
      accountName: null,
      periodMonth: '2026-09-01',
      preparedAmountCents: null,
      days: null,
      dailyRateCents: null,
      poNumber: null,
      ownerName: null,
      currency: null,
      paymentTermsDays: null,
      paymentTermsBasis: null,
    })
    expect(preview).toEqual(
      expect.arrayContaining([
        { field: 'Ligne', value: 'non renseigné' },
        { field: 'Bon de commande', value: 'non renseigné' },
        { field: 'Devise', value: 'non renseigné' },
        { field: 'Conditions de règlement', value: 'non renseigné' },
        { field: 'Chargé d’affaires', value: 'non renseigné' },
      ]),
    )
  })

  it('des jours connus sans TJM (ou l’inverse) restent « non renseigné » — jamais un calcul à moitié deviné', () => {
    const preview = buildInvoiceConnectorPreview({ ...base, dailyRateCents: null })
    expect(preview).toEqual(expect.arrayContaining([{ field: 'Ligne', value: 'non renseigné' }]))
  })

  it('des conditions de règlement sans référentiel connu affichent le délai seul', () => {
    const preview = buildInvoiceConnectorPreview({ ...base, paymentTermsBasis: null })
    expect(preview).toEqual(expect.arrayContaining([{ field: 'Conditions de règlement', value: '60 jours' }]))
  })
})
