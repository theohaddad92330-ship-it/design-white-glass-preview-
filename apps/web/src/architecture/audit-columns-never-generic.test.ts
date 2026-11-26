import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2067.17 — INTERDIT : « Arrêter de perdre du temps » / « Renforcer la
 * prospection » sur les colonnes Arrêter / Garder / Renforcer de l'audit
 * commercial.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 * `AuditDecisionColumns.tsx` rend le TITRE de chaque colonne depuis l'i18n
 * (« Arrêter », « Garder », « Renforcer ») et chaque PUCE depuis
 * `buildCommercialAudit` (`build-audit.ts`) — un texte réel du profil
 * (`messaging.avoid`, `coaching.mainWeakness`…), jamais une phrase fixe.
 * Aujourd'hui, rien n'empêche un futur ajout d'un texte de REMPLISSAGE
 * générique (un titre plus long, un texte affiché quand le bloc est vide,
 * un exemple recopié dans l'i18n) qui répéterait la même phrase creuse pour
 * tout le monde — exactement ce que le point #2067.17 interdit.
 *
 * ⚠️ Elle ne peut pas lire le CONTENU des puces (il vient de texte généré par
 * le profileur, pas du dépôt) : elle lit ce que LE DÉPÔT écrit — l'i18n de
 * l'écran et le code des deux fichiers qui le composent.
 */

const WEB_SRC = join(__dirname, '..')

const SCANNED_FILES = [
  join(WEB_SRC, 'i18n/locales/fr/commercialAudit.json'),
  join(WEB_SRC, 'i18n/locales/en/commercialAudit.json'),
  join(WEB_SRC, 'features/commercial-audit/components/AuditDecisionColumns.tsx'),
  join(WEB_SRC, 'features/commercial-audit/lib/build-audit.ts'),
]

/**
 * Les phrases GÉNÉRIQUES nommées par #2067.17, FR et EN — une phrase qui
 * dirait la même chose à n'importe quel profil, donc qui ne vient pas d'un
 * champ réel.
 */
const FORBIDDEN_GENERIC_PHRASES: readonly string[] = [
  'Arrêter de perdre du temps',
  'Renforcer la prospection',
  'Stop wasting time',
  'Reinforce prospecting',
]

/** Un catalogue i18n, aplati en une seule chaîne de recherche. */
function flattenJson(raw: string): string {
  const values: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      values.push(node)
      return
    }
    if (!node || typeof node !== 'object') return
    for (const v of Object.values(node as Record<string, unknown>)) walk(v)
  }
  walk(JSON.parse(raw))
  return values.join('\n')
}

/** Retire les commentaires : un docblock qui CITE la phrase interdite pour
 *  en parler (comme celui-ci) ne doit pas déclencher la garde. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function haystackOf(file: string): string {
  const raw = readFileSync(file, 'utf8')
  return file.endsWith('.json') ? flattenJson(raw) : stripComments(raw)
}

function genericPhrasesFound(): string[] {
  const found: string[] = []
  for (const file of SCANNED_FILES) {
    const haystack = haystackOf(file)
    for (const phrase of FORBIDDEN_GENERIC_PHRASES) {
      if (haystack.includes(phrase)) found.push(`${file.slice(file.indexOf('/src'))} → « ${phrase} »`)
    }
  }
  return found
}

describe('#2067.17 — les colonnes Arrêter/Garder/Renforcer ne portent aucune phrase générique', () => {
  it('LIT quelque chose — les quatre fichiers de l’écran existent et ne sont pas vides', () => {
    for (const file of SCANNED_FILES) {
      expect(haystackOf(file).length, file).toBeGreaterThan(50)
    }
  })

  it('aucune phrase interdite n’est écrite dans l’écran aujourd’hui', () => {
    expect(genericPhrasesFound()).toEqual([])
  })

  it('sait dire NON — une phrase générique remise dans l’i18n de l’écran est vue', () => {
    const fautif = JSON.stringify({ columns: { example: 'Arrêter de perdre du temps' } })
    expect(flattenJson(fautif).includes('Arrêter de perdre du temps')).toBe(true)
    const sain = JSON.stringify({ columns: { example: 'Arrêter' } })
    expect(FORBIDDEN_GENERIC_PHRASES.some(p => flattenJson(sain).includes(p))).toBe(false)
  })

  it('n’attrape pas le voisin légitime — un texte SPÉCIFIQUE au profil qui commence par le même mot', () => {
    // « Renforcer » seul est le TITRE légitime de la colonne (columns.json →
    // "reinforce": "Renforcer") ; c'est la phrase COMPLÈTE, générique à tout
    // profil, qui est interdite — pas le mot.
    const specifique = 'Renforcer le suivi des comptes grand groupe déjà engagés'
    expect(FORBIDDEN_GENERIC_PHRASES.some(p => specifique.includes(p))).toBe(false)
    const titreColonneSeul = JSON.stringify({ columns: { reinforce: 'Renforcer' } })
    expect(genericPhrasesFoundIn(titreColonneSeul)).toEqual([])
  })

  it('un docblock qui CITE la phrase interdite pour en parler n’est pas confondu avec du texte affiché', () => {
    const source = `/** Interdit : « Renforcer la prospection » — voir #2067.17. */\nexport const x = 1`
    expect(stripComments(source).includes('Renforcer la prospection')).toBe(false)
  })
})

/** Même détecteur que `genericPhrasesFound`, appliqué à une chaîne JSON arbitraire (tests). */
function genericPhrasesFoundIn(rawJson: string): string[] {
  const haystack = flattenJson(rawJson)
  return FORBIDDEN_GENERIC_PHRASES.filter(p => haystack.includes(p))
}
