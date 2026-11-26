import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { STORAGE_DOMAINS, storedFileIsExpired, storedFileRetentionUntil } from '@bellum/contracts'

/**
 * #1939 — LA PURGE DES 30 JOURS EST ATTEINTE, PAR LE BALAYAGE QUI EXISTAIT DÉJÀ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE DE TEXTE (modèle : `retention-purge-reachability.spec.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Conservé 30 jours puis supprimé » est une phrase que l'écran affichera
 * (#1939.3). Elle n'est vraie que si TROIS pièces tiennent ensemble, et aucun
 * test unitaire ne les voit ensemble :
 *
 *  1. l'échéance d'un message vocal est posée à +30 JOURS au dépôt ;
 *  2. la requête de purge ne filtre sur AUCUN domaine — donc elle l'atteint ;
 *  3. le balayage quotidien APPELLE cette purge.
 *
 * Retirer l'appel du corps du cron laisserait tous les tests de `purgeExpired`
 * verts, et la voix conservée pour toujours. C'est le défaut n°1 du dépôt
 * (« du code juste que personne n'appelle »), et il ne se voit que sur
 * l'APPELANT. D'où cette garde, et d'où son quatrième point : **aucun nouveau
 * planificateur** — une heure de plus à surveiller n'aurait rien apporté.
 */
const API_SRC = join(__dirname, '..', '..')

/** Le code sans ses commentaires — sans casser une URL `https://`. */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

const scheduler = codeOf(join(__dirname, 'storage-retention.scheduler.ts'))
const service = codeOf(join(__dirname, 'storage.service.ts'))
const controller = codeOf(join(API_SRC, 'modules', 'ia-proxy', 'ia-proxy.controller.ts'))
const privacy = codeOf(join(API_SRC, 'modules', 'privacy', 'privacy-deletion.service.ts'))

describe('#1939 — la purge des messages vocaux est branchée, sans planificateur de plus', () => {
  it('lit un corpus NON VIDE — sinon la garde ne garde rien', () => {
    for (const source of [scheduler, service, controller, privacy]) expect(source.length).toBeGreaterThan(1000)
    expect(scheduler).toContain('export class StorageRetentionScheduler')
    expect(service).toContain('async purgeExpired(')
    expect(controller).toContain('export class IaProxyController')
    expect(privacy).toContain('async deleteAccount(')
  })

  it('1 — l’échéance d’un message vocal est posée à 30 JOURS, et expire le lendemain', () => {
    expect(STORAGE_DOMAINS).toContain('chat_voice_message')
    expect(storedFileRetentionUntil('chat_voice_message', '2026-09-12')).toBe('2026-10-12')
    expect(storedFileIsExpired('2026-10-12', '2026-10-12')).toBe(false)
    expect(storedFileIsExpired('2026-10-12', '2026-10-13')).toBe(true)
  })

  it('2 — la requête de purge ne filtre sur AUCUN domaine : elle atteint les messages vocaux', () => {
    const method = service.slice(
      service.indexOf('async purgeExpired('),
      service.indexOf('async eraseVoiceMessagesUploadedBy('),
    )
    expect(method.length).toBeGreaterThan(200)
    expect(method).toContain('retention_until < $1::date')
    expect(method).not.toContain('domain')
  })

  it('3 — le balayage quotidien APPELLE la purge, derrière l’interrupteur existant', () => {
    const body = scheduler.slice(scheduler.indexOf("@Cron('41 3 * * *')"))
    expect(body.length).toBeGreaterThan(100)
    expect(body).toContain('this.storage.purgeExpired(')
    expect(body).toContain('storageRetentionPurgeDisabled()')
    expect(scheduler.match(/@Cron\(/g)?.length ?? 0).toBe(1)
  })

  it('4 — aucun fichier qui parle du message vocal ne déclare un planificateur', () => {
    const voiceFiles = sourceFiles(API_SRC).filter(file => readFileSync(file, 'utf8').includes('chat_voice_message'))
    // Corpus : le contrôleur qui écrit, le service qui efface, la migration.
    expect(voiceFiles.length).toBeGreaterThanOrEqual(3)
    const withCron = voiceFiles.filter(file => codeOf(file).includes('@Cron('))
    expect(withCron).toEqual([])
  })

  it('4 bis — N’ATTRAPE PAS ce qu’elle ne vise pas : le planificateur existant ne parle d’aucun domaine', () => {
    // Le seul `@Cron` du stockage reste hors du corpus « message vocal » : s'il
    // se mettait à nommer un domaine, la purge cesserait d'être aveugle aux
    // domaines — et le point 2 le dirait.
    expect(scheduler).toContain('@Cron(')
    expect(scheduler).not.toContain('chat_voice_message')
  })

  it('5 — il y a quelque chose à purger : l’écrivain existe, et l’effacement de compte l’appelle', () => {
    const transcribe = controller.slice(
      controller.indexOf('async transcribeVoiceMessage('),
      controller.indexOf('async listenVoiceMessage('),
    )
    expect(transcribe.length).toBeGreaterThan(300)
    expect(transcribe).toContain("domain: 'chat_voice_message'")
    expect(transcribe).toContain('storage.put(')
    const deleteAccount = privacy.slice(
      privacy.indexOf('async deleteAccount('),
      privacy.indexOf('private anonymizedEmail('),
    )
    expect(deleteAccount.length).toBeGreaterThan(500)
    // Le port, branché par le module sur `StorageService.eraseVoiceMessagesUploadedBy`
    // (`voice-message-eraser.spec.ts`).
    expect(deleteAccount).toContain('this.eraseVoiceMessages(')
  })
})
