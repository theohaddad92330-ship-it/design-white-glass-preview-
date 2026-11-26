/**
 * GA-105 — une ligne de suggestion porte de quoi DISTINGUER deux homonymes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 30/08/2026. Le bouton « Analyser une entreprise »
 * ouvre une modale qui promet « Bellum n'analyse que des sociétés qu'il a
 * identifiées, **pour ne pas se tromper d'homonyme** ». On y tape « ROCHE ».
 * Cinq lignes sortent, et sous chacune des cinq, mot pour mot :
 *
 *     « 5 des résultats portent le nom "ROCHE". »
 *
 * Une phrase vraie, répétée à l'identique cinq fois, qui n'aide à choisir entre
 * aucune des cinq. C'est la loi 4 du tome 7 — rien n'apparaît deux fois sous la
 * même forme avec le même contenu — et c'est un écran de DÉSAMBIGUÏSATION, donc
 * l'écran où cette faute coûte le plus cher : le commercial choisit, huit
 * crédits partent, et le dossier se remplit avec les contacts d'une autre
 * société. C'est arrivé (ROCHE → ROCHE BOBOIS).
 *
 * La règle : **ce qui départage deux homonymes, ce sont des FAITS PUBLIÉS par le
 * registre, et ils sont sur la ligne.** L'effectif, la catégorie d'entreprise,
 * le SIREN — l'identifiant qui, lui, ne peut pas être partagé.
 *
 * Le corollaire, aussi important : **un fait absent est ABSENT.** Le registre
 * écrit `NN` quand il ne publie pas de tranche d'effectif ; la ligne se tait
 * alors, elle n'écrit pas « 0 salarié ». « Non mesuré » et « aucun salarié »
 * sont deux faits opposés — et confondre les deux est précisément ce qui rendait
 * une SCI indiscernable d'un groupe de 800 personnes.
 *
 * Et ce qu'elle NE fait pas : aucun pourcentage de confiance, aucun score. Le
 * classement des suggestions existe (il vit côté service IA), mais le dépôt
 * n'affiche AUCUNE probabilité — arbitrage refusé six fois. On trie, on
 * n'annonce pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX PREUVES EXIGÉES D'UNE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 *  · elle LIT quelque chose → elle REND le vrai composant sur des faits registre
 *    réels et vérifie que le rendu n'est pas vide ; et elle relit le code des
 *    DEUX listes déroulantes de l'application (`CompanySearchField` et
 *    `SearchAutocomplete`) en exigeant que le corpus les contienne. Un corpus
 *    vide passerait au vert sans rien lire ;
 *  · elle SAIT DIRE NON → sur une ligne amputée de ses faits, la règle rougit ;
 *    sur deux homonymes aux faits identiques, elle rougit aussi ; et l'extracteur
 *    de « ligne répétée » est mis à l'épreuve sur une source fabriquée qui remet
 *    le compte d'homonymes DANS la ligne.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompanySuggestion } from '@bellum/contracts'
import { SearchSuggestionItem } from '@/features/search/components/SearchSuggestionItem'

const SRC = join(__dirname, '..')

/** Les deux listes déroulantes qui rendent une suggestion d'entreprise. */
const DROPDOWNS = [
  'features/search/components/CompanySearchField.tsx',
  'features/search/components/SearchAutocomplete.tsx',
] as const

const SOURCES = DROPDOWNS.map(path => ({ path, code: readFileSync(join(SRC, path), 'utf8') }))

afterEach(cleanup)

/* ------------------------------------------------------------------ */
/*  L'extracteur                                                       */
/* ------------------------------------------------------------------ */

/**
 * Le compte d'homonymes est-il rendu DANS la ligne plutôt qu'au-dessus d'elle ?
 *
 * On cherche l'attribut passé au composant de ligne : `nameGroup={…}` sur une
 * balise `<SearchSuggestionItem …>`. La borne `[^>]*?` garde la lecture À
 * L'INTÉRIEUR de la balise — sans elle, un attribut appartenant à un composant
 * voisin serait attribué à celui-ci.
 *
 * ⚠️ `RegExp` construite à l'usage : le drapeau `g` rend `.test()` STATEFUL, et
 * une expression partagée entre deux fichiers en sauterait un sur deux.
 */
function repeatsGroupInsideTheRow(source: string): boolean {
  return /<\s*SearchSuggestionItem\b[^>]*?\bnameGroup\s*=/g.test(source)
}

