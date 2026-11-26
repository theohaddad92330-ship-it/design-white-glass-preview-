import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-388 — AUCUNE PROMESSE DE RÉSIDENCE OU DE CONFORMITÉ NON CONTRACTUALISÉE.
 *
 * #2439.6 : un balayage manuel du 23/09/2026 a mesuré ZÉRO occurrence de
 * « hébergé en France/Europe », « conforme RGPD », « ISO 27001 », « SOC 2 »
 * ou « data residency » dans `apps/web/src/features` et les locales FR — mais
 * une absence mesurée UNE FOIS n'est pas un garde-fou : rien n'empêchait
 * cette phrase d'apparaître demain dans un écran ou une traduction. Cette
 * garde lit le corpus RÉEL (features .tsx + locales FR/EN) à chaque run,
 * pas un instantané.
 *
 * Pourquoi ces phrases précisément : chacune est une promesse VÉRIFIABLE
 * (un lieu d'hébergement, une norme, une certification) que Bellum ne peut
 * tenir sans un contrat qui la couvre — le produit ne CERTIFIE rien qu'il
 * n'a pas contractualisé (doctrine CLAUDE.md, #2439.6). Le texte réel du
 * produit peut nommer ce qui est VRAIMENT contractualisé ailleurs (pas dans
 * du texte produit non gardé) ; cette garde n'interdit pas de documenter un
 * fait contractuel dans `agent_docs/`, seulement de le PROMETTRE à l'écran.
 *
 * UNE EXEMPTION, DÉJÀ TRANCHÉE LE 13/09/2026 (`no-vendor-names-in-app.test.ts`) :
 * `manager.json → footer.hosting` disait « base Supabase, région eu-west-1 »
 * — un nom de fournisseur sur un écran client, refusé par la garde vendor-names.
 * Corrigé en « hébergées dans l'Union européenne »/« hosted in the European
 * Union » : la garantie due au lecteur (LA RÉSIDENCE, un fait d'infrastructure
 * réel, Supabase Plan Pro eu-west-1, CLAUDE.md §Supabase) sans nommer
 * l'hébergeur. Cette phrase précise reste EXEMPTÉE ici — ce que cette garde
 * refuse, ce sont les promesses de CONFORMITÉ (RGPD/ISO/SOC2) et les NOUVELLES
 * formulations de résidence, pas cette unique phrase déjà vérifiée et arbitrée.
 */

const WEB_SRC = join(__dirname, '..')

/** La seule phrase de résidence déjà vérifiée et arbitrée (voir ci-dessus) — exemptée. */
const EXEMPT_RESIDENCY_PHRASES: RegExp[] = [
  /données de ton équipe hébergées dans l.union européenne/i,
  /your team data is hosted in the european union/i,
]

/** Les phrases qui promettent une résidence ou une conformité vérifiable, FR et EN. */
const FORBIDDEN_CLAIMS: RegExp[] = [
  /h[ée]berg[ée][a-z]*\s+(en|dans)\s+(france|europe|l['’]u\.?e\.?|l['’]union europ[ée]enne)\b/i,
  /hosted\s+(in|within)\s+(france|europe|the\s+eu|the\s+european\s+union)\b/i,
  /conforme\s+(au\s+|à\s+la\s+)?rgpd\b/i,
  /gdpr[\s-]?compliant\b/i,
  /iso[\s-]?27001\b/i,
  /soc[\s-]?2\b/i,
  /data\s+residency\b/i,
  /r[ée]sidence\s+des\s+donn[ée]es\b/i,
]

function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('{/*')
}

type Offence = { file: string; line: number; text: string }

function isExemptResidencyLine(line: string): boolean {
  return EXEMPT_RESIDENCY_PHRASES.some(pattern => pattern.test(line))
}

function scanTsx(source: string, label: string): Offence[] {
  const found: Offence[] = []
  source.split('\n').forEach((line, index) => {
    if (isComment(line)) return
    if (isExemptResidencyLine(line)) return
    for (const pattern of FORBIDDEN_CLAIMS) {
      const hit = pattern.exec(line)
      if (hit) {
        found.push({ file: label, line: index + 1, text: hit[0].trim() })
        break
      }
    }
  })
  return found
}

