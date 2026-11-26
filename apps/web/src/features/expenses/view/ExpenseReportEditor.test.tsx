import type { ExpenseReportDetailView } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'

const save = vi.fn()
const submit = vi.fn()
const upload = vi.fn()

vi.mock('../api', () => ({
  useSaveExpenseReport: () => ({ mutateAsync: save, isPending: false }),
  useSubmitExpenseReport: () => ({ mutate: submit, isPending: false }),
  // #1827.1 — `expensesApi.upload` est appelé DIRECTEMENT par l'éditeur (le
  // même chemin que `AttachmentDeposit`), pas via un hook : il faut donc le
  // mocker ici pour observer ce qui part réellement au stockage.
  expensesApi: { upload },
}))

const { ExpenseReportEditor } = await import('./ExpenseReportEditor')

/**
 * LE DÉPÔT D'UNE NOTE DE FRAIS — l'écran qui manquait (31/08/2026), puis
 * #1827.1 (09/09/2026) : le dépôt-avant-saisie.
 *
 * Ce que ces tests protègent, dans l'ordre :
 *
 *  1. **La création COMMENCE par une zone de dépôt** — jamais par un
 *     formulaire vide. « Commencer sans justificatif » reste le chemin de
 *     secours, inchangé.
 *  2. **Un fichier déposé ouvre une ligne VIDE**, jamais pré-remplie d'une
 *     donnée devinée depuis son nom ou sa date — aucun OCR n'est branché sur
 *     ce domaine.
 *  3. **Rien ne part avant l'enregistrement.** Les octets ne sont envoyés
 *     qu'après que la note existe, et un échec d'envoi GARDE le tiroir ouvert,
 *     nommé, plutôt que de disparaître avec la fermeture.
 *  4. Un champ VIDE n'est pas zéro (taux de TVA non saisi → `null`).
 *  5. Deux boutons, deux promesses ; soumettre ENREGISTRE d'abord.
 *  6. Une note DÉCIDÉE ne se modifie plus, et l'écran le DIT.
 *  7. En ÉDITION, le mécanisme de nommage sans envoi reste TEL QUEL — domaine
 *     séparé, non touché par ce lot.
 */

function report(over: Partial<ExpenseReportDetailView> = {}): ExpenseReportDetailView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reference: 'F-2026-006',
    bearerName: 'Inès Kaczmarek',
    accountName: 'DINUM',
    accountId: '22222222-2222-4222-8222-222222222222',
    missionId: null,
    missionLabel: null,
    periodMonth: '2026-05',
    status: 'draft',
    lineCount: 1,
    totalAmountCents: 1850,
    submittedAt: null,
    decidedAt: null,
    decidedByName: null,
    policyCheck: { verdict: 'unknown', overageCount: 0, unmeasuredLineCount: 1, worstOverage: null },
    rejectionReason: null,
    policyLabel: null,
    reimbursementBasis: null,
    anomalies: [],
    compliance: { verdict: 'unknown', unmeasuredLineCount: 1 },
    recoverableVatCents: null,
    borneVatCents: null,
    vatUnmeasuredLineCount: 1,
    lines: [
      {
        id: 'l1',
        category: 'meal',
        label: 'Repas – Déjeuner',
        spentOn: '2026-05-15',
        city: 'Paris',
        detail: null,
        amountCents: 1850,
        vatRateBps: null,
        recoverableVatCents: null,
        capCents: null,
        overageCents: null,
        distanceKm: null,
        fiscalHorsepower: null,
      },
    ],
    attachments: [],
    missionExpenseId: null,
    ...over,
  }
}

function receipt(name = 'facture_hotel.pdf', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' })
}

/** Le chemin de secours : aucun justificatif en main, comme avant ce lot. */
async function skipDeposit(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Commencer sans justificatif' }))
}

beforeEach(() => {
  cleanup()
  save.mockReset()
  save.mockResolvedValue({ id: 'new1' })
  submit.mockReset()
  upload.mockReset()
  upload.mockResolvedValue({ id: 'att1' })
})

