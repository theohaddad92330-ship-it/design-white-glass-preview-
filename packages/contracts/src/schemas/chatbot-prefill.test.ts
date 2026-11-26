import { describe, expect, it } from 'vitest'
import {
  CHATBOT_PREFILL_FIELDS,
  CHATBOT_PREFILL_PARAM,
  buildChatbotPrefill,
  decodeChatbotPrefill,
  encodeChatbotPrefill,
} from './chatbot-prefill.js'

describe("ce qui voyage de la conversation vers l'espace", () => {
  it("n'emporte QUE les champs de la liste blanche", () => {
    const prefill = buildChatbotPrefill({
      companyType: 'esn',
      persona: 'sales_director',
      teamSize: '6-15',
      inventedField: 'oui',
    })
    expect(Object.keys(prefill.fields).sort()).toEqual(['companyType', 'persona', 'teamSize'])
  })

  it("n'emporte JAMAIS une donnée personnelle, et le DIT", () => {
    const prefill = buildChatbotPrefill({
      companyType: 'esn',
      firstName: 'Camille',
      email: 'camille@exemple.fr',
      phone: '+33600000000',
    })
    const serialized = JSON.stringify(prefill)
    expect(serialized).not.toContain('Camille')
    expect(serialized).not.toContain('camille@exemple.fr')
    expect(serialized).not.toContain('33600000000')
    expect(prefill.withheld).toContain('firstName')
    expect(prefill.withheld).toContain('email')
    expect(prefill.withheld).toContain('phone')
  })

  it("n'emporte JAMAIS de texte libre — le besoin dans les mots du visiteur reste chez lui", () => {
    const prefill = buildChatbotPrefill({
      companyType: 'esn',
      pain: "on n'arrive pas à placer nos consultants chez Décathlon",
      painFit: 'covered',
    })
    expect(prefill.fields.painFit).toBe('covered')
    expect(JSON.stringify(prefill)).not.toContain('Décathlon')
    expect(prefill.withheld).toContain('pain')
  })

  it('refuse une valeur qui ne ressemble pas à un code — une enum ne contient pas de phrase', () => {
    const prefill = buildChatbotPrefill({
      companyType: 'ESN Groupe Martin & Fils',
      persona: 'founder',
    })
    expect(prefill.fields.companyType).toBeUndefined()
    expect(prefill.fields.persona).toBe('founder')
  })

  it('ne retient pas un champ vide comme « connu »', () => {
    const prefill = buildChatbotPrefill({ companyType: '', persona: 'ops' })
    expect(prefill.fields.companyType).toBeUndefined()
    expect(prefill.withheld).not.toContain('companyType')
  })
})

describe("l'aller-retour par l'URL", () => {
  it('encode puis relit à lidentique', () => {
    const prefill = buildChatbotPrefill({ companyType: 'esn', persona: 'founder', horizon: 'quarter' })
    const encoded = encodeChatbotPrefill(prefill)
    expect(decodeChatbotPrefill(encoded)).toEqual({ companyType: 'esn', persona: 'founder', horizon: 'quarter' })
  })

  it("rend une chaîne vide quand il n'y a rien à transmettre — pas un paramètre vide", () => {
    expect(encodeChatbotPrefill(buildChatbotPrefill({}))).toBe('')
  })

  it('se relit sous un seul paramètre nommé, pour que le visiteur voie ce qui part', () => {
    const encoded = encodeChatbotPrefill(buildChatbotPrefill({ companyType: 'esn' }))
    expect(encoded.startsWith(`${CHATBOT_PREFILL_PARAM}=`)).toBe(true)
  })

  it("JETTE ce qu'il ne reconnaît pas à la relecture — le lecteur ne fait pas confiance à lURL", () => {
    expect(decodeChatbotPrefill('bellum_ctx=companyType%3Aesn~admin%3Atrue~pain%3Acoucou')).toEqual({
      companyType: 'esn',
    })
  })

  it('survit à une URL vide, absurde ou tronquée sans jamais lever', () => {
    expect(decodeChatbotPrefill('')).toEqual({})
    expect(decodeChatbotPrefill('n’importe quoi')).toEqual({})
    expect(decodeChatbotPrefill('bellum_ctx=')).toEqual({})
    expect(decodeChatbotPrefill('bellum_ctx=companyType')).toEqual({})
  })

  it('borne ce qu’il relit : une URL fabriquée ne remplit pas cinquante champs', () => {
    const forged = new Array(200).fill('companyType:esn').join('~')
    expect(Object.keys(decodeChatbotPrefill(`bellum_ctx=${encodeURIComponent(forged)}`)).length).toBeLessThanOrEqual(
      CHATBOT_PREFILL_FIELDS.length,
    )
  })
})
