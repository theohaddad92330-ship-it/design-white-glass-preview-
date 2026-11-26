import { describe, expect, it } from 'vitest'
import { PUBLIC_PRODUCT_KB } from './public-kb'

/**
 * Le lexique de positionnement, tenu sur la SEULE base documentaire de Laura.
 *
 * Cinq formulations ont été abandonnées ; la première, « Copilote commercial
 * IA », vivait encore dans la réponse `what_is_bellum` — donc en production,
 * dans la première phrase qu'un inconnu lit sur le produit.
 *
 * Le positionnement retenu est « copilote d'intelligence commerciale » :
 * « Laura » est un NOM, « copilote » est le nom commun de la CATÉGORIE.
 *
 * La garde lit les DONNÉES (`PUBLIC_PRODUCT_KB`), pas le texte du fichier : un
 * commentaire qui cite la formulation interdite pour l'expliquer ne doit pas
 * faire rougir la CI, et un `answer` fautif ne doit pas pouvoir se cacher
 * derrière une reformulation du commentaire d'en-tête.
 */

/** Accents, casse et apostrophes typographiques neutralisés. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase()
}

/**
 * ⚠️ Aucun drapeau `g` : `RegExp.test()` avec `g` est STATEFUL et rend un
 * résultat sur deux quand la même expression sert plusieurs fois.
 */
const ABANDONED_POSITIONING: readonly { label: string; pattern: RegExp }[] = [
  { label: 'Copilote commercial IA', pattern: /copilote\s+commercial\s+ia\b/ },
  { label: 'Revenue Operating System', pattern: /revenue\s+operating\s+system/ },
  { label: "CRM + ATS + ERP avec de l'IA", pattern: /crm\s*\+\s*ats\s*\+\s*erp/ },
  { label: 'Nous remplaçons X', pattern: /\bnous rempla[cç]ons\b/ },
  {
    label: "L'IA fait la prospection à votre place",
    pattern: /\bia\s+(?:fait|gere|s'occupe de)\s+(?:toute\s+)?(?:la|ta|votre)\s+prospection/,
  },
]

/** Les formulations abandonnées présentes dans un texte, avec leur libellé. */
function abandonedWordingIn(text: string): string[] {
  const normalized = normalize(text)
  return ABANDONED_POSITIONING.filter(entry => entry.pattern.test(normalized)).map(entry => entry.label)
}

describe('PUBLIC_PRODUCT_KB — le corpus lu par la garde', () => {
  it('porte bien des réponses, dont celle qui définit le produit', () => {
    // Une garde dont le corpus se vide passe au vert sans rien lire.
    expect(PUBLIC_PRODUCT_KB.length).toBeGreaterThanOrEqual(10)
    expect(PUBLIC_PRODUCT_KB.every(entry => entry.answer.trim().length > 0)).toBe(true)
    expect(PUBLIC_PRODUCT_KB.map(entry => entry.topic)).toContain('what_is_bellum')
  })
})

describe('PUBLIC_PRODUCT_KB — le détecteur sait dire NON', () => {
  it('reconnaît chacune des cinq formulations abandonnées', () => {
    expect(abandonedWordingIn('BellumAI est un copilote commercial IA pensé pour les ESN.')).toEqual([
      'Copilote commercial IA',
    ])
    expect(abandonedWordingIn('Le Revenue Operating System des ESN.')).toEqual(['Revenue Operating System'])
    expect(abandonedWordingIn("CRM + ATS + ERP avec de l'IA.")).toEqual(["CRM + ATS + ERP avec de l'IA"])
    expect(abandonedWordingIn('Nous remplaçons HubSpot.')).toEqual(['Nous remplaçons X'])
    expect(abandonedWordingIn("L'IA fait la prospection à votre place.")).toEqual([
      "L'IA fait la prospection à votre place",
    ])
  })

  it('laisse passer le positionnement retenu et les questions des visiteurs', () => {
    expect(abandonedWordingIn("ton copilote d'intelligence commerciale")).toEqual([])
    expect(abandonedWordingIn('remplace hubspot')).toEqual([])
    expect(abandonedWordingIn('Bellum vise à ajouter la couche intelligence et exécution.')).toEqual([])
  })
})

describe('PUBLIC_PRODUCT_KB — le positionnement', () => {
  it("n'emploie aucune des cinq formulations abandonnées", () => {
    const offenders = PUBLIC_PRODUCT_KB.flatMap(entry =>
      abandonedWordingIn(entry.answer).map(label => `${entry.topic} — « ${label} »`),
    )
    expect(offenders).toEqual([])
  })

  it('nomme la catégorie du produit avec la formulation retenue', () => {
    const definition = PUBLIC_PRODUCT_KB.find(entry => entry.topic === 'what_is_bellum')
    expect(normalize(definition?.answer ?? '')).toContain("copilote d'intelligence commerciale")
  })
})
