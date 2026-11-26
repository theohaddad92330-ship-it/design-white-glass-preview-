import type { ReactNode } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

// Même patron que `ScopeDialog.test.tsx` : Radix `Dialog` porte son contenu
// dans un portail dont l'ouverture est asynchrone (`Presence`) — hors de
// propos ici, on garde tout le reste de `@bellum/ui` (Select y compris) réel.
vi.mock('@bellum/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@bellum/ui')
  return {
    ...actual,
    Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  }
})

const { EMPTY_PARTNER_GOVERNANCE_FIELDS, PartnerGovernanceEditDialog } = await import('./PartnerGovernanceEditDialog')
type PartnerGovernanceFields = Parameters<typeof PartnerGovernanceEditDialog>[0]['fields']
type UpdatePartnerGovernance = Parameters<typeof PartnerGovernanceEditDialog>[0]['onSave'] extends (
  patch: infer P,
) => void
  ? P
  : never

/** Rend le dialogue ET attend la traduction du premier champ — le namespace
 *  `partnerPipeline` se charge de façon asynchrone (comme partout ailleurs
 *  dans la suite, cf. `PartnerPipeline.test.tsx#look`). Sans cette attente,
 *  une requête synchrone lirait encore la CLÉ brute. */
async function renderDialog(fields: PartnerGovernanceFields, onSave: (patch: UpdatePartnerGovernance) => void) {
  renderWithRouter(
    <PartnerGovernanceEditDialog
      open
      onOpenChange={() => {}}
      partnerName="Astréa Conseil"
      fields={fields}
      busy={false}
      onSave={onSave}
    />,
  )
  await screen.findByLabelText('Porte d’entrée détenue')
}

describe('PartnerGovernanceEditDialog — #3270 (reste), le formulaire générique du cadre', () => {
  it('pose un champ texte à sa clé, non trim vide efface (`null`)', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    await renderDialog(EMPTY_PARTNER_GOVERNANCE_FIELDS, onSave)

    await user.type(screen.getByLabelText('Porte d’entrée détenue'), 'Le DSI, via notre mission en cours')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const patch = onSave.mock.calls[0]![0]
    expect(patch.entryDoorScope).toBe('Le DSI, via notre mission en cours')
    // Tout champ non touché reste explicitement `null` — jamais deviné.
    expect(patch.paymentTerms).toBeNull()
    expect(patch.marginFloorPercent).toBeNull()
  })

  it('convertit une liste séparée par des virgules, filtre les entrées vides', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    await renderDialog(EMPTY_PARTNER_GOVERNANCE_FIELDS, onSave)

    await user.type(screen.getByLabelText('Comptes accessibles'), 'Client A, Client B,  , Client C')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const patch = onSave.mock.calls[0]![0]
    expect(patch.accountsAccessible).toEqual(['Client A', 'Client B', 'Client C'])
  })

  it('pose un nombre, jamais une chaîne — vide reste `null`', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    await renderDialog(EMPTY_PARTNER_GOVERNANCE_FIELDS, onSave)

    await user.type(screen.getByLabelText('Marge plancher'), '15')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const patch = onSave.mock.calls[0]![0]
    expect(patch.marginFloorPercent).toBe(15)
    expect(patch.marginSharePercent).toBeNull()
  })

  it('pré-remplit depuis le cadre déjà déclaré — jamais reparti de zéro', async () => {
    await renderDialog(
      {
        ...EMPTY_PARTNER_GOVERNANCE_FIELDS,
        entryDoorScope: 'Le sponsor achats',
        marginFloorPercent: 12,
        accountsAccessible: ['Client A', 'Client B'],
      },
      vi.fn(),
    )

    expect(screen.getByLabelText('Porte d’entrée détenue')).toHaveValue('Le sponsor achats')
    expect(screen.getByLabelText('Marge plancher')).toHaveValue(12)
    expect(screen.getByLabelText('Comptes accessibles')).toHaveValue('Client A, Client B')
  })

  it('choisit la propriété du compte parmi les trois valeurs de l’objet (jamais une quatrième)', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    await renderDialog(EMPTY_PARTNER_GOVERNANCE_FIELDS, onSave)

    await chooseOption(screen.getByLabelText('Propriété du compte'), 'Le partenaire')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const patch = onSave.mock.calls[0]![0]
    expect(patch.accountOwnership).toBe('partner')
  })

  it('le titre nomme le partenaire — jamais un dialogue anonyme', async () => {
    await renderDialog(EMPTY_PARTNER_GOVERNANCE_FIELDS, vi.fn())
    expect(screen.getByText('Cadre partenaire — Astréa Conseil')).toBeInTheDocument()
  })
})
