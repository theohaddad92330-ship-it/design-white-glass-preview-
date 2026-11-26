import { NotFoundException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_LAYERS, MEMORY_NEVER_STORED, memoryDeclaredCorrectionOf } from '@bellum/contracts'
import { IsNull } from 'typeorm'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { MemoryService } from './memory.service'

/**
 * LA RÈGLE DE TRANSPARENCE, ET SES CINQ INTERDITS.
 *
 * Tome 6 §12.1 : « l'utilisateur voit cette mémoire, en clair, dans un écran
 * dédié, et peut en supprimer n'importe quelle ligne. Une mémoire invisible est
 * une mémoire dangereuse. » §12.2 nomme ce qu'elle ne retient jamais.
 *
 * Ce fichier tient les DEUX moitiés. Il ne se contente pas de lire des
 * constantes : il fait tourner le service contre des dépôts factices et vérifie
 * la clause de portée réellement passée à la base — une garde qui lirait le
 * texte du fichier serait verte le jour où quelqu'un renommerait la colonne.
 */

const NOW = new Date('2026-08-29T12:00:00.000Z')

function factRow(over: Partial<MemoryPinnedFactEntity> = {}): MemoryPinnedFactEntity {
  return {
    id: 'f-1',
    user_id: 'u-1',
    workspace_id: 'ws-1',
    account_id: null,
    fact: 'Le DSI décide seul',
    kind: 'fact',
    origin: 'manual',
    expires_at: null,
    created_at: new Date('2026-08-20T09:00:00.000Z'),
    ...over,
  } as MemoryPinnedFactEntity
}

