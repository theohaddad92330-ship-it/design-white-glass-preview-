import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4016 L12 — LE COPILOTE N'ENVOIE RIEN SEUL, HORS MANDAT (Louis 11/10).
 *
 * Les SMS d'alerte (urgent, Découvrir) partent d'un geste que la PERSONNE a posé :
 * son numéro vérifié, son consentement daté, son périmètre enregistré. Laura
 * (copilote) et les modules qui la servent n'ont AUCUN chemin d'envoi : ils
 * préparent, le commercial décide. Cette garde lit la source de ces modules et
 * refuse tout import du port SMS ou du port d'alertes sortantes.
 *
 * ⚠️ Elle lit du TEXTE : un envoi passé par un tiers module injecté lui échappe.
 * Elle tient la porte d'entrée, pas la maison.
 */

const MODULES = join(__dirname, '..', 'modules')
const COPILOT_MODULES = ['laura', 'copilot-bridge', 'action-router', 'action-os', 'laura-unrouted-intents']
/** Les portes d'envoi sortant d'un SMS. */
const SEND_DOORS = ['sms-sender', 'SMS_SENDER', 'SmsSender', 'discover-alert-outbound', 'DISCOVER_ALERT_OUTBOUND']

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** Le cœur de la garde, isolé pour qu'on puisse lui faire dire NON. */
export function smsDoorsUsedBy(source: string): string[] {
  return SEND_DOORS.filter(door => source.includes(door))
}

describe('#4016 L12 — le copilote n’a aucun chemin d’envoi de SMS', () => {
  const files = COPILOT_MODULES.flatMap(name => sourceFiles(join(MODULES, name)))

  it('LIT vraiment du code — pas un dossier vide qui rendrait la garde verte à tort', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('aucun fichier des modules du copilote ne touche à une porte d’envoi SMS', () => {
    const offenders = files
      .filter(file => smsDoorsUsedBy(readFileSync(file, 'utf8')).length > 0)
      .map(file => file.slice(MODULES.length + 1))
    expect(offenders).toEqual([])
  })

  it('sait dire NON — un import du port SMS est nommé', () => {
    expect(smsDoorsUsedBy(`import { SMS_SENDER } from '../notifications/sms/sms-sender'`)).toEqual([
      'sms-sender',
      'SMS_SENDER',
    ])
  })

  it('n’attrape pas ce qu’elle ne vise pas — la lecture d’un réglage de notifications passe', () => {
    expect(smsDoorsUsedBy(`const prefs = await this.notifications.getPreferences(userId)`)).toEqual([])
  })
})
