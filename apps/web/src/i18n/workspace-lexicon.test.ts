import { afterEach, describe, expect, it } from 'vitest'
import { EMPTY_STRUCTURED_LEXICON, LEXICON_CONCEPTS, type StructuredLexicon } from '@bellum/contracts'
import { i18n } from './index'
import { LEXICON_BINDINGS, buildLexiconResources } from './workspace-lexicon-bindings'
import { applyWorkspaceLexicon } from './workspace-lexicon'

/**
 * La preuve que le lexique par espace (D17) ne change RIEN par défaut, et
 * exactement ce qu'il annonce quand un espace pose ses mots.
 *
 * La garde la plus importante est la première : elle compare, clé par clé et
 * langue par langue, ce que `t()` rend RÉELLEMENT à la chaîne déclarée dans la
 * table de liaison. C'est ce qui empêche le défaut « renommage i18n sur la
 * mauvaise clé » — une clé morte surveillée pendant que l'écran ne bouge pas.
 */

afterEach(async () => {
  applyWorkspaceLexicon(EMPTY_STRUCTURED_LEXICON)
  await i18n.changeLanguage('fr')
})

describe('un espace SANS lexique lit exactement les libellés d’aujourd’hui', () => {
  it('chaque clé liée rend sa chaîne livrée, en FR', async () => {
    await i18n.changeLanguage('fr')
    applyWorkspaceLexicon(EMPTY_STRUCTURED_LEXICON)
    for (const binding of LEXICON_BINDINGS) {
      expect(i18n.t(`${binding.ns}:${binding.key}`), `${binding.ns}:${binding.key}`).toBe(binding.fallback.fr)
    }
  })

  it('chaque clé liée rend sa chaîne livrée, en EN', async () => {
    await i18n.changeLanguage('en')
    applyWorkspaceLexicon(EMPTY_STRUCTURED_LEXICON)
    for (const binding of LEXICON_BINDINGS) {
      expect(i18n.t(`${binding.ns}:${binding.key}`), `${binding.ns}:${binding.key}`).toBe(binding.fallback.en)
    }
  })

  it('n’écrit RIEN dans le magasin i18next — le no-op est une absence de code', () => {
    const before = JSON.stringify(i18n.getResourceBundle('fr', 'nav'))
    applyWorkspaceLexicon(null)
    applyWorkspaceLexicon(EMPTY_STRUCTURED_LEXICON)
    expect(JSON.stringify(i18n.getResourceBundle('fr', 'nav'))).toBe(before)
  })
})

describe('la table de liaison lit vraiment quelque chose', () => {
  it('couvre les huit concepts et une trentaine de clés', () => {
    // Une garde qui ne voit qu'un tiers de son sujet passe au vert sur les deux
    // autres : on vérifie que le corpus n'est pas vide et qu'aucun concept n'a
    // été oublié.
    expect(LEXICON_BINDINGS.length).toBeGreaterThanOrEqual(30)
    const covered = new Set(LEXICON_BINDINGS.map(binding => binding.concept))
    expect([...covered].sort()).toEqual([...LEXICON_CONCEPTS].sort())
  })

  it('ne lie que des clés qui EXISTENT dans les deux langues', () => {
    // Une liaison vers une clé absente rendrait la clé elle-même et personne ne
    // le verrait — le libellé afficherait « nav:items.ghost ».
    const missing = LEXICON_BINDINGS.filter(
      binding =>
        !i18n.exists(`${binding.ns}:${binding.key}`, { lng: 'fr' }) ||
        !i18n.exists(`${binding.ns}:${binding.key}`, { lng: 'en' }),
    ).map(binding => `${binding.ns}:${binding.key}`)
    expect(missing).toEqual([])
  })

  it('aucune clé n’est liée deux fois', () => {
    const keys = LEXICON_BINDINGS.map(binding => `${binding.ns}:${binding.key}`)
    expect(keys.length).toBe(new Set(keys).size)
  })
})

describe('un espace qui pose ses mots les voit à l’écran', () => {
  const POSTE: StructuredLexicon = {
    ...EMPTY_STRUCTURED_LEXICON,
    overrides: [
      { concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' },
      { concept: 'talent_pool', locale: 'fr', one: 'Banc', other: 'Bancs' },
    ],
  }

  it('remplace le libellé de navigation', async () => {
    await i18n.changeLanguage('fr')
    applyWorkspaceLexicon(POSTE)
    expect(i18n.t('nav:tabs.needs')).toBe('Postes')
    expect(i18n.t('nav:items.consultants')).toBe('Banc')
  })

  it('laisse INTACT ce qui n’est pas surchargé', async () => {
    await i18n.changeLanguage('fr')
    applyWorkspaceLexicon(POSTE)
    expect(i18n.t('nav:items.accounts')).toBe('Comptes')
    // #2152.1 (16/09/2026) — le DÉFAUT du produit est « Opportunités » depuis la
    // décision de Louis. Cette ligne vérifie toujours la même chose qu'avant :
    // un lexique qui ne surcharge PAS ce concept ne doit rien changer à son
    // libellé livré. C'est le libellé livré qui a changé, pas la règle.
    expect(i18n.t('nav:items.projects')).toBe('Opportunités')
  })

  it('ne réécrit JAMAIS une phrase — la borne du lot', async () => {
    await i18n.changeLanguage('fr')
    applyWorkspaceLexicon(POSTE)
    // Le mot « besoin » vit dans 170 libellés français, presque tous dans une
    // phrase. Aucun ne bouge : les accorder demanderait une grammaire.
    const sentence = i18n.getResourceBundle('fr', 'nav') as Record<string, unknown>
    expect(JSON.stringify(sentence)).not.toContain('Poste ')
  })

  it('revient au mot du produit quand on retire le terme — sans rechargement', async () => {
    await i18n.changeLanguage('fr')
    applyWorkspaceLexicon(POSTE)
    expect(i18n.t('nav:tabs.needs')).toBe('Postes')
    applyWorkspaceLexicon(EMPTY_STRUCTURED_LEXICON)
    expect(i18n.t('nav:tabs.needs')).toBe('Besoins')
  })

  it('ne fait PAS traverser les langues', async () => {
    applyWorkspaceLexicon(POSTE)
    await i18n.changeLanguage('en')
    // « Poste » a été posé en français : deviner « Position » écrirait un mot
    // que personne n'a choisi.
    expect(i18n.t('nav:tabs.needs')).toBe('Needs')
  })
})

describe('buildLexiconResources produit des clés que i18next sait lire', () => {
  it('imbrique les chemins au lieu de poser une clé plate', () => {
    // Un `{ 'items.accounts': … }` plat ne serait JAMAIS trouvé : i18next
    // découpe la clé sur le point pour descendre dans l'arbre.
    const bundles = buildLexiconResources(
      { overrides: [{ concept: 'account', locale: 'fr', one: 'Client', other: 'Clients' }] },
      'fr',
    )
    expect(bundles.nav).toMatchObject({ items: { accounts: 'Clients' }, tabs: { accounts: 'Clients' } })
    expect(Object.keys(bundles.nav ?? {})).not.toContain('items.accounts')
  })
})