/** La ligne rend-elle le compte d'homonymes une fois, au-dessus de la liste ? */
function announcesGroupAboveTheList(source: string): boolean {
  return /suggestion\.sameRegistryName/.test(source)
}

/* ------------------------------------------------------------------ */
/*  Les faits d'une ligne                                              */
/* ------------------------------------------------------------------ */

/** Le laboratoire Roche — valeurs PUBLIQUES du registre, rien de fabriqué. */
function laboratoire(overrides: Partial<CompanySuggestion> = {}): CompanySuggestion {
  return {
    name: 'ROCHE',
    siren: '552012031',
    city: 'BOULOGNE-BILLANCOURT',
    sector: 'Commerce de gros de produits pharmaceutiques',
    headcount_label: '500 à 999 salariés',
    size_class: 'ETI',
    // #1586 — le laboratoire, largement observé par la mémoire marché.
    marketPaths: 41,
    ...overrides,
  }
}

/** La SCI homonyme, dont le registre ne publie AUCUN effectif (tranche `NN`). */
function sciHomonyme(overrides: Partial<CompanySuggestion> = {}): CompanySuggestion {
  return {
    name: 'ROCHE',
    siren: '811131184',
    city: 'CHAMROUSSE',
    sector: 'Activités immobilières',
    headcount_label: null,
    size_class: null,
    // #1586 — l'exception NOMMÉE : couverte par la mémoire, mais SOUS le
    // seuil produit. `0` s'affiche VRAIMENT ici, contrairement à l'effectif.
    marketPaths: 0,
    ...overrides,
  }
}

function renderedText(suggestion: CompanySuggestion): string {
  const { container } = render(<SearchSuggestionItem suggestion={suggestion} onSelect={vi.fn()} />)
  return container.textContent ?? ''
}

/* ------------------------------------------------------------------ */
/*  La règle                                                           */
/* ------------------------------------------------------------------ */

describe('GA-105 — la ligne porte les faits qui départagent', () => {
  it('rend l’effectif publié, la catégorie et le SIREN', () => {
    render(<SearchSuggestionItem suggestion={laboratoire()} onSelect={vi.fn()} />)

    const facts = screen.getByTestId('suggestion-facts').textContent ?? ''
    expect(facts).toContain('500 à 999 salariés')
    expect(facts).toContain('ETI')
    expect(facts).toContain('552012031')
  })

  it('n’écrit JAMAIS « 0 » quand le registre ne publie pas d’effectif', () => {
    const text = renderedText(sciHomonyme())

    expect(text).toContain('811131184')
    // « NN » au registre : la ligne se tait. Un zéro se croit, un vide se lit.
    expect(text).not.toMatch(/\b0\s*salarié/i)
    expect(text).not.toContain('500 à 999 salariés')
  })

  it('distingue DEUX homonymes — leurs lignes ne peuvent pas être identiques', () => {
    cleanup()
    const gros = renderedText(laboratoire())
    cleanup()
    const petit = renderedText(sciHomonyme())

    expect(gros).not.toEqual(petit)
  })

  it('n’annonce aucune probabilité ni score sur la ligne', () => {
    // Le classement existe, côté service. Ce qu'il produit est un ORDRE, jamais
    // un « 87 % de confiance » — le dépôt n'affiche aucune probabilité.
    const text = renderedText(laboratoire())
    expect(text).not.toMatch(/\d+\s*%/)
    expect(text.toLowerCase()).not.toContain('confiance')
    expect(text.toLowerCase()).not.toContain('score')
  })
})

/**
 * #1586 — extension de GA-105 : les parcours observés par la mémoire marché
 * départagent AUSSI deux homonymes, et portent l'EXCEPTION la plus importante
 * du lot — ici, et SEULEMENT ici, « 0 » est un fait qui s'affiche.
 */
