import { describe, expect, it } from 'vitest'
import { APPLICATION_SECTORS, sectorCodesForGroup } from '@bellum/contracts'
import {
  MAX_SEARCH_SECTORS,
  SECTOR_GROUP_ORDER,
  groupAddPreview,
  groupSelectionState,
  matchApplicationSectors,
  migrateLegacySectors,
  privateSectorActive,
  profileSectorsNotSearched,
  sectorsForGroupToggle,
  togglePrivateSector,
} from './discover-sectors'

// Recette 21/10 D.2 — un profil à 7 secteurs, 5 cherchés : les 2 autres se nomment.
describe('profileSectorsNotSearched', () => {
  it('rend les secteurs du profil que la sélection active ne couvre pas', () => {
    const profile = ['aerospace', 'rail', 'automotive', 'defense', 'naval', 'energy', 'transport']
    expect(profileSectorsNotSearched(profile, profile.slice(0, 5))).toEqual(['energy', 'transport'])
  })

  it('dit NON : tout couvert, ou aucune sélection de secteur, ne fait rien dire', () => {
    expect(profileSectorsNotSearched(['rail'], ['rail', 'energy'])).toEqual([])
    expect(profileSectorsNotSearched(['rail', 'energy'], [])).toEqual([])
  })
})

describe('discover-sectors', () => {
  it("reconnaît « Aéronautique & Défense » comme DEUX secteurs — c'est le défaut signalé", () => {
    // Le profil de la cible portait « Aéronautique & Défense » et aucune des dix
    // pastilles ne le nommait. Le vocabulaire partagé les sépare exprès.
    expect(matchApplicationSectors(['Aéronautique & Défense'])).toEqual(['aerospace', 'defense'])
  })

  it('reconnaît un libellé exact du vocabulaire partagé', () => {
    expect(matchApplicationSectors(['Ferroviaire'])).toEqual(['rail'])
  })

  it('reconnaît un libellé anglais — le produit est bilingue', () => {
    expect(matchApplicationSectors(['Rail'])).toEqual(['rail'])
  })

  it('ignore les accents et la casse', () => {
    expect(matchApplicationSectors(['ENERGIES RENOUVELABLES'])).toEqual(['renewables'])
  })

  it("ne rend RIEN pour un libellé inconnu — un secteur faux est pire qu'aucun", () => {
    expect(matchApplicationSectors(['Poterie artisanale'])).toEqual([])
  })

  it('dédoublonne quand deux libellés désignent le même secteur', () => {
    expect(matchApplicationSectors(['Ferroviaire', 'Rail'])).toEqual(['rail'])
  })

  // #3815.2 — `sectorsForGroupToggle` rend désormais `{ sectors, droppedCount }` :
  // AJOUTE ce qui tient sous le plafond de {@link MAX_SEARCH_SECTORS} plutôt
  // que de tout refuser, et NOMME ce qui n'a pas tenu.
  it('cocher un groupe qui tient sous le plafond coche TOUS ses secteurs, rien de retiré', () => {
    // `energie` porte exactement 5 secteurs — tient pile sous le plafond.
    const energie = APPLICATION_SECTORS.filter(s => s.group === 'energie').map(s => s.code)
    expect(energie).toHaveLength(MAX_SEARCH_SECTORS)
    const result = sectorsForGroupToggle([], 'energie')
    expect(result.sectors.sort()).toEqual([...energie].sort())
    expect(result.droppedCount).toBe(0)
  })

  it('décocher un groupe déjà complet retire ses secteurs SANS toucher aux autres, jamais plafonné', () => {
    const energie = APPLICATION_SECTORS.filter(s => s.group === 'energie').map(s => s.code)
    const result = sectorsForGroupToggle([...energie, 'rail'], 'energie')
    expect(result.sectors).toEqual(['rail'])
    expect(result.droppedCount).toBe(0)
  })

  it('cocher un groupe partiellement coché le COMPLÈTE au lieu de le vider, quand il tient', () => {
    // Un groupe à moitié coché qui se viderait au clic ferait perdre une
    // sélection à l'utilisateur, alors que le geste attendu est « tout prendre ».
    const energie = APPLICATION_SECTORS.filter(s => s.group === 'energie').map(s => s.code)
    const result = sectorsForGroupToggle(['renewables'], 'energie')
    expect(result.sectors.sort()).toEqual([...energie].sort())
    expect(result.droppedCount).toBe(0)
  })

  // #3815 — le défaut signalé : cocher un groupe de 8 (industrie) à 3/5 était
  // REFUSÉ EN BLOC (3 + 8 > 5) alors que 2 places restaient. Il ajoute
  // maintenant les 2 qui tiennent et NOMME les 6 qui n'ont pas tenu.
  it('cocher un groupe plus grand que la place restante AJOUTE ce qui tient et NOMME le reste', () => {
    // `industrie` porte 8 secteurs — dépasse le plafond à lui seul.
    const industrie = APPLICATION_SECTORS.filter(s => s.group === 'industrie').map(s => s.code)
    expect(industrie.length).toBeGreaterThan(MAX_SEARCH_SECTORS)
    const current = ['rail', 'renewables', 'nuclear'] // 3/5 déjà posés, hors du groupe
    const result = sectorsForGroupToggle(current, 'industrie')
    expect(result.sectors).toHaveLength(MAX_SEARCH_SECTORS)
    expect(result.sectors.slice(0, 3)).toEqual(current)
    // Les 3 déjà posés restent, 2 membres du groupe entrent, 6 ne tiennent pas.
    expect(result.sectors.filter(code => industrie.includes(code))).toHaveLength(2)
    expect(result.droppedCount).toBe(industrie.length - 2)
    // #3815 (recette prod 08/10) — « 6 sous-secteurs non ajoutés » ne NOMMAIT
    // que le compte. `droppedCodes` porte les codes eux-mêmes, dans l'ordre du
    // groupe — c'est ce que l'écran doit pouvoir lister ou mettre en info-bulle.
    expect(result.droppedCodes).toHaveLength(6)
    expect(result.droppedCodes).toEqual(industrie.filter(code => !result.sectors.includes(code)))
  })

  it('cocher un groupe déjà au plafond (aucune place) n’ajoute rien, nomme tout le groupe', () => {
    const current = ['rail', 'renewables', 'nuclear', 'oil_gas', 'water_waste'] // 5/5
    const industrie = APPLICATION_SECTORS.filter(s => s.group === 'industrie').map(s => s.code)
    const result = sectorsForGroupToggle(current, 'industrie')
    expect(result.sectors).toEqual(current)
    expect(result.droppedCount).toBe(8)
    expect(result.droppedCodes).toEqual(industrie)
  })

  // Le retrait d'un groupe déjà complet ne heurte jamais le plafond : rien de
  // nommé, `droppedCodes` est vide — pas seulement `droppedCount` à 0.
  it('décocher un groupe complet ne nomme rien (droppedCodes vide)', () => {
    const energie = APPLICATION_SECTORS.filter(s => s.group === 'energie').map(s => s.code)
    const result = sectorsForGroupToggle([...energie, 'rail'], 'energie')
    expect(result.droppedCodes).toEqual([])
  })

  it("dit l'état d'un groupe : aucun, partiel, ou tous", () => {
    expect(groupSelectionState([], 'industrie')).toBe('none')
    expect(groupSelectionState(['aerospace'], 'industrie')).toBe('partial')
    const all = APPLICATION_SECTORS.filter(s => s.group === 'industrie').map(s => s.code)
    expect(groupSelectionState(all, 'industrie')).toBe('all')
  })

  it("migre une recherche enregistrée : l'ancienne clé large devient ses secteurs fins", () => {
    // Les recherches déjà enregistrées portent les dix anciennes clés. Les
    // laisser tomber viderait le périmètre de quelqu'un en silence.
    const migrated = migrateLegacySectors(['industry'])
    expect(migrated).toContain('aerospace')
    expect(migrated).toContain('automotive')
  })

  it('laisse passer un code déjà fin — une migration ne doit pas être destructive', () => {
    expect(migrateLegacySectors(['aerospace'])).toEqual(['aerospace'])
  })

  it("ignore ce qu'elle ne sait pas migrer plutôt que de le transformer en tout", () => {
    expect(migrateLegacySectors(['all', 'inconnu'])).toEqual([])
  })

  // V4-CORRECTIFS-C 4284.23 — `?sectors=software_tech,telecom,media` perdait `media` en silence.
  it('« media » (lien partagé) désigne Médias & divertissement : le secteur ne se perd pas', () => {
    expect(migrateLegacySectors(['software_tech', 'telecom', 'media'])).toEqual([
      'software_tech',
      'telecom',
      'media_entertainment',
    ])
    expect(migrateLegacySectors(['media', 'media_entertainment'])).toEqual(['media_entertainment'])
  })

  it('ordonne les groupes comme le vocabulaire partagé', () => {
    expect(SECTOR_GROUP_ORDER.length).toBe(new Set(APPLICATION_SECTORS.map(s => s.group)).size)
  })
})

