import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2058.12 — « Ne jamais déduire le consentement à une notification externe
 * d'un niveau de proactivité élevé. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `proactivity_level` (réponse du profil progressif — « à quel point veux-tu
 * que {{copilot}} soit proactif ? ») et le consentement au canal SMS (le seul
 * canal de notification EXTERNE au produit, `sms-channel.service.ts`) sont
 * DEUX choses différentes : l'un dit combien {{copilot}} propose, l'autre dit
 * si un message peut sortir vers un téléphone. Mesuré le 18/09/2026:
 * `proactivity_level` n'apparaît nulle part dans le chemin de dispatch SMS
 * (`git grep` vide) — le canal SMS exige déjà, indépendamment, un numéro
 * VÉRIFIÉ et un opt-in EXPLICITE par type d'alerte (`sms-channel.service.ts`,
 * décision Louis 13/09 batch 13). Cette garde fige ce découplage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN DÉTECTEUR DE SOURCE, ET SA PREUVE QU'IL MORD
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun service réel ne combine aujourd'hui les deux notions — une garde qui
 * construirait un service n'aurait rien à observer. Celle-ci lit donc le
 * texte source des fichiers qui décident du canal SMS, et refuse toute ligne
 * qui les combine. Elle prouve qu'elle sait mordre sur un extrait FABRIQUÉ.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

const SMS_DECISION_FILES = [
  'apps/api/src/modules/notifications/sms/sms-channel.service.ts',
  'apps/api/src/modules/notifications/sms/sms-sender.ts',
  'apps/api/src/modules/notifications/notifications.service.ts',
]

/** Vrai si UNE ligne du fichier cite `proactivity_level` — la seule chose que
 *  #2058.12 refuse dans ces fichiers-là. */
function impliesConsentFromProactivity(source: string): boolean {
  return source.split('\n').some(line => line.includes('proactivity_level'))
}

describe('#2058.12 — le consentement SMS ne se déduit jamais de proactivity_level', () => {
  it.each(SMS_DECISION_FILES)('%s (VRAI fichier) ne lit jamais `proactivity_level`', relativePath => {
    const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8')
    expect(impliesConsentFromProactivity(source)).toBe(false)
  })

  it('sait dire NON : une ligne qui cite `proactivity_level` fait rougir le détecteur', () => {
    const violation = `if (answers.proactivity_level === 'Me suggérer des actions') consent = true`
    expect(impliesConsentFromProactivity(violation)).toBe(true)
  })

  it("n'attrape pas ce qu'elle ne vise pas : une autre réponse de profil reste verte", () => {
    const autreChamp = `if (answers.shared_data_scope) consent = true`
    expect(impliesConsentFromProactivity(autreChamp)).toBe(false)
  })
})