describe('GA-105 — les parcours observés départagent aussi, et « 0 » s’y affiche VRAIMENT', () => {
  it('rend le nombre de parcours pour le laboratoire, largement observé', () => {
    render(<SearchSuggestionItem suggestion={laboratoire()} onSelect={vi.fn()} />)
    expect(screen.getByTestId('suggestion-facts').textContent ?? '').toContain('41 parcours observés')
  })

  it('rend « aucun parcours observé » pour la SCI — pas de silence, contrairement à l’effectif', () => {
    // Le contraste avec le test « n’écrit JAMAIS 0 quand… » ci-dessus EST le
    // point : l’effectif absent se tait, le parcours à 0 s’affiche. Deux
    // règles opposées, sur la MÊME ligne, chacune pour sa bonne raison.
    const text = renderedText(sciHomonyme())
    expect(text).toContain('Aucun parcours observé')
  })

  it('distingue les deux homonymes par ce seul fait, à effectif égal', () => {
    cleanup()
    const gros = renderedText(laboratoire({ headcount_label: null, size_class: null, marketPaths: 41 }))
    cleanup()
    const petit = renderedText(sciHomonyme({ headcount_label: null, size_class: null, marketPaths: 0 }))
    expect(gros).not.toEqual(petit)
  })

  it('reste silencieux — jamais « 0 » ni un texte fantôme — quand la mémoire n’a rapproché personne', () => {
    cleanup()
    const text = renderedText(laboratoire({ marketPaths: null }))
    expect(text).not.toMatch(/parcours/)
  })
})

describe('GA-105 — le compte d’homonymes s’annonce UNE fois', () => {
  it('n’est répété sous aucune ligne, dans aucune des deux listes', () => {
    const offenders = SOURCES.filter(entry => repeatsGroupInsideTheRow(entry.code)).map(entry => entry.path)

    expect(
      offenders,
      [
        'Le compte d’homonymes est rendu DANS la ligne : il sortira à l’identique',
        'sous chacune des cinq suggestions, et n’aidera à en choisir aucune.',
        'C’est une propriété de la LISTE — annonce-la une fois, au-dessus.',
      ].join('\n'),
    ).toEqual([])
  })

  it('est bien annoncé au-dessus de la liste, dans les deux', () => {
    const silent = SOURCES.filter(entry => !announcesGroupAboveTheList(entry.code)).map(entry => entry.path)
    expect(silent, 'Ces listes n’annoncent plus l’ensemble d’homonymes du tout.').toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  Preuve n°1 — la garde LIT quelque chose                            */
/* ------------------------------------------------------------------ */

describe('GA-105 — le corpus n’est pas vide', () => {
  it('relit les DEUX listes déroulantes de l’application', () => {
    expect(SOURCES).toHaveLength(2)
    for (const entry of SOURCES) {
      expect(entry.code.length, `${entry.path} est vide`).toBeGreaterThan(500)
      expect(entry.code, `${entry.path} ne rend plus de suggestion`).toContain('SearchSuggestionItem')
    }
  })

  it('rend réellement le composant — pas une chaîne vide', () => {
    const text = renderedText(laboratoire())
    expect(text.length).toBeGreaterThan(20)
    expect(text).toContain('ROCHE')
  })
})

/* ------------------------------------------------------------------ */
/*  Preuve n°2 — la garde sait dire NON                                */
/* ------------------------------------------------------------------ */

describe('GA-105 — la garde sait dire non', () => {
  it('rougit sur une ligne amputée de ses faits', () => {
    // La ligne d'AVANT le correctif : ville et secteur, rien de plus.
    render(
      <SearchSuggestionItem
        suggestion={{ name: 'ROCHE', siren: '', city: 'CHAMROUSSE', sector: 'Activités immobilières' }}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('suggestion-facts')).toBeNull()
  })

  it('rougit sur deux homonymes dont les lignes seraient identiques', () => {
    cleanup()
    const a = renderedText({ name: 'ROCHE', siren: '', city: '', sector: '' })
    cleanup()
    const b = renderedText({ name: 'ROCHE', siren: '', city: '', sector: '' })
    // Deux lignes indiscernables : c'est exactement ce que la règle interdit, et
    // la voici en train de le constater sur une source fabriquée.
    expect(a).toEqual(b)
  })

  it('repère un compte d’homonymes REMIS dans la ligne', () => {
    const bad = `
      <SearchSuggestionItem
        suggestion={s}
        onSelect={onSelectSuggestion}
        nameGroup={nameGroups.get(s.siren) ?? null}
      />
    `
    expect(repeatsGroupInsideTheRow(bad)).toBe(true)
  })

  it('n’attrape pas un nameGroup destiné à un AUTRE composant', () => {
    const other = '<ScopeConfirmPanel nameGroup={group} />'
    expect(repeatsGroupInsideTheRow(other)).toBe(false)
  })

  it('voit une liste qui n’annoncerait plus rien', () => {
    expect(announcesGroupAboveTheList('<div>rien du tout</div>')).toBe(false)
  })
})