describe('#1827.1 — la création COMMENCE par une zone de dépôt', () => {
  it('le formulaire n’est PAS visible avant un choix : ni fichier, ni « commencer sans »', () => {
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)

    expect(screen.queryByLabelText('Référence')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commencer sans justificatif' })).toBeInTheDocument()
    expect(screen.getByLabelText('Choisir un fichier')).toBeInTheDocument()
  })

  it('« Commencer sans justificatif » ouvre le formulaire, vide comme avant ce lot', async () => {
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)

    await skipDeposit()
    expect(screen.getByLabelText('Référence')).toHaveValue('')
    expect(screen.getByText('Aucun justificatif pour l’instant.')).toBeInTheDocument()
  })

  it('un fichier déposé ouvre une ligne VIDE — rien n’est deviné depuis le fichier', async () => {
    // Le nom du fichier porte un montant et une date lisibles par un humain ;
    // l'écran ne doit RIEN en tirer, faute d'OCR branché sur ce domaine.
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, receipt('taxi_18e50_2026-05-15.pdf'))
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec 1 fichier' }))

    expect(screen.getByLabelText('Référence')).toBeInTheDocument()
    expect(screen.getByLabelText('Montant TTC')).toHaveValue('')
    expect(screen.getByLabelText('Date de la dépense')).toHaveValue('')
    expect(screen.getByLabelText('Libellé')).toHaveValue('')
    // Le fichier, lui, apparaît bien — en attente d'envoi.
    expect(screen.getByText(/taxi_18e50_2026-05-15\.pdf/)).toBeInTheDocument()
  })

  it('deux fichiers déposés ouvrent DEUX lignes vides', async () => {
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, [receipt('hotel.pdf'), receipt('train.pdf')])
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec 2 fichiers' }))

    expect(screen.getAllByLabelText('Montant TTC')).toHaveLength(2)
    expect(screen.getByText(/hotel\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/train\.pdf/)).toBeInTheDocument()
  })
})

