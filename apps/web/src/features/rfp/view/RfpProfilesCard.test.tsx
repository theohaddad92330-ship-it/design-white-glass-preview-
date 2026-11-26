import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'
import { i18n } from '@/i18n'

/**
 * #2152.25 — « RATTACHER LES PROFILS » À UN APPEL D'OFFRES.
 *
 * Un AO devenu besoin (`rfp.need_id`) n'avait AUCUN geste pour y rattacher des
 * profils : la carte du studio disait « lié à un besoin », et c'est tout. Le
 * rattachement réutilise le positionnement existant (`POST /submissions`, en
 * `shortlisted`, jamais « envoyé ») sur le besoin et son affaire — pas une
 * seconde table de profils d'AO.
 *
 * ⚠️ Sait dire NON : un clic qui crée sans `needId` (ou sur la mauvaise
 * affaire) échoue l'assertion `toHaveBeenCalledWith`.
 */
const NEED_ID = '00000000-0000-4000-8000-0000000000aa'
const PROJECT_ID = '00000000-0000-4000-8000-0000000000bb'
const CONSULTANT_ID = '00000000-0000-4000-8000-0000000000cc'

let need: { id: string; project_id: string | null } | undefined
let submissions: { id: string; needId: string | null; consultantName: string | null }[] = []
const create = vi.fn()

vi.mock('@/features/projects/open-needs/hooks/useOpenNeed', () => ({
  useOpenNeed: () => ({ need, isPending: false, isError: false }),
}))
vi.mock('@/features/submissions/api', () => ({
  useSubmissions: () => ({ data: { items: submissions }, isLoading: false }),
  useCreateSubmission: () => ({ mutate: create, isPending: false }),
}))
vi.mock('@/features/consultants/use-consultants', () => ({
  useConsultants: () => ({ data: [{ id: CONSULTANT_ID, full_name: 'Ada Lovelace' }] }),
}))

const { RfpProfilesCard } = await import('./RfpProfilesCard')

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  need = { id: NEED_ID, project_id: PROJECT_ID }
  submissions = []
  create.mockReset()
})

describe('RfpProfilesCard — rattacher des profils à l’AO', () => {
  it('rattache un profil du vivier au besoin de l’AO, en présélection', async () => {
    render(<RfpProfilesCard needId={NEED_ID} />)
    await chooseOption(screen.getByLabelText('Profil à rattacher'), CONSULTANT_ID)
    await userEvent.click(screen.getByRole('button', { name: 'Rattacher ce profil' }))
    expect(create).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        needId: NEED_ID,
        consultantId: CONSULTANT_ID,
        stage: 'shortlisted',
        proposedRateCents: null,
      },
      expect.anything(),
    )
  })

  it('liste les profils déjà rattachés à CE besoin, et seulement eux', () => {
    submissions = [
      { id: 's1', needId: NEED_ID, consultantName: 'Grace Hopper' },
      { id: 's2', needId: 'autre-besoin', consultantName: 'Alan Turing' },
    ]
    render(<RfpProfilesCard needId={NEED_ID} />)
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument()
  })

  it('un besoin sans affaire ne propose pas de rattacher : il le dit', () => {
    need = { id: NEED_ID, project_id: null }
    render(<RfpProfilesCard needId={NEED_ID} />)
    expect(screen.queryByRole('button', { name: 'Rattacher ce profil' })).not.toBeInTheDocument()
    expect(screen.getByText(/aucune affaire/)).toBeInTheDocument()
  })
})
