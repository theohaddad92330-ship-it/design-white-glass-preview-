import { prepareEmailDraft } from './prepare-email-draft'

/**
 * #3702 — créer une séquence e-mail doit PRÉPARER le brouillon (objet + corps)
 * avec le moteur de rédaction existant (`POST /ia/message`), l'enregistrer sur
 * le contact (`PATCH /contacts/:id/email-draft`, jamais d'envoi), et DIRE
 * pourquoi quand ça échoue. Un brouillon déjà écrit (analyse, relu à la main)
 * n'est jamais écrasé.
 */
const { apiFetch, getOne, saveEmailDraft } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getOne: vi.fn(),
  saveEmailDraft: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiFetch }))
vi.mock('@/features/contacts/api', () => ({ contactsApi: { getOne, saveEmailDraft } }))

const CONTACT = { id: 'c1', full_name: 'Louis Schlegel', email: 'louis@example.com' }

describe('prepareEmailDraft (#3702)', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    getOne.mockReset()
    saveEmailDraft.mockReset()
  })

  it('génère puis enregistre le brouillon quand le contact n’en a pas (email_message = null)', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Sujet', body: 'Corps' } })
    saveEmailDraft.mockResolvedValue({})
    const outcome = await prepareEmailDraft({ ...CONTACT, email_message: null }, 'Relancer')
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/ia/message',
      method: 'POST',
      body: { contactId: 'c1', channel: 'email', context: 'Relancer' },
    })
    expect(saveEmailDraft).toHaveBeenCalledWith('c1', { subject: 'Sujet', body: 'Corps' })
    expect(outcome).toEqual({ contactId: 'c1', status: 'prepared' })
  })

  it('ne régénère pas un brouillon déjà écrit', async () => {
    const outcome = await prepareEmailDraft({ ...CONTACT, email_message: { subject: 's', body: 'b' } })
    expect(apiFetch).not.toHaveBeenCalled()
    expect(saveEmailDraft).not.toHaveBeenCalled()
    expect(outcome.status).toBe('existing')
  })

  it('email_message inconnu (fiche contact) : lit le contact avant de rédiger, n’écrase rien', async () => {
    getOne.mockResolvedValue({ email_message: { subject: 's', body: 'déjà là' } })
    const outcome = await prepareEmailDraft({ ...CONTACT })
    expect(getOne).toHaveBeenCalledWith('c1')
    expect(apiFetch).not.toHaveBeenCalled()
    expect(outcome.status).toBe('existing')
  })

  it('email_message inconnu et contact sans brouillon : rédige', async () => {
    getOne.mockResolvedValue({ email_message: null })
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'S', body: 'B' } })
    saveEmailDraft.mockResolvedValue({})
    const outcome = await prepareEmailDraft({ ...CONTACT })
    expect(outcome.status).toBe('prepared')
  })

  it('échec de rédaction : la raison se nomme (generation_failed), rien n’est enregistré', async () => {
    apiFetch.mockRejectedValue(new Error('502'))
    const outcome = await prepareEmailDraft({ ...CONTACT, email_message: null })
    expect(saveEmailDraft).not.toHaveBeenCalled()
    expect(outcome).toEqual({ contactId: 'c1', status: 'failed', reason: 'generation_failed' })
  })

  it('réponse sans corps : generation_failed, jamais un texte inventé', async () => {
    apiFetch.mockResolvedValue({ success: true, data: {} })
    const outcome = await prepareEmailDraft({ ...CONTACT, email_message: null })
    expect(outcome).toEqual({ contactId: 'c1', status: 'failed', reason: 'generation_failed' })
  })

  it('échec d’enregistrement : save_failed', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'S', body: 'B' } })
    saveEmailDraft.mockRejectedValue(new Error('500'))
    const outcome = await prepareEmailDraft({ ...CONTACT, email_message: null })
    expect(outcome).toEqual({ contactId: 'c1', status: 'failed', reason: 'save_failed' })
  })

  it('contact sans adresse e-mail : no_email, aucun appel', async () => {
    const outcome = await prepareEmailDraft({ ...CONTACT, email: null, email_message: null })
    expect(apiFetch).not.toHaveBeenCalled()
    expect(outcome).toEqual({ contactId: 'c1', status: 'failed', reason: 'no_email' })
  })
})
