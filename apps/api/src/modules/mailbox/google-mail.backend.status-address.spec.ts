/**
 * #3702 (recette prod 10/10) — « Déléguer l'envoi » affichait « Expéditeur : — » alors que Google
 * Workspace était connecté : le statut de la boîte ne rendait que `account_label` de la connexion,
 * vide pour une connexion posée avant que l'étiquette soit stockée. Sans étiquette, l'adresse est
 * lue au profil Gmail (la boîte connectée elle-même) ; `null` seulement si vraiment aucune.
 */
import { GoogleMailBackend } from './google-mail.backend'

function build(opts: { accountLabel: string | null; profile?: { emailAddress: string | null } | Error }) {
  const getProfile = jest.fn(async () => {
    if (opts.profile instanceof Error) throw opts.profile
    return opts.profile ?? { emailAddress: null }
  })
  const google = {
    isConfigured: () => true,
    getStatus: jest.fn().mockResolvedValue({
      connected: true,
      accountLabel: opts.accountLabel,
      capabilities: { gmail: true, gmailRead: true, gmailDraft: true, gmailLabels: true, gmailSettings: true },
    }),
    authorize: jest.fn().mockResolvedValue({ client: { getProfile }, accessToken: 'tok' }),
  }
  return { backend: new GoogleMailBackend(google as never), google, getProfile }
}

describe('GoogleMailBackend.status — l’adresse de la boîte connectée (#3702)', () => {
  it('étiquette vide : l’adresse vient du profil Gmail', async () => {
    const { backend } = build({ accountLabel: null, profile: { emailAddress: 'moi@esn.fr' } })
    expect((await backend.status('u1'))?.address).toBe('moi@esn.fr')
  })

  it('étiquette présente : aucun appel au profil', async () => {
    const { backend, getProfile } = build({ accountLabel: 'louis@esn.fr' })
    expect((await backend.status('u1'))?.address).toBe('louis@esn.fr')
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('sait dire NON : profil illisible → null, jamais une adresse devinée', async () => {
    const { backend } = build({ accountLabel: null, profile: new Error('403') })
    const status = await backend.status('u1')
    expect(status?.connected).toBe(true)
    expect(status?.address).toBeNull()
  })
})
