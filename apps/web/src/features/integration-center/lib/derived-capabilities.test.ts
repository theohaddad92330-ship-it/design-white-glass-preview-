import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/integrationCenter.json'
import en from '@/i18n/locales/en/integrationCenter.json'
import { TOOL_ACTION_KEYS } from '../view/cards/connector-benefits'
import { DERIVED_CAPABILITIES, derivedCapabilities } from './derived-capabilities'

/**
 * #2078.14 — une capacité Bellum ne s'affiche que si le calcul EXISTE.
 *
 * La règle de #1443 (« rien d'autorisé, rien d'affiché ») garde les actions du
 * connecteur. Celle-ci garde l'autre moitié : une ligne « ce que je bâtis
 * par-dessus » doit nommer le fichier qui porte le calcul, et ce fichier doit
 * exister et contenir le symbole annoncé. Sans ça, la distinction nouvelle
 * deviendrait simplement un deuxième endroit où promettre.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..')

describe('#2078.14 — la table des capacités bâties par-dessus', () => {
  it('le corpus n’est pas vide — la garde LIT bien quelque chose', () => {
    expect(DERIVED_CAPABILITIES.length).toBeGreaterThan(0)
    expect(TOOL_ACTION_KEYS.length).toBeGreaterThan(20)
  })

  it('chaque capacité nomme un calcul qui existe sur le disque', () => {
    for (const capability of DERIVED_CAPABILITIES) {
      const full = join(repoRoot, capability.provenIn)
      expect({ key: capability.key, exists: existsSync(full) }).toEqual({ key: capability.key, exists: true })
      const source = readFileSync(full, 'utf8')
      expect({ key: capability.key, proven: source.includes(capability.provenBy) }).toEqual({
        key: capability.key,
        proven: true,
      })
    }
  })

  it('chaque accès REQUIS appartient au vocabulaire du connecteur', () => {
    // Un `requires` écrit à côté du vocabulaire serveur ne se déclencherait
    // jamais : la capacité serait déclarée, et invisible pour toujours.
    for (const capability of DERIVED_CAPABILITIES) {
      for (const action of capability.requires) {
        expect({ key: capability.key, action, known: TOOL_ACTION_KEYS.includes(action as never) }).toEqual({
          key: capability.key,
          action,
          known: true,
        })
      }
    }
  })

  it('chaque capacité a sa phrase en FR et en EN', () => {
    const frPhrases = (fr as { derivedCapabilities: Record<string, string> }).derivedCapabilities
    const enPhrases = (en as { derivedCapabilities: Record<string, string> }).derivedCapabilities
    for (const capability of DERIVED_CAPABILITIES) {
      expect(frPhrases?.[capability.key]).toBeTruthy()
      expect(enPhrases?.[capability.key]).toBeTruthy()
    }
    // Parité stricte : aucune phrase orpheline d'un côté ou de l'autre.
    expect(Object.keys(frPhrases).sort()).toEqual(Object.keys(enPhrases).sort())
    expect(Object.keys(frPhrases).sort()).toEqual(DERIVED_CAPABILITIES.map(c => c.key).sort())
  })

  it('un accès manquant retire la capacité — `requires` est un ET', () => {
    expect(derivedCapabilities(['list_events'])).toEqual(['detect_conflicts', 'free_slots'])
    expect(derivedCapabilities(['create_event'])).toEqual([])
    expect(derivedCapabilities([])).toEqual([])
  })

  it('elle n’attrape pas ce qu’elle ne vise pas — un outil riche sans agenda n’en gagne aucune', () => {
    // Témoin du voisin légitime : un CRM autorise beaucoup de choses, et
    // AUCUNE ne débloque un calcul d'agenda.
    expect(derivedCapabilities(['export_contact', 'log_to_crm', 'read_opportunities', 'search_contacts'])).toEqual([])
  })
})