describe('discover-sectors — un libellé LARGE retombe sur son groupe', () => {
  it('« Banque » seul rend TOUT le groupe finance — un profil écrit large', () => {
    // Aucun libellé fin ne contient « banque » comme terme entier (« Banque de
    // détail & privée » est plus long). S'arrêter là ferait perdre la cible de
    // quelqu'un qui a rempli son profil correctement.
    const codes = matchApplicationSectors(['Banque'])
    expect(codes).toContain('retail_banking')
    expect(codes).toContain('insurance')
    expect(codes).toContain('fintech')
  })

  it('« Industrie » rend tout le groupe industrie', () => {
    expect(matchApplicationSectors(['Industrie'])).toContain('automotive')
  })

  it('le PRÉCIS gagne sur le large — « Banque de détail » ne rend pas toute la finance', () => {
    // Sinon la précision du vocabulaire partagé ne servirait à rien : le geste
    // le plus fin serait toujours écrasé par le repli.
    expect(matchApplicationSectors(['Banque de détail'])).toEqual(['retail_banking'])
  })

  it('mélange un libellé précis et un libellé large sans se contredire', () => {
    const codes = matchApplicationSectors(['Aéronautique & Défense', 'Banque'])
    expect(codes.slice(0, 2)).toEqual(['aerospace', 'defense'])
    expect(codes).toContain('insurance')
  })
})

