import type { DeclaredSignal, RecentSignal } from '@bellum/contracts'
import { graftDeclaredSignals, toRecentSignal } from './declared-signals'

/**
 * #2634.1 — LinkedIn comme source de signaux d'achat, par une voie autorisée
 * (saisie manuelle, import, connecteur à venir) — jamais un scraping.
 *
 * La greffe est PURE et se joue à la LECTURE (`AccountsService.findOneForWorkspace`),
 * jamais en base : `accounts.recent_signals` reste la propriété EXCLUSIVE du
 * pipeline IA, qui la réécrit intégralement à chaque analyse. Un signal
 * déclaré vit dans `accounts.declared_signals`, une colonne que l'IA ne
 * touche jamais — il survit donc à toute ré-analyse, par construction, sans
 * qu'aucun "regreffe après un run" ne soit nécessaire.
 */

function declared(overrides: Partial<DeclaredSignal> = {}): DeclaredSignal {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    label: 'Poste Lead Data Engineer publié',
    source: 'LinkedIn',
    entryKind: 'manual',
    declaredAt: '2026-09-22T18:00:00.000Z',
    declaredBy: '22222222-2222-2222-2222-222222222222',
    declaredByName: 'Louis Schlegel',
    ...overrides,
  }
}

describe('toRecentSignal', () => {
  it('porte le libellé, la source et le type déclarés — jamais reformulés', () => {
    const signal = toRecentSignal(declared({ signalType: 'recrutement' }))
    expect(signal.signal).toBe('Poste Lead Data Engineer publié')
    expect(signal.source).toBe('LinkedIn')
    expect(signal.type).toBe('recrutement')
  })

  it('nomme la provenance — entry_kind, déclarant et date — pour que l’écran distingue un signal saisi d’un signal détecté', () => {
    const signal = toRecentSignal(declared())
    expect(signal.entry_kind).toBe('manual')
    expect(signal.declared_at).toBe('2026-09-22T18:00:00.000Z')
    expect(signal.declared_by_name).toBe('Louis Schlegel')
  })

  it('un signal IMPORTÉ porte la date du document, distincte de la date de déclaration', () => {
    const signal = toRecentSignal(declared({ entryKind: 'import', documentDate: '2026-06-01' }))
    expect(signal.entry_kind).toBe('import')
    expect(signal.document_date).toBe('2026-06-01')
    // `date` (ce que l'écran affiche déjà) retombe sur la date du document, à
    // défaut d'une date de signal plus précise — jamais sur la date du geste
    // d'import, qui rajeunirait un export vieux de plusieurs mois.
    expect(signal.date).toBe('2026-06-01')
  })

  it('un signal sans date de document ni date de signal reste sans date — jamais une date inventée', () => {
    const signal = toRecentSignal(declared())
    expect(signal.date).toBeNull()
  })
})

describe('toRecentSignal — #3682.6 un import ne rajeunit pas ses faits', () => {
  it('un export de 2023 importé aujourd’hui est une archive, pas un fait actuel', () => {
    const signal = toRecentSignal(declared({ entryKind: 'import', documentDate: '2023-03-01' }))
    expect(signal.freshness).toBe('archive')
  })
  it('sans date, le fait déclaré n’est ni actuel ni rajeuni par la déclaration', () => {
    expect(toRecentSignal(declared()).freshness).toBe('undated')
  })
  it('un fait déclaré récent reste actuel', () => {
    const recent = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    expect(toRecentSignal(declared({ signalDate: recent })).freshness).toBe('current')
  })
})

describe('graftDeclaredSignals', () => {
  const detected: RecentSignal[] = [{ signal: 'Chiffre d’affaires en hausse', source: 'Communiqué de presse' }]

  it('sans signal déclaré, rend la liste détectée INCHANGÉE (comportement d’avant ce lot)', () => {
    expect(graftDeclaredSignals(detected, [])).toEqual(detected)
  })

  it('place les signaux déclarés EN TÊTE — une correction humaine gagne toujours', () => {
    const grafted = graftDeclaredSignals(detected, [declared()])
    expect(grafted).toHaveLength(2)
    expect(grafted[0]?.signal).toBe('Poste Lead Data Engineer publié')
    expect(grafted[1]?.signal).toBe('Chiffre d’affaires en hausse')
  })

  it('ne mute pas le tableau détecté reçu en entrée', () => {
    const copy = [...detected]
    graftDeclaredSignals(detected, [declared()])
    expect(detected).toEqual(copy)
  })
})
