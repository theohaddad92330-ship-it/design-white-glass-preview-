import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ChatMessagesService } from '../modules/ia-proxy/chat-messages.service'
import { askedForPrecision } from '../modules/ia-proxy/chat-quota'
import type { ChatMessageEntity } from '../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../database/test-utils'

/**
 * GA-90 — le plafond du copilote n'exonère QUE ce que Laura a marqué elle-même,
 * et **un message ordinaire compte toujours**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis du 30/08/2026 : le plafond quotidien borne les DEMANDES, pas
 * les allers-retours que Laura provoque elle-même. Répondre à une question de
 * précision ne consomme donc rien.
 *
 * Le risque de cette règle n'est PAS de compter un message de trop : c'est
 * l'exonération qui déborde. Une porte ouverte trop grand ne fait pas
 * apparaître un bug, elle fait disparaître le plafond — et personne ne
 * s'aperçoit d'un plafond qui ne refuse plus rien.
 *
 * D'où les quatre choses tenues ici :
 *
 *  1. **la table de vérité** : sur les huit situations possibles, une seule
 *     exonère. Les sept autres comptent, y compris les deux qui ressemblent le
 *     plus à un saut (une question à laquelle un saut a déjà répondu, et un
 *     message de Laura elle-même) ;
 *  2. **le marquage vient de la SOURCE** — `context.clarification`, que le
 *     service IA ne pose que lorsque le modèle a appelé `ask_clarification`.
 *     Jamais du TEXTE : `askedForPrecision` ne lit pas `reply`, et la décision
 *     d'écriture ne lit pas `content` ;
 *  3. **un seul écrivain** de `quota_exempt_at` dans tout `apps/api/src` ;
 *  4. **le client ne peut pas se déclarer exonéré** : aucun DTO du proxy IA
 *     n'accepte le champ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VOIE QUI A ÉTÉ MESURÉE PUIS REFUSÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le message précédent de Laura contenait un point d'interrogation. » Mesuré
 * sur les phrases que Laura prononce réellement dans le dépôt
 * (`apps/web/src/i18n/locales/fr/laura.json`) : cinq d'entre elles se terminent
 * par une question, et **aucune n'est une question de précision** — « Tu veux
 * analyser quelques comptes ? », « On les passe en revue une par une ? ». Un
 * détecteur de point d'interrogation aurait rendu gratuite la réponse à
 * chacune. C'est pour cela que ce fichier interdit de lire le texte, plutôt que
 * de se contenter de ne pas le faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE QU'ELLE SAIT DIRE NON (rouge exact, 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * En remplaçant, dans `resolvePrecisionHop`, `if (!previous?.precision_request_at) return null`
 * par `if (!previous) return null` — c'est-à-dire en exonérant tout message qui
 * en suit un autre :
 *
 *   ● GA-90 › un message ORDINAIRE compte toujours › rien de marqué, rien
 *     d'exonéré
 *     expect(received).toBeNull()  Received: 2026-08-30T08:34:38.090Z
 *
 * Et en faisant lire `data.reply` à `askedForPrecision` au lieu de
 * `data.context.clarification` — DEUX tests tombent, le comportemental et le
 * structurel :
 *
 *   ● GA-90 › le marquage vient de la SOURCE › reconnaît la carte de
 *     clarification posée par le service IA
 *     expect(received).toBe(expected)  Expected: true  Received: false
 *   ● GA-90 › le marquage vient de la SOURCE › ne lit JAMAIS le texte de la
 *     réponse — `reply` n'apparaît pas dans le lecteur du marquage
 *     expect(received).toContain(expected)
 */
