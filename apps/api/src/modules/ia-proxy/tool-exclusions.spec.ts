import type { ToolFamily } from '@bellum/contracts'
import { connectedFamiliesOf, resolveToolExclusions } from './tool-exclusions'

const tool = (
  provider: string,
  family: ToolFamily,
  capability_state = 'operational',
  additional_families?: ToolFamily[],
) => ({
  provider,
  family,
  capability_state,
  ...(additional_families ? { additional_families } : {}),
})

const tools = [
  tool('hubspot', 'crm'),
  tool('salesforce', 'crm'),
  tool('gmail', 'email'),
  tool('slack', 'communication', 'unavailable'),
]

describe('resolveToolExclusions — #3708.fournisseur', () => {
  it("sans exclusion, rien n'est exclu (corps byte-identique)", () => {
    expect(resolveToolExclusions(tools, [], [])).toEqual({ families: [], providers: [] })
    expect(resolveToolExclusions(tools, undefined, undefined)).toEqual({ families: [], providers: [] })
  })

  it("exclure UN outil d'une famille de deux n'exclut pas la famille, mais exclut l'outil", () => {
    expect(resolveToolExclusions(tools, ['hubspot'], [])).toEqual({ families: [], providers: ['hubspot'] })
  })

  it("exclure le DERNIER outil d'une famille exclut la famille", () => {
    expect(resolveToolExclusions(tools, ['hubspot', 'salesforce'], [])).toEqual({
      families: ['crm'],
      providers: ['hubspot', 'salesforce'],
    })
    expect(resolveToolExclusions(tools, ['gmail'], [])).toEqual({ families: ['email'], providers: ['gmail'] })
  })

  it("un identifiant qui n'est pas un outil de l'utilisateur est écarté, jamais cru sur parole", () => {
    expect(resolveToolExclusions(tools, ['inconnu', 'hubspot'], [])).toEqual({ families: [], providers: ['hubspot'] })
  })

  it('une famille déjà exclue par le client est conservée (union, sans doublon)', () => {
    expect(resolveToolExclusions(tools, ['gmail'], ['email', 'crm'])).toEqual({
      families: ['crm', 'email'],
      providers: ['gmail'],
    })
  })

  it("un outil non opérationnel ne retient pas sa famille : exclure l'opérationnel suffit", () => {
    const mixed = [tool('hubspot', 'crm'), tool('pipedrive', 'crm', 'unavailable')]
    expect(resolveToolExclusions(mixed, ['hubspot'], [])).toEqual({ families: ['crm'], providers: ['hubspot'] })
  })

  it('#4289.10 — Outlook en lecture seule retient la famille messagerie : décocher Gmail ne la coupe pas', () => {
    const mail = [tool('gmail', 'email'), tool('microsoft', 'email', 'read_only')]
    expect(resolveToolExclusions(mail, ['gmail'], [])).toEqual({ families: [], providers: ['gmail'] })
  })

  it('#4289.10 — une messagerie lisible mais « en retard » ou à écritures limitées se décoche aussi', () => {
    const mail = [tool('gmail', 'email', 'sync_late'), tool('microsoft', 'email', 'limited_write')]
    expect(resolveToolExclusions(mail, ['gmail'], [])).toEqual({ families: [], providers: ['gmail'] })
  })

  it('#4289.10 — une autorisation expirée ou un outil dégradé ne retient pas sa famille', () => {
    const mail = [tool('gmail', 'email'), tool('microsoft', 'email', 'authorization_expired')]
    expect(resolveToolExclusions(mail, ['gmail'], [])).toEqual({ families: ['email'], providers: ['gmail'] })
  })

  it('un registre illisible (undefined) ne coupe rien de plus que ce que le client a déclaré', () => {
    expect(resolveToolExclusions(undefined, ['hubspot'], ['email'])).toEqual({ families: ['email'], providers: [] })
  })
})

describe('#3973 — un outil qui sert plusieurs familles (Microsoft 365 : messagerie ET agenda)', () => {
  const microsoft = tool('microsoft', 'email', 'operational', ['calendar'])
  const both = [tool('google-calendar', 'calendar'), tool('gmail', 'email'), microsoft]

  it("décocher l'agenda Google n'exclut PAS la famille agenda : Microsoft la porte encore", () => {
    expect(resolveToolExclusions(both, ['google-calendar'], [])).toEqual({
      families: [],
      providers: ['google-calendar'],
    })
  })

  it('décocher Microsoft exclut sa messagerie ET son agenda quand il en était le dernier outil', () => {
    expect(resolveToolExclusions([microsoft], ['microsoft'], [])).toEqual({
      families: ['calendar', 'email'],
      providers: ['microsoft'],
    })
    // Avec Google branché, chaque famille reste portée : seul l'outil est exclu.
    expect(resolveToolExclusions(both, ['microsoft'], [])).toEqual({ families: [], providers: ['microsoft'] })
  })

  it('décocher Google ET Microsoft exclut la famille agenda', () => {
    expect(resolveToolExclusions(both, ['google-calendar', 'microsoft'], [])).toEqual({
      families: ['calendar'],
      providers: ['google-calendar', 'microsoft'],
    })
  })

  it("un espace qui n'a que Microsoft a l'agenda dans ses familles connectées", () => {
    expect(connectedFamiliesOf([microsoft])?.sort()).toEqual(['calendar', 'email'])
    expect(connectedFamiliesOf([tool('microsoft', 'email', 'unavailable', ['calendar'])])).toEqual([])
    expect(connectedFamiliesOf(undefined)).toBeUndefined()
  })

  it("#2770 — l'accès du copilote n'est pas une connexion : sans messagerie ni agenda branchés, aucune famille", () => {
    const bridge = tool('copilot-bridge', 'email')
    expect(connectedFamiliesOf([bridge])).toEqual([])
    expect(connectedFamiliesOf([bridge, tool('gmail', 'email')])).toEqual(['email'])
  })

  // V4-CORRECTIFS-B (a) — la carte du plan ne cite que ce que « Outils et sources » montre branché :
  // un fournisseur de Bellum (clé serveur posée) n'est pas un outil de l'espace, quelle que soit sa famille.
  it('V4-CORRECTIFS-B (a) — un fournisseur de la plateforme « opérationnel » ne compte dans aucune famille', () => {
    const platform = tool('platform-provider', 'calendar')
    expect(connectedFamiliesOf([platform])).toEqual([])
    expect(connectedFamiliesOf([platform, tool('hubspot', 'crm')])).toEqual(['crm'])
  })
})
