import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * LA TROISIÈME PORTE, ouverte EN PLACE (PDF-02 §3.1).
 *
 *     « un commercial qui a un contact en tête doit pouvoir l'enregistrer
 *      depuis le besoin, **sans passer par le vivier** »
 *
 * Ce fichier vérifie les trois choses que la source demande et que l'ancienne
 * porte ne faisait pas :
 *
 *  1. le formulaire s'ouvre SANS que rien ne navigue ;
 *  2. l'enregistrement passe par le MÊME chemin d'écriture que le vivier
 *     (`useCreateConsultant`), et pas par une seconde façon de créer une fiche ;
 *  3. le geste qui suit est le rapprochement SUR CE BESOIN — celui-là même que
 *     le bouton « Lancer le matching » lance, et pas une seconde dérivation.
 */

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

const mutateAsync = vi.fn()
vi.mock('@/features/consultants/hooks', () => ({
  useCreateConsultant: () => ({ mutateAsync, isPending: false }),
  useTalentSearch: () => ({ data: { items: [{ financeVisible: true }], total: 1 }, isSuccess: true }),
}))

// Le formulaire réel monte une recherche de doublon et un référentiel de
// compétences : ce n'est pas ce qu'on teste ici, et sans routeur ni client de
// requêtes il tomberait. Le double garde la SIGNATURE — c'est elle qui prouve
// que la porte appelle bien le formulaire du vivier, avec ses droits.
vi.mock('@/features/consultants/view/ConsultantFormDialog', () => ({
  ConsultantFormDialog: ({
    open,
    financeVisible,
    onSubmit,
    onClose,
  }: {
    open: boolean
    financeVisible?: boolean
    onSubmit: (form: unknown, rights: { finance?: boolean }) => void
    onClose: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label="Formulaire consultant" data-finance={String(financeVisible)}>
        <button type="button" onClick={() => onSubmit({ full_name: 'Nadia Belkacem' }, { finance: financeVisible })}>
          Enregistrer
        </button>
        <button type="button" onClick={onClose}>
          Annuler
        </button>
      </div>
    ) : null,
}))

vi.mock('@/features/consultants/lib/consultantForm', () => ({
  toUpsert: (form: { full_name: string }) => ({ full_name: form.full_name }),
}))

const { NeedConsultantDoor } = await import('./NeedConsultantDoor')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return { id: 'n-1', title: 'Ingénieur réseau', shortlist_count: 0, ...over } as unknown as OpenNeedRow
}

beforeEach(() => {
  navigate.mockClear()
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue({ id: 'c-9', full_name: 'Nadia Belkacem' })
})

describe('la porte 3 ouvre le formulaire SUR PLACE', () => {
  it('n’affiche rien tant qu’aucun besoin ne l’a ouverte', () => {
    render(<NeedConsultantDoor need={null} onClose={() => {}} onMatch={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ouvre le formulaire quand un besoin l’ouvre — et ne navigue nulle part', () => {
    render(<NeedConsultantDoor need={need()} onClose={() => {}} onMatch={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Formulaire consultant' })).toBeInTheDocument()
    // ⚠️ LA ligne qui porte la source : « sans passer par le vivier ».
    expect(navigate).not.toHaveBeenCalled()
  })

  it('descend le droit financier lu sur le vivier — masquer puis envoyer `null` EFFACERAIT', () => {
    render(<NeedConsultantDoor need={need()} onClose={() => {}} onMatch={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('data-finance', 'true')
  })

  it('écrit par le MÊME chemin que le vivier', async () => {
    render(<NeedConsultantDoor need={need()} onClose={() => {}} onMatch={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    // Une seconde façon de créer un consultant divergerait de la première au
    // premier champ ajouté — et personne ne le verrait avant la production.
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ full_name: 'Nadia Belkacem' }))
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('le geste qui SUIT l’enregistrement', () => {
  it('propose le rapprochement SUR CE BESOIN, en le nommant', async () => {
    render(<NeedConsultantDoor need={need()} onClose={() => {}} onMatch={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const panel = await screen.findByTestId('need-door-next-gesture')
    // Le panneau nomme la PERSONNE et le BESOIN : « et maintenant ? » sans
    // sujet se ferme sans être lu.
    expect(panel).toHaveTextContent('Nadia Belkacem')
    expect(panel).toHaveTextContent('Ingénieur réseau')
  })

  it('ne dit plus rien du coût avant le clic (#4463) — ni « aucun crédit », ni un nombre', async () => {
    render(<NeedConsultantDoor need={need()} onClose={() => {}} onMatch={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const gesture = await screen.findByTestId('need-door-next-gesture')
    expect(gesture).toHaveTextContent(/Lancer le rapprochement|Run matching/)
    expect(gesture).not.toHaveTextContent(/crédit|credit/i)
  })

  it('appelle le `onMatch` de l’écran — pas une seconde façon de lancer le moteur', async () => {
    const onMatch = vi.fn()
    render(<NeedConsultantDoor need={need()} onClose={() => {}} onMatch={onMatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await userEvent.click(await screen.findByRole('button', { name: /Lancer le rapprochement|Run matching/ }))
    expect(onMatch).toHaveBeenCalledWith('n-1')
  })

  it('ne POSITIONNE personne tout seul — il n’y a aucun chemin d’écriture vers un positionnement', async () => {
    // Un positionnement est une proposition ENVOYÉE à un client. Enregistrer
    // une fiche n'est pas décider de la pousser : « on PROPOSE, on ne fait
    // jamais à la place ». Ce n'est pas une convention — c'est qu'il n'y a
    // qu'UN appel sortant, la création.
    render(<NeedConsultantDoor need={need()} onClose={() => {}} onMatch={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    await userEvent.click(await screen.findByRole('button', { name: /Plus tard|Later/ }))
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('need-door-next-gesture')).not.toBeInTheDocument()
  })
})