// KEVIN-FIX K.5 — le plafond se dit AVANT le clic : ce que le groupe ajoutera, ce qui reste de place.
describe('groupAddPreview', () => {
  it('un groupe plus gros que la place restante annonce combien il en ajoutera et combien ne tiendront pas', () => {
    const industrie = APPLICATION_SECTORS.filter(s => s.group === 'industrie').map(s => s.code)
    const preview = groupAddPreview([], 'industrie')
    expect(preview).toEqual({
      willAdd: MAX_SEARCH_SECTORS,
      missing: industrie.length - MAX_SEARCH_SECTORS,
      room: MAX_SEARCH_SECTORS,
    })
  })

  it('à 3/5, il reste 2 places : le groupe en ajoute 2', () => {
    expect(groupAddPreview(['rail', 'renewables', 'nuclear'], 'industrie')).toMatchObject({ willAdd: 2, room: 2 })
  })

  it('sait dire NON : un groupe qui tient en entier ne manque de rien', () => {
    const small = SECTOR_GROUP_ORDER.find(
      group => APPLICATION_SECTORS.filter(s => s.group === group).length <= MAX_SEARCH_SECTORS,
    )
    expect(small).toBeDefined()
    expect(groupAddPreview([], small as (typeof SECTOR_GROUP_ORDER)[number]).missing).toBe(0)
  })

  it('un groupe déjà complet se retire : rien à annoncer', () => {
    const members = APPLICATION_SECTORS.filter(s => s.group === 'public').map(s => s.code)
    expect(groupAddPreview(members, 'public')).toMatchObject({ willAdd: 0, missing: 0 })
  })
})

describe('#4294.7 — Secteur privé = exclure le groupe public (NAF)', () => {
  const publicCodes = sectorCodesForGroup('public')

  it('allume : ajoute tous les secteurs publics aux exclus et garde les autres exclusions', () => {
    const next = togglePrivateSector(['automotive'])
    expect(next).toEqual(expect.arrayContaining(['automotive', ...publicCodes]))
    expect(privateSectorActive(next)).toBe(true)
  })

  it('éteint : ne retire que les secteurs publics', () => {
    expect(togglePrivateSector(['automotive', ...publicCodes])).toEqual(['automotive'])
  })

  it('sait dire NON : une exclusion partielle du public n’allume pas la puce, et rien d’exclu = éteinte', () => {
    expect(privateSectorActive([])).toBe(false)
    expect(privateSectorActive(publicCodes.slice(0, 1))).toBe(publicCodes.length === 1)
  })
})
