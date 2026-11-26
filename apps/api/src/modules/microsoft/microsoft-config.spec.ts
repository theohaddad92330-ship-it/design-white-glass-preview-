import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readMicrosoftConfig } from './microsoft-config'

const CONFIGURED_ENV = {
  MICROSOFT_CLIENT_ID: 'cid',
  MICROSOFT_CLIENT_SECRET: 'csecret',
  MICROSOFT_REDIRECT_URI: 'https://api.example.com/microsoft/callback',
}

describe('readMicrosoftConfig', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('is null (no-op) unless the three required vars are set', () => {
    delete process.env['MICROSOFT_CLIENT_ID']
    delete process.env['MICROSOFT_CLIENT_SECRET']
    delete process.env['MICROSOFT_REDIRECT_URI']
    expect(readMicrosoftConfig()).toBeNull()

    Object.assign(process.env, CONFIGURED_ENV)
    const cfg = readMicrosoftConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.tenant).toBe('common') // default
    expect(cfg?.scopes).toContain('offline_access') // refresh-token scope kept
    expect(cfg?.scopes).toContain('Mail.Send')
    expect(cfg?.scopes).toContain('Calendars.ReadWrite')
  })

  it('honours MICROSOFT_TENANT and MICROSOFT_SCOPES overrides', () => {
    Object.assign(process.env, CONFIGURED_ENV, {
      MICROSOFT_TENANT: 'contoso.onmicrosoft.com',
      MICROSOFT_SCOPES: 'offline_access Mail.Send',
    })
    const cfg = readMicrosoftConfig()
    expect(cfg?.tenant).toBe('contoso.onmicrosoft.com')
    expect(cfg?.scopes).toBe('offline_access Mail.Send')
  })

  // #4016 L12 — OneDrive / SharePoint : `Files.Read.All` reste hors du défaut (consentement
  // d'administrateur), et l'opérateur l'allume en POSANT la valeur COMPLÈTE de MICROSOFT_SCOPES.
  // Piège : la variable REMPLACE le défaut, elle ne s'y ajoute pas. La valeur documentée dans
  // `env-reference.md` est donc testée : elle doit contenir TOUT le défaut + la portée.
  it('la valeur Railway documentée pour OneDrive = le défaut + Files.Read.All, rien de moins', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    delete process.env['MICROSOFT_SCOPES']
    const defaults = (readMicrosoftConfig()?.scopes ?? '').split(' ')
    expect(defaults).not.toContain('Files.Read.All')

    const reference = readFileSync(join(__dirname, '../../../../../agent_docs/env-reference.md'), 'utf8')
    const documented = /MICROSOFT_SCOPES="([^"]+)"/.exec(reference)?.[1]?.split(' ') ?? []
    expect(documented).toContain('Files.Read.All')
    expect(documented).toEqual(expect.arrayContaining(defaults))

    process.env['MICROSOFT_SCOPES'] = documented.join(' ')
    expect(readMicrosoftConfig()?.scopes.split(' ')).toContain('Files.Read.All')
  })
})
