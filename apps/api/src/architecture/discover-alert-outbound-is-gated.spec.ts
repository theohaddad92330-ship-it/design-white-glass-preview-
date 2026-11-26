import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA — un envoi d'alerte Découvrir franchit les QUATRE verrous, et l'interrupteur
 * d'opérateur vit à UN seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'envoi sortant est un arrêt de ce dépôt. La décision du 15/09/2026 l'ouvre
 * pour les canaux d'alerte de Découvrir, et pour eux seuls, à la condition que
 * quatre verrous soient franchis dans cet ordre :
 *
 *  1. l'INTERRUPTEUR d'opérateur (`gate.enabled`), avant toute lecture ;
 *  2. la CLÉ du canal (`configuredFor`) — sans clé, aucune tentative ;
 *  3. le CONSENTEMENT DATÉ (`isQualifiedOutboundConsent`) ;
 *  4. la LISTE BORNÉE (`gate.allows`).
 *
 * Les quatre sont déjà tenus par des tests de COMPORTEMENT
 * (`discover-alert.service.spec.ts`). Cette garde-ci tient autre chose : que le
 * jour où quelqu'un réécrit l'émetteur, il ne puisse pas en retirer un verrou
 * en silence — un test de comportement supprimé avec le code qu'il testait ne
 * fait pas de bruit, une garde d'architecture si.
 *
 * Elle tient aussi GA-26 sur l'interrupteur : une variable d'environnement lue
 * à deux endroits est deux réglages, et le deuxième oublie de s'éteindre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ELLE NE PEUT PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit du TEXTE. « Le fichier mentionne le verrou » n'est pas « le verrou
 * est franchi sur CE chemin » ni « la branche est atteignable ». C'est
 * exactement pourquoi elle ne remplace pas les quatre témoins de comportement,
 * et pourquoi ce docblock le dit plutôt que de laisser croire le contraire.
 */

const EMITTER = join(__dirname, '..', 'modules', 'notifications', 'discover-alerts', 'discover-alert.service.ts')
const DISCOVER_ALERTS_DIR = join(__dirname, '..', 'modules', 'notifications', 'discover-alerts')
const API_SRC = join(__dirname, '..')

/** Ce qui, dans la source de l'émetteur, prouve qu'un verrou est consulté. */
const LOCKS: Readonly<Record<string, string>> = {
  'this.gate.enabled': 'l’interrupteur d’opérateur, avant toute lecture',
  'this.outbound.configuredFor(': 'la clé du canal — sans clé, aucune tentative',
  'isQualifiedOutboundConsent(': 'le consentement DATÉ',
  'this.gate.allows(': 'la liste bornée de la recette',
}

/** Le cœur de la garde, isolé pour qu'on puisse lui faire dire NON. */
export function missingLocks(source: string): string[] {
  return Object.entries(LOCKS)
    .filter(([marker]) => !source.includes(marker))
    .map(([marker, why]) => `${marker} — ${why}`)
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

describe('GA — l’envoi d’alerte Découvrir franchit ses quatre verrous', () => {
  const emitter = readFileSync(EMITTER, 'utf8')

  it('le corpus n’est pas vide — la garde LIT bien quelque chose', () => {
    expect(emitter.length).toBeGreaterThan(2000)
    expect(Object.keys(LOCKS)).toHaveLength(4)
  })

  it('l’émetteur consulte les quatre', () => {
    expect(missingLocks(emitter)).toEqual([])
  })

  it('elle sait dire NON — un émetteur amputé d’un verrou est NOMMÉ', () => {
    // On casse volontairement : l'interrupteur disparaît de la source.
    const amputated = emitter.replace('this.gate.enabled', 'true /* oups */')
    expect(amputated).not.toBe(emitter)
    expect(missingLocks(amputated)).toEqual(['this.gate.enabled — l’interrupteur d’opérateur, avant toute lecture'])
  })

  it('elle n’attrape pas ce qu’elle ne vise pas — un émetteur RÉÉCRIT mais complet passe', () => {
    // Témoin du cas légitime voisin : la garde protège la RÈGLE (les quatre
    // verrous), pas la forme exacte du fichier d'aujourd'hui.
    const rewritten = [
      'if (!this.gate.enabled) return',
      'const ok = this.outbound.configuredFor(channel)',
      'if (!isQualifiedOutboundConsent(row.alert_consent_at, now)) return',
      'if (!this.gate.allows(address)) return',
      '// et trois cents lignes de plus, dans un autre ordre de lecture',
    ].join('\n')
    expect(missingLocks(rewritten)).toEqual([])
  })

  it('l’interrupteur d’opérateur est lu à UN SEUL endroit (GA-26)', () => {
    const readers = sourceFiles(API_SRC)
      .filter(file => readFileSync(file, 'utf8').includes('DISCOVER_ALERT_DISPATCH_ENABLED'))
      .map(file => file.slice(API_SRC.length + 1))
    // Preuve de lecture : le balayage voit bien le seul lecteur attendu.
    expect(readers).toEqual(['modules/notifications/discover-alerts/discover-alert-gate.ts'])
  })

  it('aucun fichier du dossier n’envoie hors du PORT', () => {
    // Le port est le seul à connaître un transport : c'est lui qui porte
    // « sans clé = no-op strict ». Un envoi posé à côté le contournerait.
    const offenders = sourceFiles(DISCOVER_ALERTS_DIR)
      .filter(file => !file.endsWith('discover-alert-outbound.ts'))
      .filter(file => {
        const source = readFileSync(file, 'utf8')
        return source.includes('sendNotificationEmail(') || source.includes('sms.send(')
      })
      .map(file => file.slice(DISCOVER_ALERTS_DIR.length + 1))
    expect(offenders).toEqual([])
  })
})
