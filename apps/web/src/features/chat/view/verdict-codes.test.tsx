import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { renderInlineMarkdown } from './markdown'
import { translateVerdictCodes } from './verdict-codes'

describe('translateVerdictCodes (#3395)', () => {
  it('traduit le code brut, nu ou entre accents graves', async () => {
    await i18n.changeLanguage('fr')
    expect(translateVerdictCodes('Verdict : NO_GO_NOW sur ce compte')).toBe('Verdict : Pas maintenant sur ce compte')
    expect(translateVerdictCodes('`GO_AFTER_PROOF`')).toBe('D’abord une preuve')
  })

  it('suit la langue de l’interface', async () => {
    await i18n.changeLanguage('en')
    expect(translateVerdictCodes('NOT_EVALUABLE')).toBe('Not evaluable')
    await i18n.changeLanguage('fr')
  })

  it('traduit aussi la forme écrite par le modèle : espaces ou tirets, majuscules (#3513)', async () => {
    await i18n.changeLanguage('fr')
    expect(translateVerdictCodes('Verdict : NO GO NOW')).toBe('Verdict : Pas maintenant')
    expect(translateVerdictCodes('**NO-GO-NOW** sur LVMH')).toBe('**Pas maintenant** sur LVMH')
    expect(translateVerdictCodes('GO VIA PARTNER')).toBe('Plutôt via un partenaire')
    await i18n.changeLanguage('en')
    expect(translateVerdictCodes('NO GO NOW')).toBe('Not now')
    await i18n.changeLanguage('fr')
  })

  it('chaque code, sous chaque écriture, passe par le libellé humain FR et EN', async () => {
    const CODES = ['GO_NOW', 'GO_VIA_PARTNER', 'GO_AFTER_PROOF', 'WATCH', 'NO_GO_NOW', 'NOT_EVALUABLE']
    for (const lng of ['fr', 'en']) {
      await i18n.changeLanguage(lng)
      for (const code of CODES) {
        for (const written of [code, code.replace(/_/g, ' '), code.replace(/_/g, '-')]) {
          const out = translateVerdictCodes(`Verdict ${written}.`)
          expect(out).toBe(`Verdict ${i18n.t(`chat:accountVerdict.${code}`)}.`)
        }
      }
    }
    await i18n.changeLanguage('fr')
  })

  it('ne touche ni les mots voisins ni un texte sans code', () => {
    expect(translateVerdictCodes('NO_GO_NOWHERE et WATCHDOG')).toBe('NO_GO_NOWHERE et WATCHDOG')
    expect(translateVerdictCodes('Rien à traduire')).toBe('Rien à traduire')
  })
})

describe('aucun code de verdict brut à l’écran (#3513)', () => {
  const CODES = ['GO_NOW', 'GO_VIA_PARTNER', 'GO_AFTER_PROOF', 'WATCH', 'NO_GO_NOW', 'NOT_EVALUABLE']

  it.each(['fr', 'en'])('chaque verdict a un libellé humain en %s, sans underscore', async lng => {
    await i18n.changeLanguage(lng)
    for (const code of CODES) {
      const label = i18n.t(`chat:accountVerdict.${code}`)
      expect(label).not.toBe(code)
      expect(label).not.toMatch(/_|^chat:/)
    }
    await i18n.changeLanguage('fr')
  })

  it('le moteur inline des cartes (champ verdict) traduit aussi', async () => {
    await i18n.changeLanguage('fr')
    for (const code of CODES) {
      const { container } = render(<>{renderInlineMarkdown(`Verdict — ${code} : ne pas investir`)}</>)
      expect(container.textContent).not.toContain(code)
    }
  })
})
