import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANALYSIS_STATUS_FILTER_VALUES, STATUS_CONFIG, getStatusConfig, statusLabelKey } from './types'

const locale = (lang: 'fr' | 'en', file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, `../../../../i18n/locales/${lang}/${file}.json`), 'utf8')) as Record<
    string,
    unknown
  >

// #4526.1 — l'origine CRM est une facette distincte du statut d'analyse.
describe('#4526.1 — « Statut de l’analyse » ne dit plus d’où vient le compte', () => {
  it('la facette de statut ne propose pas `imported` (c’est une origine, pas un état d’analyse)', () => {
    expect(ANALYSIS_STATUS_FILTER_VALUES).not.toContain('imported')
    expect(ANALYSIS_STATUS_FILTER_VALUES).toContain('completed')
  })

  it('la valeur `imported` reste lisible (pastille de ligne, anciens liens) : aucun accès perdu', () => {
    expect(STATUS_CONFIG['imported']).toBeDefined()
  })

  it.each(['fr', 'en'] as const)('le libellé du statut `imported` (%s) ne prétend jamais « CRM »', lang => {
    const accounts = locale(lang, 'accounts') as { status: { imported: string } }
    const search = locale(lang, 'search') as { [k: string]: unknown }
    expect(accounts.status.imported).not.toMatch(/crm/i)
    expect(JSON.stringify(search)).not.toMatch(/(venue? de ton|from your) CRM/i)
  })

  it('« Mon CRM » est écrit UNE seule fois par langue pour les deux écrans (GA-26)', () => {
    for (const lang of ['fr', 'en'] as const) {
      const accounts = locale(lang, 'accounts') as { crmChip: { label: string } }
      const contacts = locale(lang, 'contacts') as { quickChips: { monCrm: string } }
      expect(accounts.crmChip.label).toBe(contacts.quickChips.monCrm)
    }
  })
})

// #4941.1 — la puce `canceled` (lien « Voir les échecs ») porte SON libellé, elle ne se range plus sous « Erreur ».
describe('#4941.1 — la puce « canceled » est traduite', () => {
  it('canceled a sa configuration et sa clé de libellé propres', () => {
    expect(STATUS_CONFIG['canceled']).toBeDefined()
    expect(getStatusConfig('canceled')).not.toBe(getStatusConfig('error'))
    expect(statusLabelKey('canceled')).toBe('status.canceled')
  })

  it.each(['fr', 'en'] as const)('le libellé (%s) existe et diffère de « Erreur »', lang => {
    const { status } = locale(lang, 'accounts') as { status: Record<string, string> }
    expect(status['canceled']).toBeTruthy()
    expect(status['canceled']).not.toBe(status['error'])
  })

  it('l’axe de statut propose Annulée', () => {
    expect(ANALYSIS_STATUS_FILTER_VALUES).toContain('canceled')
  })
})
