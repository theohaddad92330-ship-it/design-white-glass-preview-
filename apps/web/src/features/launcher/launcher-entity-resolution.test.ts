import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauncherRun } from '@bellum/contracts'

const i18nState = vi.hoisted(() => ({ language: 'fr' }))
vi.mock('@/i18n', () => ({ i18n: i18nState }))

const apiFetchMock = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

const { needsEntityExtraction, resolveEntity } = await import('./launcher-entity-resolution')

/** Le seul run du catalogue qui lit `company` — voir `launcher.ts`. */
const ACCOUNT_ANALYSIS: LauncherRun = {
  key: 'account.analysis',
  labelKey: 'run.accountAnalysis',
  hintKey: 'run.accountAnalysisHint',
  action: 'account_analysis',
  billedOnSuccessOnly: false,
  to: '/search',
  queryParam: 'company',
}

/** Un run armé qui n'attend PAS un nom d'entreprise — `contact.enrich` lit `q`. */
const CONTACT_ENRICH: LauncherRun = {
  key: 'contact.enrich',
  labelKey: 'run.contactEnrich',
  action: 'contact_enrichment',
  billedOnSuccessOnly: true,
  to: '/contacts',
  queryParam: 'q',
}

beforeEach(() => {
  apiFetchMock.mockReset()
  i18nState.language = 'fr'
})

describe('needsEntityExtraction', () => {
  it('ne tente rien sans run armé', () => {
    expect(needsEntityExtraction(null, 'analyse-moi BPCE')).toBe(false)
  })

  it('ne tente rien sur un run qui ne lit pas `company`', () => {
    expect(needsEntityExtraction(CONTACT_ENRICH, 'Marie Dupont')).toBe(false)
  })

  it('ne tente rien sur un nom déjà réduit à UN mot — déjà ce que `company=` attend', () => {
    expect(needsEntityExtraction(ACCOUNT_ANALYSIS, 'BPCE')).toBe(false)
  })

  it('ne tente rien sur un champ vide', () => {
    expect(needsEntityExtraction(ACCOUNT_ANALYSIS, '   ')).toBe(false)
  })

  it('tente une extraction sur une PHRASE, sur le run qui lit `company`', () => {
    expect(needsEntityExtraction(ACCOUNT_ANALYSIS, 'analyse-moi BPCE')).toBe(true)
  })
})

describe('resolveEntity', () => {
  it('rend le texte tapé sans appel réseau en démo, même sur une phrase', async () => {
    const resolved = await resolveEntity({ run: ACCOUNT_ANALYSIS, text: 'analyse-moi BPCE', isDemo: true })
    expect(resolved).toBe('analyse-moi BPCE')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it("rend le texte tapé sans appel réseau quand aucune extraction n'est due", async () => {
    const resolved = await resolveEntity({ run: ACCOUNT_ANALYSIS, text: 'BPCE', isDemo: false })
    expect(resolved).toBe('BPCE')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('appelle le proxy IA et rend le nom isolé quand le serveur en propose un', async () => {
    apiFetchMock.mockResolvedValue({ company: 'BPCE' })
    const resolved = await resolveEntity({ run: ACCOUNT_ANALYSIS, text: 'analyse-moi BPCE', isDemo: false })
    expect(resolved).toBe('BPCE')
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/ia/search/extract-entity',
      method: 'POST',
      body: { text: 'analyse-moi BPCE', locale: 'fr' },
    })
  })

  it('envoie la locale EN quand l’application est en anglais', async () => {
    i18nState.language = 'en'
    apiFetchMock.mockResolvedValue({ company: 'BPCE' })
    await resolveEntity({ run: ACCOUNT_ANALYSIS, text: 'analyze BPCE for me', isDemo: false })
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: { text: 'analyze BPCE for me', locale: 'en' } }),
    )
  })

  it('retombe sur le texte tapé quand le serveur ne propose rien (pas de clé, ou nom non ancré)', async () => {
    apiFetchMock.mockResolvedValue({ company: null })
    const resolved = await resolveEntity({ run: ACCOUNT_ANALYSIS, text: 'analyse-moi BPCE', isDemo: false })
    expect(resolved).toBe('analyse-moi BPCE')
  })

  it('retombe sur le texte tapé — jamais une exception — quand le transport échoue', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'))
    const resolved = await resolveEntity({ run: ACCOUNT_ANALYSIS, text: 'analyse-moi BPCE', isDemo: false })
    expect(resolved).toBe('analyse-moi BPCE')
  })
})