describe('#1827.1 — les octets ne partent qu’à l’enregistrement, jamais avant', () => {
  it('enregistrer la note envoie RÉELLEMENT le fichier déposé, vers la note créée', async () => {
    const onClose = vi.fn()
    render(<ExpenseReportEditor open report={null} onClose={onClose} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, receipt('facture_taxi.pdf'))
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec 1 fichier' }))

    // Rien n'est parti avant l'enregistrement.
    expect(upload).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-020')
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Inès Kaczmarek')
    await userEvent.type(screen.getByLabelText('Libellé'), 'Taxi aéroport')
    await userEvent.type(screen.getByLabelText('Date de la dépense'), '2026-05-15')
    await userEvent.type(screen.getByLabelText('Montant TTC'), '38')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    // La conversion (lecture du fichier) ET l'envoi passent par des promesses
    // chaînées après le clic — on attend l'état stable avant de lire les mocks.
    await screen.findByText('Envoyé')

    expect(save).toHaveBeenCalledTimes(1)
    // Le fichier part vers la note QUI VIENT D'ÊTRE CRÉÉE (« new1 »), pas vers
    // un identifiant deviné.
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0]?.[0]).toBe('new1')
    const uploadedInput = upload.mock.calls[0]?.[1] as { fileName: string; fileB64: string }
    expect(uploadedInput.fileName).toBe('facture_taxi.pdf')
    // Du base64 NU, sans le préfixe `data:` — la même conversion que
    // `AttachmentDeposit`, réutilisée et non recopiée.
    expect(uploadedInput.fileB64.startsWith('data:')).toBe(false)
    // Tout est passé : le tiroir se ferme.
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('l’envoi échoue : le tiroir reste OUVERT, le motif est nommé, et on peut réessayer', async () => {
    upload.mockRejectedValueOnce(new Error('Rôle insuffisant pour cette action'))
    const onClose = vi.fn()
    render(<ExpenseReportEditor open report={null} onClose={onClose} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, receipt('facture_taxi.pdf'))
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec 1 fichier' }))

    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-021')
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Hakim Barreau')
    await userEvent.type(screen.getByLabelText('Libellé'), 'Taxi')
    await userEvent.type(screen.getByLabelText('Date de la dépense'), '2026-05-15')
    await userEvent.type(screen.getByLabelText('Montant TTC'), '38')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(await screen.findByText('Rôle insuffisant pour cette action')).toBeInTheDocument()

    // La note EST enregistrée — ce n'est pas elle qui a échoué.
    expect(save).toHaveBeenCalledTimes(1)
    // Mais le tiroir ne se ferme PAS : la panne d'une pièce doit rester lisible.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Réessayer l’envoi' })).toBeInTheDocument()
  })

  it('réessayer après un échec ne recrée PAS une seconde note', async () => {
    upload.mockRejectedValueOnce(new Error('network'))
    upload.mockResolvedValueOnce({ id: 'att1' })
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, receipt('facture_taxi.pdf'))
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec 1 fichier' }))
    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-022')
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Hakim Barreau')
    await userEvent.type(screen.getByLabelText('Libellé'), 'Taxi')
    await userEvent.type(screen.getByLabelText('Date de la dépense'), '2026-05-15')
    await userEvent.type(screen.getByLabelText('Montant TTC'), '38')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(await screen.findByRole('button', { name: 'Réessayer l’envoi' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer l’envoi' }))
    expect(await screen.findByText('Envoyé')).toBeInTheDocument()

    // Un seul `save` : la note créée au premier clic est réutilisée, pas
    // recréée. Le second `upload` cible la MÊME note.
    expect(save).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[1]?.[0]).toBe('new1')
  })
})

describe('le formulaire de dépôt', () => {
  it('crée une note : les champs partent au serveur, la ligne comprise', async () => {
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)
    await skipDeposit()

    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-010')
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Inès Kaczmarek')
    await userEvent.type(screen.getByLabelText('Libellé'), 'Repas – Déjeuner')
    await userEvent.type(screen.getByLabelText('Date de la dépense'), '2026-05-15')
    await userEvent.type(screen.getByLabelText('Montant TTC'), '18,50')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))

    expect(save).toHaveBeenCalledTimes(1)
    const [call] = save.mock.calls
    expect(call?.[0]?.id).toBeNull()
    expect(call?.[0]?.input.reference).toBe('F-2026-010')
    // « 18,50 » se lit en centimes, virgule comprise — un séparateur français
    // tapé dans un champ français ne doit pas produire « NaN ».
    expect(call?.[0]?.input.lines[0].amountCents).toBe(1850)
  })

  it('un taux de TVA NON SAISI part à `null`, jamais à 0', async () => {
    // C'est LE défaut qu'un formulaire peut réintroduire : un `?? 0` ici
    // rendrait la note indistinguable d'une note à taux zéro, et la
    // ventilation afficherait un total qui a l'air complet.
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)
    await skipDeposit()

    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-011')
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Hakim Barreau')
    await userEvent.type(screen.getByLabelText('Libellé'), 'Taxi')
    await userEvent.type(screen.getByLabelText('Date de la dépense'), '2026-05-15')
    await userEvent.type(screen.getByLabelText('Montant TTC'), '68')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))

    expect(save.mock.calls[0]?.[0]?.input.lines[0].vatRateBps).toBeNull()
  })

  it('ne montre distance et puissance QUE sur une ligne kilométrique', async () => {
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)
    await skipDeposit()

    // Onze catégories sur douze n'ont pas de kilomètres : les demander partout
    // ferait saisir « 0 » par acquit de conscience, c'est-à-dire une mesure fausse.
    expect(screen.queryByLabelText('Distance')).not.toBeInTheDocument()
    await chooseOption(screen.getByLabelText('Catégorie'), 'mileage')
    expect(screen.getByLabelText('Distance')).toBeInTheDocument()
    expect(screen.getByLabelText('Puissance fiscale')).toBeInTheDocument()
  })

  it('« Soumettre » ENREGISTRE d’abord, puis soumet', async () => {
    // Sans le premier, une modification tapée juste avant le clic partirait à
    // la corbeille pendant que la note, elle, entre dans la file.
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)
    await skipDeposit()

    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-012')
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Inès Kaczmarek')
    await userEvent.click(screen.getByRole('button', { name: 'Soumettre' }))

    expect(save).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith('new1', expect.anything())
  })

  it('refuse de partir tant que la référence ou le porteur manquent', async () => {
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)
    await skipDeposit()

    // Le serveur les exige ; ceci évite l'aller-retour en 400, qui fait
    // recliquer sur un bouton qui semble ne rien faire.
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-013')
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Hakim Barreau')
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled()
  })

  it('rouvre une note existante avec ses lignes, montants compris', () => {
    // ÉDITION : le formulaire est visible DIRECTEMENT — pas de déroute par le
    // dépôt, qui n'existe qu'à la création.
    render(<ExpenseReportEditor open report={report()} onClose={() => undefined} />)

    expect(screen.getByLabelText('Référence')).toHaveValue('F-2026-006')
    expect(screen.getByLabelText('Montant TTC')).toHaveValue('18.50')
    // Un taux jamais lu reste VIDE : le recopier à « 0 » l'affirmerait.
    expect(screen.getByLabelText('Taux de TVA')).toHaveValue('')
  })

  it('verrouille une note DÉCIDÉE, et dit pourquoi', () => {
    render(<ExpenseReportEditor open report={report({ status: 'validated' })} onClose={() => undefined} />)

    expect(screen.getByText(/Cette note est déjà décidée/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Soumettre' })).toBeDisabled()
  })

  it('en ÉDITION, le dépôt du fichier lui-même n’est toujours pas branché — domaine séparé, non touché par #1827.1', async () => {
    // Ce mécanisme est INCHANGÉ par ce lot : nommer une pièce sans l'envoyer.
    render(<ExpenseReportEditor open report={report()} onClose={() => undefined} />)

    expect(screen.getByText(/Le dépôt du fichier lui-même n’est pas encore branché/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nom du justificatif'), 'Facture_hotel.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(screen.getByText('Facture_hotel.pdf')).toBeInTheDocument()
  })

  it('n’envoie PAS une ligne à demi saisie', async () => {
    // Une ligne sans montant lisible n'est pas une ligne à 0 € : elle n'est
    // pas une ligne du tout, et la contrainte SQL la refuserait.
    render(<ExpenseReportEditor open report={null} onClose={() => undefined} />)
    await skipDeposit()

    await userEvent.type(screen.getByLabelText('Référence'), 'F-2026-014')
    await userEvent.type(screen.getByLabelText('Porteur de la note'), 'Inès Kaczmarek')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))

    expect(save.mock.calls[0]?.[0]?.input.lines).toEqual([])
  })
})