describe('GA-90 — le plafond n’exonère que ce que Laura a marqué', () => {
  const IA_PROXY = join(__dirname, '..', 'modules', 'ia-proxy')

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  function read(file: string): string {
    return stripComments(readFileSync(join(IA_PROXY, file), 'utf8'))
  }

  // ── 1. La table de vérité ──────────────────────────────────────────────────

  type Situation = {
    name: string
    role: 'user' | 'assistant'
    /** Le message précédent de cette personne dans ce fil, ou `null`. */
    previous: { precision_request_at: Date | null } | null
    /** Combien de sauts ont déjà été accordés dans ce fil sur la fenêtre. */
    hopsAlready: number
    exempt: boolean
  }

  const MARKED = { precision_request_at: new Date('2026-08-30T08:00:00Z') }
  const PLAIN = { precision_request_at: null }

  const SITUATIONS: readonly Situation[] = [
    // LE SEUL CAS EXONÉRÉ.
    { name: 'Laura a demandé, la personne répond', role: 'user', previous: MARKED, hopsAlready: 0, exempt: true },
    // Les sept qui comptent.
    { name: 'rien de marqué, rien d’exonéré', role: 'user', previous: PLAIN, hopsAlready: 0, exempt: false },
    { name: 'premier message d’un fil', role: 'user', previous: null, hopsAlready: 0, exempt: false },
    { name: 'un saut a DÉJÀ été accordé dans ce fil', role: 'user', previous: MARKED, hopsAlready: 1, exempt: false },
    { name: 'le fil tourne en rond (trois sauts déjà)', role: 'user', previous: MARKED, hopsAlready: 3, exempt: false },
    { name: 'la réponse de Laura elle-même', role: 'assistant', previous: MARKED, hopsAlready: 0, exempt: false },
    { name: 'Laura répond sans rien avoir marqué', role: 'assistant', previous: PLAIN, hopsAlready: 0, exempt: false },
    { name: 'Laura ouvre le fil', role: 'assistant', previous: null, hopsAlready: 0, exempt: false },
  ]

  it('LIT un corpus non vide : huit situations, dont une seule exonère', () => {
    expect(SITUATIONS).toHaveLength(8)
    expect(SITUATIONS.filter(s => s.exempt)).toHaveLength(1)
  })

  describe('un message ORDINAIRE compte toujours', () => {
    let repo: MockRepository<ChatMessageEntity>
    let service: ChatMessagesService

    function created(): Partial<ChatMessageEntity> {
      return repo.create.mock.calls[0][0] as Partial<ChatMessageEntity>
    }

    beforeEach(() => {
      repo = createMockRepository<ChatMessageEntity>()
      service = new ChatMessagesService(repo as never)
      repo.save.mockImplementation(async (row: Partial<ChatMessageEntity>) => ({
        id: 'm',
        created_at: new Date(),
        ...row,
      }))
    })

    it.each(SITUATIONS.map(s => [s.name, s] as const))('%s', async (_name, situation) => {
      repo.findOne.mockResolvedValueOnce(situation.previous as ChatMessageEntity | null)
      repo.count.mockResolvedValueOnce(situation.hopsAlready)

      await service.create({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: 'a-1',
        conversationId: null,
        role: situation.role,
        content: 'peu importe — le contenu n’entre jamais dans la décision',
      })

      if (situation.exempt) expect(created().quota_exempt_at).toBeInstanceOf(Date)
      else expect(created().quota_exempt_at).toBeNull()
    })
  })

  // ── 2. Le marquage vient de la SOURCE, jamais du texte ─────────────────────

  describe('le marquage vient de la SOURCE', () => {
    it('reconnaît la carte de clarification posée par le service IA', () => {
      expect(
        askedForPrecision({ success: true, data: { context: { clarification: { question: 'Quel territoire ?' } } } }),
      ).toBe(true)
    })

    it.each([
      ['une réponse qui finit par une proposition', { success: true, data: { reply: 'Tu veux que je le prépare ?' } }],
      ['un contexte sans clarification', { success: true, data: { context: { sources: [] } } }],
      ['une clarification sans question', { success: true, data: { context: { clarification: { options: ['A'] } } } }],
      ['une clarification vide', { success: true, data: { context: { clarification: { question: '  ' } } } }],
      ['un tour en échec', { success: false, data: { context: { clarification: { question: 'Quoi ?' } } } }],
      ['pas d’enveloppe', null],
    ])('%s ne marque rien', (_name, envelope) => {
      expect(askedForPrecision(envelope as never)).toBe(false)
    })

    it('ne lit JAMAIS le texte de la réponse — `reply` n’apparaît pas dans le lecteur du marquage', () => {
      const source = read('chat-quota.ts')
      expect(source.length).toBeGreaterThan(200)
      expect(source).toContain('askedForPrecision')
      expect(source).toContain("['clarification']")
      expect(source).not.toContain("['reply']")
    })

    it('la décision d’écriture ne lit pas le CONTENU du message', () => {
      const source = read('chat-messages.service.ts')
      const start = source.indexOf('private async resolvePrecisionHop')
      expect(start).toBeGreaterThan(-1)
      const body = source.slice(start, source.indexOf('private latestUserMessage', start))
      expect(body.length).toBeGreaterThan(200)
      expect(body).not.toMatch(/\bcontent\b/)
      // Aucune inspection de chaîne : pas de `includes`, pas de `match`, pas de
      // `test` sur une expression régulière. Chercher une tournure de phrase
      // est exactement la voie refusée.
      expect(body).not.toMatch(/\.(includes|match|search|startsWith|endsWith)\(/)
      expect(body).not.toMatch(/RegExp|\/[^/\n]+\/[gimsuy]*\.test\(/)
    })
  })

  // ── 3. Un seul écrivain, et le client n'en est pas un ──────────────────────

  describe('un seul écrivain de l’exonération', () => {
    function tsFiles(dir: string): string[] {
      const out: string[] = []
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          out.push(...tsFiles(full))
          continue
        }
        if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
      }
      return out
    }

    /** Ce qui DÉCLARE la colonne — l'entité et sa migration — n'est pas un écrivain. */
    const DECLARERS = ['chat-message.entity.ts', 'ChatQuotaPrecisionHop']

    it('une seule source d’`apps/api/src` écrit `quota_exempt_at`', () => {
      const files = tsFiles(join(__dirname, '..'))
      expect(files.length).toBeGreaterThan(300)
      const writers = files.filter(file => {
        if (DECLARERS.some(name => file.includes(name))) return false
        return /quota_exempt_at\s*[:=]/.test(stripComments(readFileSync(file, 'utf8')))
      })
      expect(writers.map(f => f.split('/').pop())).toEqual(['chat-messages.service.ts'])
    })

    it('aucun DTO du proxy IA n’accepte une exonération déclarée par le client', () => {
      const dto = stripComments(readFileSync(join(IA_PROXY, 'dto', 'ia-proxy.dto.ts'), 'utf8'))
      expect(dto.length).toBeGreaterThan(1000)
      expect(dto).toContain('CreateChatMessageDto')
      expect(dto).not.toMatch(/quotaExempt|quota_exempt|precisionRequest|precision_request/)
    })
  })
})
