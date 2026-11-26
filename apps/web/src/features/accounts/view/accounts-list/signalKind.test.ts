import { describe, expect, it } from 'vitest'
import {
  Banknote,
  Building2,
  ClipboardList,
  Cpu,
  ExternalLink,
  Handshake,
  Network,
  PiggyBank,
  RefreshCw,
  Rocket,
  Scale,
  Shuffle,
  TrendingUp,
  Truck,
  TriangleAlert,
  UserPlus,
  UserRound,
  UserRoundCheck,
  Zap,
} from 'lucide-react'

import { signalKindIcon, signalKindOf } from './signalKind'

// #3206.6 (partiel, épopée #3240) — bellum_signals.py émet maintenant dix-huit
// types (les neuf d'origine + transformation/demenagement/investissement/
// organisation, déjà émis mais jamais reconnus ici + les cinq nouveaux de ce
// lot). Chacun doit sortir de l'éclair neutre pour son icône propre.
describe('signalKindOf — les dix-huit types que le prompt peut écrire', () => {
  it('reconnaît les neuf types déjà connus, inchangés', () => {
    expect(signalKindOf('nomination')).toBe('nomination')
    expect(signalKindOf('budget')).toBe('budget')
    expect(signalKindOf('projet')).toBe('projet')
    expect(signalKindOf('incident')).toBe('incident')
    expect(signalKindOf('regulation')).toBe('regulation')
    expect(signalKindOf('acquisition')).toBe('acquisition')
    expect(signalKindOf('partenariat')).toBe('partenariat')
    expect(signalKindOf('restructuration')).toBe('restructuration')
    expect(signalKindOf('recrutement')).toBe('recrutement')
  })

  it('reconnaît les quatre types déjà émis par le prompt mais jamais rangés ici', () => {
    expect(signalKindOf('transformation')).toBe('transformation')
    expect(signalKindOf('demenagement')).toBe('demenagement')
    expect(signalKindOf('investissement')).toBe('investissement')
    expect(signalKindOf('organisation')).toBe('organisation')
  })

  it('reconnaît les cinq types ajoutés ce lot au contrat de sortie', () => {
    expect(signalKindOf('levee_fonds')).toBe('levee_fonds')
    expect(signalKindOf('appel_offres')).toBe('appel_offres')
    expect(signalKindOf('technologie')).toBe('technologie')
    expect(signalKindOf('contact')).toBe('contact')
    expect(signalKindOf('recours_externe')).toBe('recours_externe')
  })

  it('replie casse et accents comme pour les neuf premiers types', () => {
    expect(signalKindOf('LEVEE_FONDS')).toBe('levee_fonds')
    expect(signalKindOf('Recours_Externe')).toBe('recours_externe')
    expect(signalKindOf('  Technologie  ')).toBe('technologie')
  })

  it('reste null pour un type toujours non reconnu', () => {
    expect(signalKindOf('recrutement massif')).toBeNull()
    expect(signalKindOf('inventé')).toBeNull()
    expect(signalKindOf(null)).toBeNull()
    expect(signalKindOf(undefined)).toBeNull()
  })
})

describe('signalKindIcon — une icône propre par type, jamais un repli sur un type voisin', () => {
  it('donne une icône distincte à chacun des neuf types déjà connus', () => {
    expect(signalKindIcon('nomination')).toBe(UserRoundCheck)
    expect(signalKindIcon('budget')).toBe(Banknote)
    expect(signalKindIcon('projet')).toBe(Rocket)
    expect(signalKindIcon('incident')).toBe(TriangleAlert)
    expect(signalKindIcon('regulation')).toBe(Scale)
    expect(signalKindIcon('acquisition')).toBe(Building2)
    expect(signalKindIcon('partenariat')).toBe(Handshake)
    expect(signalKindIcon('restructuration')).toBe(Shuffle)
    expect(signalKindIcon('recrutement')).toBe(UserPlus)
  })

  it('donne une icône propre aux quatre types déjà émis mais jusqu’ici sans icône', () => {
    expect(signalKindIcon('transformation')).toBe(RefreshCw)
    expect(signalKindIcon('demenagement')).toBe(Truck)
    expect(signalKindIcon('investissement')).toBe(TrendingUp)
    expect(signalKindIcon('organisation')).toBe(Network)
  })

  it('donne une icône propre aux cinq types ajoutés ce lot', () => {
    expect(signalKindIcon('levee_fonds')).toBe(PiggyBank)
    expect(signalKindIcon('appel_offres')).toBe(ClipboardList)
    expect(signalKindIcon('technologie')).toBe(Cpu)
    expect(signalKindIcon('contact')).toBe(UserRound)
    expect(signalKindIcon('recours_externe')).toBe(ExternalLink)
  })

  it('retombe sur l’éclair neutre pour un type non reconnu, jamais sur un type voisin', () => {
    expect(signalKindIcon('inventé')).toBe(Zap)
    expect(signalKindIcon(null)).toBe(Zap)
  })

  it('aucune icône ne sert deux types distincts (un glyphe = un type)', () => {
    const kinds = [
      'nomination',
      'budget',
      'projet',
      'incident',
      'regulation',
      'acquisition',
      'partenariat',
      'restructuration',
      'recrutement',
      'transformation',
      'demenagement',
      'investissement',
      'organisation',
      'levee_fonds',
      'appel_offres',
      'technologie',
      'contact',
      'recours_externe',
    ]
    const icons = kinds.map(k => signalKindIcon(k))
    expect(new Set(icons).size).toBe(icons.length)
  })
})