describe('MemoryService.readLedger — ce que Laura garde, en clair', () => {
  let service: MemoryService
  let facts: MockRepository<MemoryPinnedFactEntity>
  let prefs: MockRepository<UserPreferenceEntity>
  let summaries: MockRepository<ConversationSummaryEntity>
  let interventions: MockRepository<LauraInterventionEntity>
  let profiles: MockRepository<ProfileEntity>
  let esnProfile: { resolveProfileData: jest.Mock; resolveContext: jest.Mock }

  beforeEach(() => {
    facts = createMockRepository<MemoryPinnedFactEntity>()
    prefs = createMockRepository<UserPreferenceEntity>()
    summaries = createMockRepository<ConversationSummaryEntity>()
    interventions = createMockRepository<LauraInterventionEntity>()
    profiles = createMockRepository<ProfileEntity>()
    // Par défaut : aucun profil, donc AUCUNE ligne déclarée. Un profil vide ne
    // produit pas de ligne « — » ; il ne produit rien.
    esnProfile = {
      resolveProfileData: jest.fn().mockResolvedValue({}),
      resolveContext: jest.fn().mockResolvedValue({ canonicalRow: null, ownRow: null }),
    }
    service = new MemoryService(
      facts as never,
      prefs as never,
      summaries as never,
      interventions as never,
      profiles as never,
      esnProfile as never,
      // #1916.23 — le journal des gestes : le registre ne l'écrit pas.
      createMockRepository() as never,
    )
  })

  it('rend les six couches réellement lues par le copilote', async () => {
    profiles.findOne.mockResolvedValue({
      user_id: 'u-1',
      first_name: 'Louis',
      updated_at: new Date('2026-08-24T09:00:00.000Z'),
    } as ProfileEntity)
    esnProfile.resolveProfileData.mockResolvedValue({ sellerRole: 'Directeur commercial', companyName: 'BellumAI' })
    esnProfile.resolveContext.mockResolvedValue({
      canonicalRow: { updated_at: new Date('2026-08-25T09:00:00.000Z') },
      ownRow: { updated_at: new Date('2026-08-26T09:00:00.000Z') },
    })

    facts._qb.getMany.mockResolvedValueOnce([factRow()])
    prefs.findOne.mockResolvedValueOnce({
      id: 'p-1',
      user_id: 'u-1',
      preferences: { tone: 'direct' },
      updated_at: new Date('2026-08-21T09:00:00.000Z'),
    } as UserPreferenceEntity)
    summaries.find.mockResolvedValueOnce([
      {
        id: 's-1',
        user_id: 'u-1',
        workspace_id: 'ws-1',
        account_id: null,
        conversation_id: 'general',
        summary: '• Utilisateur : bonjour\n• BellumAI : bonjour',
        updated_at: new Date('2026-08-22T09:00:00.000Z'),
      } as ConversationSummaryEntity,
    ])
    interventions.find.mockResolvedValueOnce([
      {
        id: 'i-1',
        user_id: 'u-1',
        workspace_id: 'ws-1',
        intervention_key: 'esn_profile_incomplete',
        screen: '/dashboard',
        format: 'bubble',
        priority: 1,
        reaction: 'refused',
        reacted_at: new Date('2026-08-23T09:00:00.000Z'),
        created_at: new Date('2026-08-23T08:00:00.000Z'),
      } as LauraInterventionEntity,
    ])

    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(ledger.unreadableLayers).toEqual([])
    // Les six couches, dans l'ordre d'affichage. `identity` en rend DEUX (le
    // prénom, puis le rôle) : on compare les couches DISTINCTES dans leur
    // ordre d'apparition, pas la longueur de la liste.
    expect([...new Set(ledger.entries.map(entry => entry.layer))]).toEqual([...MEMORY_LAYERS])
    // « En clair » : c'est le TEXTE que Laura relit, pas une clé technique.
    expect(ledger.entries[0]?.text).toBe('Le DSI décide seul')
    expect(ledger.entries[1]?.text).toContain('direct')
    expect(ledger.entries[2]?.text).toContain('• Utilisateur : bonjour')
    // La trace résolue par le catalogue, pas la clé nue.
    expect(ledger.entries[3]?.text).not.toBe('esn_profile_incomplete')
    expect(ledger.entries[3]?.detail).toBe('refused')
    // Les deux couches DÉCLARÉES : la VALEUR en clair, la clé dans `detail`.
    expect(ledger.entries[4]).toMatchObject({ layer: 'identity', id: 'firstName', text: 'Louis' })
    expect(ledger.entries.find(entry => entry.id === 'sellerRole')).toMatchObject({
      layer: 'identity',
      text: 'Directeur commercial',
      // La surcouche personnelle gagne sur ces champs : c'est SA date.
      recordedAt: '2026-08-26T09:00:00.000Z',
    })
    expect(ledger.entries.find(entry => entry.id === 'companyName')).toMatchObject({
      layer: 'workspace',
      text: 'BellumAI',
      // Un champ de société vient de la ligne canonique : c'est SA date.
      recordedAt: '2026-08-25T09:00:00.000Z',
    })
  })

  it('#1962.17/.18 — une conclusion de Laura jamais confirmée porte le badge « note de Laura », pas sa nature par défaut', async () => {
    // Le défaut vérifié le 12/09/2026 : `SaveReply`/`pin_memory_fact` épinglent
    // avec `origin: 'copilot'` SANS `kind` — le serveur retombe donc sur
    // `kind: 'fact'` (le défaut historique, `memory.service.ts` ligne ~310),
    // et rien ne distinguait plus cet élément d'un fait tapé à la main.
    facts._qb.getMany.mockResolvedValueOnce([
      factRow({ id: 'f-copilot', fact: 'ALTEN ne serait plus chez eux', kind: 'fact', origin: 'copilot' }),
    ])
    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
    const entry = ledger.entries.find(e => e.id === 'f-copilot')
    expect(entry?.detail).toBe('copilotNote')
  })

  it('une correction reste étiquetée « correction », origine manuelle', async () => {
    facts._qb.getMany.mockResolvedValueOnce([
      factRow({ id: 'f-correction', fact: 'ALTEN a quitté le compte', kind: 'correction', origin: 'manual' }),
    ])
    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
    const entry = ledger.entries.find(e => e.id === 'f-correction')
    expect(entry?.detail).toBe('correction')
  })

  /**
   * Défaut trouvé le 13/09 : « Modifier dans Mon compte » servait tout le groupe
   * identité, alors que Mon compte n'édite que prénom, nom et e-mail. La garde
   * lit les VRAIES clés que le registre produit (tout le profil rempli) : une clé
   * d'identité ajoutée demain sans destination de correction la fait rougir.
   */
  it('chaque ligne d’identité que le registre produit a une destination de correction', async () => {
    profiles.findOne.mockResolvedValue({ user_id: 'u-1', first_name: 'Louis', updated_at: NOW } as ProfileEntity)
    esnProfile.resolveContext.mockResolvedValue({ canonicalRow: { updated_at: NOW }, ownRow: { updated_at: NOW } })
    // Toutes les clés que `AnalysisProfileData` peut porter, remplies : le registre
    // choisit lui-même celles qui sont de l'identité.
    esnProfile.resolveProfileData.mockResolvedValue(
      new Proxy({} as Record<string, string>, {
        get: (_target, key) => (typeof key === 'string' ? `valeur de ${key}` : undefined),
      }),
    )

    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
    const identity = ledger.entries.filter(entry => entry.layer === 'identity')

    // Le corpus : le prénom et au moins le rôle — la garde ne passe pas au vert sur une couche vide.
    expect(identity.map(entry => entry.id)).toEqual(expect.arrayContaining(['firstName', 'sellerRole', 'proactivity']))
    for (const entry of identity) {
      expect({ key: entry.id, correction: memoryDeclaredCorrectionOf(entry) }).toEqual({
        key: entry.id,
        correction: expect.objectContaining({ editedIn: expect.any(String) }),
      })
    }
  })

  it('ne fabrique AUCUNE ligne déclarée quand le profil ne porte rien', async () => {
    profiles.findOne.mockResolvedValue({ user_id: 'u-1', first_name: '  ', updated_at: NOW } as ProfileEntity)
    esnProfile.resolveProfileData.mockResolvedValue({ companyName: '   ', offers: [], sectors: [] })
    esnProfile.resolveContext.mockResolvedValue({ canonicalRow: { updated_at: NOW }, ownRow: null })

    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })

    // Ni « Offres : — », ni un prénom blanc : un champ non renseigné ne
    // voyage pas dans le prompt, il n'a donc pas de ligne dans le registre.
    expect(ledger.entries.filter(entry => entry.layer === 'identity')).toEqual([])
    expect(ledger.entries.filter(entry => entry.layer === 'workspace')).toEqual([])
    // Vide, pas illisible : les deux lectures ont réussi.
    expect(ledger.unreadableLayers).toEqual([])
  })

  it('NOMME une couche déclarée illisible plutôt que de la rendre vide', async () => {
    esnProfile.resolveProfileData.mockRejectedValue(new Error('profil injoignable'))

    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(ledger.unreadableLayers).toEqual(['identity', 'workspace'])
  })

  it('ne montre jamais une ligne que le copilote ne lit plus — un résumé vide n’en est pas une', async () => {
    summaries.find.mockResolvedValueOnce([
      {
        id: 's-1',
        user_id: 'u-1',
        workspace_id: 'ws-1',
        account_id: null,
        conversation_id: 'general',
        summary: '   ',
        updated_at: NOW,
      } as ConversationSummaryEntity,
    ])
    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ledger.entries.filter(entry => entry.layer === 'conversations')).toEqual([])
    // Vide, pas illisible : la lecture a réussi et n'a rien trouvé.
    expect(ledger.unreadableLayers).toEqual([])
  })

  it('NOMME une couche illisible au lieu de la rendre vide — « non mesuré » n’est jamais « 0 »', async () => {
    summaries.find.mockRejectedValueOnce(new Error('db down'))
    const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ledger.unreadableLayers).toEqual(['conversations'])
    // Les autres couches restent lisibles : une panne ne fait pas taire tout l'écran.
    expect(ledger.unreadableLayers).not.toContain('facts')
  })

  describe('les cinq interdits du §12.2', () => {
    it('interdit n°2 — les données d’un AUTRE ESPACE : chaque lecture porte sa portée', async () => {
      await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })

      // Les faits : la portée passe par le query builder, comme la lecture du copilote.
      const scoped = facts._qb.where.mock.calls.some(
        call => String(call[0]).includes('workspace_id') && (call[1] as { ws?: string })?.ws === 'ws-1',
      )
      expect(scoped).toBe(true)
      // Les résumés : portée PERSONNELLE, et non d'espace.
      //
      // ⚠️ Cette assertion attendait `{ workspace_id }` seul — elle décrivait
      // fidèlement le code, qui laissait un membre lire les extraits de ses
      // collègues. Un test qui recopie le code ne le contrôle pas.
      // `superseded_at` écarte en plus les lignes archivées par la migration
      // qui a refermé la fuite : elles ne nourrissent plus le modèle, elles
      // n'ont rien à faire dans ce que l'écran nomme « ta mémoire ».
      expect(summaries.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: 'u-1', workspace_id: 'ws-1' }),
        }),
      )
      const [portee] = summaries.find.mock.calls.at(-1) as [{ where: Record<string, unknown> }]
      expect(portee.where).toHaveProperty('superseded_at')
    })

    it('interdit n°3 — les données d’un COLLÈGUE hors périmètre : préférences et traces sont personnelles', async () => {
      await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
      expect(prefs.findOne).toHaveBeenCalledWith({ where: { user_id: 'u-1' } })
      expect(interventions.find).toHaveBeenCalledWith(
        // #2439.10 — et les traces OUBLIÉES sont hors du registre (`archived_at`).
        expect.objectContaining({ where: { user_id: 'u-1', archived_at: IsNull() } }),
      )
    })

    it('interdit n°4 — une information SUPPRIMÉE : la ligne disparaît du registre ET du contexte', async () => {
      prefs.findOne.mockResolvedValue({
        id: 'p-1',
        user_id: 'u-1',
        preferences: { tone: 'direct', sectors: ['banque'] },
        updated_at: NOW,
      } as UserPreferenceEntity)

      await service.forgetLedgerEntry({ userId: 'u-1', workspaceId: 'ws-1', layer: 'preferences', id: 'tone' })

      // Ce qui est écrit en base ne contient plus la clé — pas un `null`, pas un
      // marqueur : la clé n'est plus là.
      const saved = prefs.save.mock.calls.at(-1)?.[0] as { preferences: Record<string, unknown> }
      expect(saved.preferences).toEqual({ sectors: ['banque'] })
      expect('tone' in saved.preferences).toBe(false)
    })

    it('interdit n°4 (suite) — supprimer une ligne d’un AUTRE espace est un 404, pas un succès', async () => {
      facts._qb.execute.mockResolvedValueOnce({ affected: 0, raw: [] })
      await expect(
        service.forgetLedgerEntry({ userId: 'u-1', workspaceId: 'ws-1', layer: 'facts', id: 'f-9' }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(facts._qb.where).toHaveBeenCalledWith('id = :id', { id: 'f-9' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('workspace_id = :ws', { ws: 'ws-1' })
    })

    it('interdit n°3 (#1918.1) — l’élément « moi » d’un collègue : ni lu, ni oubliable depuis ce registre', async () => {
      // Lecture : la portée de l'APPELANT borne la couche des faits.
      await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith(
        "(f.scope = 'workspace' OR (f.scope = 'user' AND f.user_id = :viewer))",
        {
          viewer: 'u-1',
        },
      )
      // Suppression (#1918.7) : un membre simple ne retire que ce qu'il a épinglé ;
      // une manager, ce qu'elle peut voir (sans alias : une suppression n'en porte pas).
      await service.forgetLedgerEntry({ userId: 'u-1', workspaceId: 'ws-1', layer: 'facts', id: 'f-9', role: 'member' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('user_id = :viewer', { viewer: 'u-1' })
      await service.forgetLedgerEntry({ userId: 'u-1', workspaceId: 'ws-1', layer: 'facts', id: 'f-9', role: 'owner' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith(
        "(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer))",
        { viewer: 'u-1' },
      )
    })

    it('#1916.3 — chaque fait du registre dit POUR QUI il vaut, et si l’appelant en est le propriétaire', async () => {
      facts._qb.getMany.mockResolvedValueOnce([
        factRow({ id: 'f-mine', user_id: 'u-1', scope: 'user', fact: 'Mon objectif' }),
        factRow({ id: 'f-shared', user_id: 'u-2', scope: 'workspace', fact: 'Règle de l’ESN' }),
      ])
      const ledger = await service.readLedger({ userId: 'u-1', workspaceId: 'ws-1' })
      const facts2 = ledger.entries.filter(entry => entry.layer === 'facts')
      expect(facts2.find(entry => entry.id === 'f-mine')).toMatchObject({ scope: 'user', ownedByMe: true })
      expect(facts2.find(entry => entry.id === 'f-shared')).toMatchObject({ scope: 'workspace', ownedByMe: false })
    })

    // #2439.10 (21/09/2026) — ARCHIVE un résumé de conversation, il ne le
    // supprime plus. La portée reste la même, à la lettre.
    it('archive un résumé de conversation par sa clé, et pour SA personne', async () => {
      await service.forgetLedgerEntry({
        userId: 'u-1',
        workspaceId: 'ws-1',
        layer: 'conversations',
        id: 'account:a-1',
      })
      // Sans `user_id`, cette écriture porterait sur la ligne de CHAQUE membre
      // pour cette clé : oublier son propre fil emportait celui des autres. La
      // portée s'écrit en entier, et `archived_at IS NULL` fait du second oubli
      // un 404 plutôt qu'un succès qui n'a rien changé.
      expect(summaries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u-1',
          workspace_id: 'ws-1',
          conversation_id: 'account:a-1',
          archived_at: IsNull(),
        }),
        { archived_at: expect.any(Date) },
      )
      expect(summaries.delete).not.toHaveBeenCalled()
    })

    it('archive une trace d’intervention par son id, pour SA personne', async () => {
      await service.forgetLedgerEntry({ userId: 'u-1', workspaceId: 'ws-1', layer: 'refusals', id: 'i-1' })
      expect(interventions.update).toHaveBeenCalledWith(
        { id: 'i-1', user_id: 'u-1', archived_at: IsNull() },
        { archived_at: expect.any(Date) },
      )
      expect(interventions.delete).not.toHaveBeenCalled()
    })

    it('refuse une couche inconnue plutôt que de deviner où supprimer', async () => {
      await expect(
        service.forgetLedgerEntry({
          userId: 'u-1',
          workspaceId: 'ws-1',
          layer: 'mailbox' as never,
          id: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  /**
   * INTERDIT N°1 — LE CONTENU DES MESSAGES.
   *
   * ⚠️ La nuance qui décide de tout, et qu'il ne faut pas « corriger » : le
   * corps d'un e-mail EST stocké dans le journal d'activité (arbitrage du
   * 16/08, raison écrite dans `packages/contracts/src/schemas/activity.ts`) et
   * n'est JAMAIS exposé — ni à un humain, ni au modèle. STOCKER et EXPOSER sont
   * deux décisions distinctes. Ce que la mémoire de Laura ne doit pas faire,
   * c'est ALLER LE CHERCHER : le registre est un chemin d'exposition vers un
   * humain, et il ne doit toucher que ses quatre dépôts.
   *
   * Le résumé de conversation, lui, est la couche 6 du même §12 — « l'échange en
   * cours + résumé roulant des précédents » — explicitement autorisée.
   */
  describe('interdit n°1 — le CORPS des messages n’entre pas dans la mémoire', () => {
    /** Le corpus, et le TÉMOIN qui prouve qu'on a bien lu chaque fichier. */
    const SOURCES: Record<string, string> = {
      'memory.service.ts': 'MemoryPinnedFactEntity',
      'memory.controller.ts': "@Controller('memory')",
    }

    function read(file: string): string {
      return readFileSync(join(__dirname, file), 'utf8')
    }

    it('lit vraiment un corpus — sans ce contrôle, la garde serait verte sur un fichier vide', () => {
      expect(Object.keys(SOURCES).length).toBeGreaterThan(0)
      for (const [file, witness] of Object.entries(SOURCES)) {
        const source = read(file)
        expect(source.length).toBeGreaterThan(500)
        // Témoin POSITIF : la garde voit bien le code qu'elle prétend surveiller.
        expect(source).toContain(witness)
      }
    })

    it('n’atteint aucune table ni aucun champ de corps de message', () => {
      // Ce que la mémoire n'a pas le droit de LIRE. `activities` porte le corps
      // des e-mails ; `chat_messages` porte le fil brut, dont seul le résumé
      // roulant a le droit d'exister en mémoire.
      const FORBIDDEN = [
        'ActivityEntity',
        'MailboxMessage',
        'activities',
        'chat_messages',
        'ChatMessageEntity',
        'body_text',
        'message_body',
      ]
      const offences: string[] = []
      for (const file of Object.keys(SOURCES)) {
        const source = read(file)
        for (const needle of FORBIDDEN) {
          // Les commentaires de ce dépôt CITENT les tables interdites pour
          // expliquer la règle : on ne lit que le code.
          const code = source
            .split('\n')
            .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
            .join('\n')
          if (code.includes(needle)) offences.push(`${file} → ${needle}`)
        }
      }
      expect(offences).toEqual([])
    })

    it('n’injecte QUE les dépôts de la mémoire et celui du prénom', () => {
      const injected = [...read('memory.service.ts').matchAll(/@InjectRepository\((\w+)\)/g)].map(match => match[1])
      // `ProfileEntity` est arrivé le 01/09 avec la couche `identity` : le
      // PRÉNOM part dans le prompt à chaque tour, et le registre doit le
      // montrer. Il est lu, jamais écrit — la ligne se corrige dans Réglages ›
      // Mon compte, et « tout oublier » n'y touche pas (voir
      // `memory-forget-all.spec.ts`). Aucune table de MESSAGE n'entre ici :
      // c'est ce que l'interdit n°1 garde, juste au-dessus.
      // `MemoryFactEventEntity` est arrivé le 13/09 avec l'historique d'un
      // élément (#1916.23) : le journal des gestes sur un élément ÉPINGLÉ (texte
      // réécrit, portée, échéance) — la mémoire elle-même, pas un message, et il
      // part avec l'élément qu'il raconte (`ON DELETE CASCADE`).
      expect(injected.sort()).toEqual([
        'ConversationSummaryEntity',
        'LauraInterventionEntity',
        'MemoryFactEventEntity',
        'MemoryPinnedFactEntity',
        'ProfileEntity',
        'UserPreferenceEntity',
      ])
    })
  })

  /**
   * INTERDIT N°5 — un secret partagé par erreur. Le tome demande deux choses :
   * « elle prévient » (un détecteur de secret, qui N'EXISTE PAS dans ce dépôt et
   * qu'on n'invente pas ici) et « n'y revient pas » — la moitié mécanique, qui
   * est le retrait. On ne garde que ce qui est vrai.
   */
  it('interdit n°5 (moitié mécanique) — retirer une ligne la retire du registre ET de la lecture du copilote', async () => {
    // La lecture du registre et celle du copilote passent par la MÊME requête :
    // il n'y a pas deux chemins qui pourraient diverger.
    const source = readFileSync(join(__dirname, 'memory.service.ts'), 'utf8')
    expect(source).toContain('this.listFacts(')
    expect(MEMORY_NEVER_STORED).toContain('accidentalSecret')
  })
})
