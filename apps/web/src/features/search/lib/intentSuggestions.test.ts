import { describe, expect, it } from 'vitest'
import { getPresets } from '../components/searchComposerPresets'
import { i18n } from '@/i18n'
import { INTENT_SUGGESTIONS } from './intentSuggestions'

const t = i18n.getFixedT('fr', 'search')

// #1589 (première moitié) — « chaque choix RÉUTILISE le preset existant — ne
// crée AUCUNE seconde source de vérité ». Cette suite protège exactement ça :
// aucune clé de preset inventée, tous les presets non-libres RESTENT
// atteignables, et « free » (texte libre) jamais recopié dans la liste.
//
// #2162.20 — décision de Louis du 17/09/2026 (QCM) : « étendre les presets
// avec un mapping vers les 8 libellés, ne pas remplacer ». Deux presets
// (`strategic`, `known-account`) portent chacun DEUX libellés désormais — ce
// n'est plus une bijection stricte, mais AUCUN preset n'est orphelin et
// AUCUNE clé de preset n'a été renommée ni retirée (searchComposerPresets.ts
// reste la seule source, GA-26).
describe('INTENT_SUGGESTIONS (#1589 — presets existants, jamais une 2ᵉ source)', () => {
  const existingPresetKeys = getPresets(t).map(p => p.key)

  it('chaque suggestion pointe vers un preset qui existe réellement dans searchComposerPresets', () => {
    for (const suggestion of INTENT_SUGGESTIONS) {
      expect(existingPresetKeys).toContain(suggestion.preset)
    }
  })

  // #2162.20 (corrigé — défaut mesuré en prod le 17/09) — `retry` n'a plus de
  // couloir mort à couvrir : il n'était déjà atteignable par AUCUNE interface
  // avant ce lot (`PresetDropdown.tsx` l'expose, mais rien ne le monte —
  // `grep -rn "<PresetDropdown" apps/web/src` ne rend rien), donc l'inscrire
  // ici ne « préservait » rien — ça créait le 9ᵉ chip que ce test couvre plus
  // bas. « Aucun orphelin » porte sur les cinq presets qui avaient une porte
  // avant ce lot ; `retry` en reste sans, exactement comme avant.
  it('couvre les cinq presets non-libres qui avaient déjà une porte — aucun orphelin, un doublon accepté (#2162.20)', () => {
    const coveredPresets = existingPresetKeys.filter(key => key !== 'free' && key !== 'retry')
    const covered = new Set(INTENT_SUGGESTIONS.map(s => s.preset))
    for (const preset of coveredPresets) {
      expect(covered.has(preset)).toBe(true)
    }
  })

  it('ne recopie jamais le preset "free" (texte libre) — il reste "Autre", à part', () => {
    expect(INTENT_SUGGESTIONS.some(s => s.preset === 'free')).toBe(false)
  })

  it('chaque suggestion a un libellé i18n résolvable', () => {
    for (const suggestion of INTENT_SUGGESTIONS) {
      const label = t(suggestion.labelKey)
      expect(label).not.toBe(suggestion.labelKey)
      expect(label.length).toBeGreaterThan(0)
    }
  })

  // #2162.20 — les 8 libellés EXACTS de l'issue #2162 (7 ici + « Autre » à
  // part, voir IntentPicker.tsx), NI PLUS NI MOINS : `toEqual` sur la liste
  // ENTIÈRE, pas `toContain` un par un — un `toContain` laisse passer un 8ᵉ
  // libellé en trop, exactement le défaut mesuré en prod le 17/09 (9 pastilles
  // au lieu de 7 + Autre, `intent.deepenAnalysis` glissé dans cette liste).
  it('porte EXACTEMENT les 7 libellés de #2162 — ni un de moins, ni un en trop', () => {
    const labels = INTENT_SUGGESTIONS.map(s => t(s.labelKey))
    expect(labels).toEqual([
      'Ouvrir ce compte',
      'Préparer un rendez-vous',
      'Trouver les décideurs',
      'Comprendre le groupe',
      'Vérifier un signal',
      'Préparer un référencement',
      'Situer les partenaires et concurrents',
    ])
    expect(t('intent.other')).toBe('Un autre objectif')
  })

  // #2162.20 (corrigé — défaut mesuré en prod le 17/09) — « Approfondir une
  // analyse » (preset `retry`) N'EST PAS un des 8 libellés de l'issue #2162 :
  // sa présence faisait 9 pastilles (8 + Autre) là où Louis en demandait 8
  // (7 + Autre). La justification d'origine (« son seul point d'entrée dans
  // l'UI ») était fausse : `retry` n'avait AUCUN point d'entrée avant ce lot,
  // `PresetDropdown.tsx` qui le porte n'étant monté nulle part
  // (`grep -rn "<PresetDropdown" apps/web/src` ne rend rien) — le retirer ne
  // régresse donc rien de RÉELLEMENT atteignable.
  it('ne porte plus "Approfondir une analyse" (preset retry) — hors des 7, sa justification était fausse', () => {
    expect(INTENT_SUGGESTIONS.some(s => s.preset === 'retry')).toBe(false)
    expect(INTENT_SUGGESTIONS.some(s => s.labelKey === 'intent.deepenAnalysis')).toBe(false)
  })
})