/** Les locales sont du JSON : pas de commentaires à exclure, chaque ligne compte. */
function scanLocale(source: string, label: string): Offence[] {
  const found: Offence[] = []
  source.split('\n').forEach((line, index) => {
    if (isExemptResidencyLine(line)) return
    for (const pattern of FORBIDDEN_CLAIMS) {
      const hit = pattern.exec(line)
      if (hit) {
        found.push({ file: label, line: index + 1, text: hit[0].trim() })
        break
      }
    }
  })
  return found
}

function filesUnder(root: string, matchExt: (name: string) => boolean): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (entry.includes('.test.')) continue
      if (!matchExt(entry)) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

const FEATURE_TSX = filesUnder(join(WEB_SRC, 'features'), name => name.endsWith('.tsx'))
const LOCALE_FILES = [
  ...filesUnder(join(WEB_SRC, 'i18n/locales/fr'), name => name.endsWith('.json')),
  ...filesUnder(join(WEB_SRC, 'i18n/locales/en'), name => name.endsWith('.json')),
]

describe('GA-388 — aucune promesse de résidence/conformité non contractualisée', () => {
  it('LIT vraiment un corpus, et il n’est pas vide', () => {
    expect(FEATURE_TSX.length).toBeGreaterThan(200)
    expect(LOCALE_FILES.length).toBeGreaterThan(10)
  })

  it('sait dire NON — une promesse vérifiable est refusée, FR et EN', () => {
    const cassé = [
      'Tes données sont hébergées en France, sur des serveurs certifiés.',
      'This workspace is hosted in the European Union at all times.',
      'Ce traitement est conforme RGPD de bout en bout.',
      'We are ISO 27001 certified.',
      'We are SOC 2 certified.',
      'Data residency: your data never leaves the EU.',
    ]
    for (const ligne of cassé) {
      expect(scanTsx(ligne, 'synthétique'), ligne).toHaveLength(1)
      expect(scanLocale(ligne, 'synthétique'), ligne).toHaveLength(1)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    const innocent = [
      // Un fait TECHNIQUE mesuré (chiffrement), pas une promesse de résidence/conformité.
      'Les jetons sont chiffrés au repos (AES-256-GCM).',
      // Un nom de région Supabase, jamais présenté comme une garantie contractuelle.
      'workspace_region: eu-west-1',
      // Le nom du champ qui PORTE la classification (#2439.2), pas une promesse.
      'classification: "confidentiel"',
      // Un commentaire qui documente CETTE garde ne doit pas se faire arrêter par elle-même.
      '// cette garde refuse « conforme RGPD » et « ISO 27001 » dans le produit',
    ]
    for (const ligne of innocent) {
      expect(scanTsx(ligne, 'synthétique'), ligne).toHaveLength(0)
    }
  })

  it('exempte UNIQUEMENT la phrase de résidence déjà arbitrée le 13/09, rien de plus large', () => {
    // La preuve n°4 : l'exemption ne doit pas devenir une porte pour n'importe
    // quelle phrase de résidence — seule celle vérifiée le 13/09 passe.
    expect(scanLocale('Données de ton équipe hébergées dans l’Union européenne.', 'manager.json')).toHaveLength(0)
    expect(scanLocale('Your team data is hosted in the European Union.', 'manager.json')).toHaveLength(0)
    // Une AUTRE phrase de résidence, même proche, reste refusée.
    expect(scanLocale('Les données de facturation sont hébergées en Europe.', 'synthétique')).toHaveLength(1)
  })

  it('ne trouve aucune promesse de résidence/conformité dans les écrans', () => {
    const offences: Offence[] = []
    for (const file of FEATURE_TSX) {
      const label = relative(join(WEB_SRC, '..'), file)
      offences.push(...scanTsx(readFileSync(file, 'utf8'), label))
    }
    expect(
      offences,
      offences.length === 0
        ? ''
        : `Promesses de résidence/conformité non contractualisées :\n` +
            offences.map(o => `  ${o.file}:${o.line} — ${o.text}`).join('\n'),
    ).toEqual([])
  })

  it('ne trouve aucune promesse de résidence/conformité dans les traductions FR/EN', () => {
    const offences: Offence[] = []
    for (const file of LOCALE_FILES) {
      const label = relative(join(WEB_SRC, '..'), file)
      offences.push(...scanLocale(readFileSync(file, 'utf8'), label))
    }
    expect(
      offences,
      offences.length === 0
        ? ''
        : `Promesses de résidence/conformité non contractualisées :\n` +
            offences.map(o => `  ${o.file}:${o.line} — ${o.text}`).join('\n'),
    ).toEqual([])
  })
})
