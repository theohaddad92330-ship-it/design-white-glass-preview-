import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ChatImageVisionArchiveScheduler, chatImageVisionArchiveDisabled } from './chat-image-vision-archive.scheduler'

/**
 * #2876 (décision Louis 14/10) — le balayage nocturne qui ARCHIVE (jamais ne
 * supprime) les zones vision d'une image de chat expirée.
 */
function make(archiveExpiredImageVision: jest.Mock) {
  const scheduler = new ChatImageVisionArchiveScheduler({ archiveExpiredImageVision } as never)
  const logs: string[] = []
  jest.spyOn(scheduler['logger'], 'log').mockImplementation(message => {
    logs.push(String(message))
  })
  return { scheduler, logs }
}

describe('le balayage nocturne d’archivage des zones vision (#2876)', () => {
  afterEach(() => {
    delete process.env['CHAT_IMAGE_VISION_ARCHIVE_DISABLED']
    jest.restoreAllMocks()
  })

  it('n’appelle rien quand l’interrupteur est posé, et le dit', async () => {
    process.env['CHAT_IMAGE_VISION_ARCHIVE_DISABLED'] = 'true'
    const archive = jest.fn()
    const { scheduler, logs } = make(archive)

    await scheduler.sweep()

    expect(chatImageVisionArchiveDisabled()).toBe(true)
    expect(archive).not.toHaveBeenCalled()
    expect(logs.join(' ')).toContain('coupée')
  })

  it('archive la fenêtre du jour, par lot borné', async () => {
    const archive = jest.fn().mockResolvedValue({ archived: 3 })
    const { scheduler, logs } = make(archive)

    await scheduler.sweep()

    expect(archive).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 500)
    expect(logs.join(' ')).toContain('3 message(s)')
  })

  it('écrit même à zéro — un silence ne se lit pas comme une panne', async () => {
    const { scheduler, logs } = make(jest.fn().mockResolvedValue({ archived: 0 }))
    await scheduler.sweep()
    expect(logs.join(' ')).toContain('0 message(s)')
  })
})

/**
 * Atteignabilité : les tests ci-dessus appellent la méthode DIRECTEMENT, et
 * resteraient verts si personne ne l'appelait jamais — le défaut n°1 de ce dépôt.
 */
describe('le balayage est RÉELLEMENT monté (#2876)', () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  const scheduler = strip(readFileSync(join(__dirname, 'chat-image-vision-archive.scheduler.ts'), 'utf8'))
  const iaProxyModule = strip(readFileSync(join(__dirname, 'ia-proxy.module.ts'), 'utf8'))
  const appModule = strip(readFileSync(join(__dirname, '..', '..', 'app.module.ts'), 'utf8'))

  it('lit trois fichiers non vides', () => {
    expect(scheduler).toContain('export class ChatImageVisionArchiveScheduler')
    expect(iaProxyModule).toContain('@Module(')
    expect(appModule).toContain('@Module(')
  })

  it('un @Cron nocturne porte la méthode qui appelle l’archivage', () => {
    const cronAt = scheduler.indexOf('@Cron(')
    expect(cronAt).toBeGreaterThan(-1)
    expect(scheduler.match(/@Cron\(/g)?.length ?? 0).toBe(1)
    const afterCron = scheduler.slice(cronAt)
    const sweepAt = afterCron.indexOf('async sweep(')
    expect(sweepAt).toBeGreaterThan(-1)
    expect(afterCron.slice(0, sweepAt)).not.toContain('async ')
    expect(afterCron.slice(sweepAt)).toContain('this.messages.archiveExpiredImageVision(')
  })

  it('le planificateur est fourni par IaProxyModule, lui-même monté par AppModule', () => {
    const providers = iaProxyModule.slice(
      iaProxyModule.indexOf('providers:'),
      iaProxyModule.indexOf(']', iaProxyModule.indexOf('providers:')),
    )
    expect(providers).toContain('ChatImageVisionArchiveScheduler')
    expect(appModule).toMatch(/\bIaProxyModule,/)
  })
})
