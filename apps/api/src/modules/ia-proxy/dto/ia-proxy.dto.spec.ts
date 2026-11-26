import {
  battlecardSchema,
  chatSchema,
  chatThreadTargetSchema,
  compareSchema,
  createChatMessageSchema,
  generateMessageSchema,
  listChatMessagesSchema,
  ragIngestSchema,
  renameChatThreadSchema,
} from './ia-proxy.dto'

describe('chatSchema — #2453 le mode de contexte', () => {
  it('accepte les trois modes du contrat, absent = corps d’avant', () => {
    for (const contextMode of ['my_activity', 'one_off_mission', 'neutral']) {
      expect(chatSchema.safeParse({ message: 'hi', contextMode }).success).toBe(true)
    }
    const r = chatSchema.safeParse({ message: 'hi' })
    expect(r.success && r.data.contextMode).toBeUndefined()
  })

  it('refuse un mode inconnu plutôt que de le deviner', () => {
    expect(chatSchema.safeParse({ message: 'hi', contextMode: 'neutre' }).success).toBe(false)
  })
})

describe('chatSchema — #2450.1 (reste partiel, épopée #2882) le mode de recherche', () => {
  it('accepte les quatre modes du contrat, absent = corps d’avant', () => {
    for (const mode of ['auto', 'rapide', 'verifie', 'approfondi']) {
      expect(chatSchema.safeParse({ message: 'hi', mode }).success).toBe(true)
    }
    const r = chatSchema.safeParse({ message: 'hi' })
    expect(r.success && r.data.mode).toBeUndefined()
  })

  it('refuse un mode inconnu plutôt que de le deviner', () => {
    expect(chatSchema.safeParse({ message: 'hi', mode: 'rapides' }).success).toBe(false)
  })
})

describe('chatSchema — #1951.2 / #1951.3 / #1910.6 la portée « un consultant » / « un besoin » / « une mission »', () => {
  const id = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'

  it('absente, le corps est celui d’avant ce lot', () => {
    const r = chatSchema.safeParse({ message: 'hi' })
    expect(r.success && r.data.scopeObject).toBeUndefined()
  })

  it('accepte un consultant, un besoin, une mission et une personne désignés par leur identifiant', () => {
    expect(chatSchema.safeParse({ message: 'hi', scopeObject: { kind: 'consultant', id } }).success).toBe(true)
    expect(chatSchema.safeParse({ message: 'hi', scopeObject: { kind: 'need', id } }).success).toBe(true)
    // #1910.6 — la mission est livrée : le serveur sait relire sa fiche.
    expect(chatSchema.safeParse({ message: 'hi', scopeObject: { kind: 'mission', id } }).success).toBe(true)
    // #1951.1 — la personne l'est à son tour (`ContactsService.findOne`).
    expect(chatSchema.safeParse({ message: 'hi', scopeObject: { kind: 'contact', id } }).success).toBe(true)
  })

  it('sait dire NON — une nature non livrée ou un identifiant libre est refusé', () => {
    // #1951.7 — « un territoire » n'est PAS livré : il n'existe aucune entité de
    // territoire à relire (la recherche territoriale est paramétrée par
    // département et rayon, sans identifiant), et c'est de la donnée de MARCHÉ,
    // hors espace. Une portée que le serveur ne sait pas lire est refusée, pas
    // avalée en silence.
    expect(chatSchema.safeParse({ message: 'hi', scopeObject: { kind: 'territory', id } }).success).toBe(false)
    expect(chatSchema.safeParse({ message: 'hi', scopeObject: { kind: 'consultant', id: 'Sophie' } }).success).toBe(
      false,
    )
  })

  it('ne laisse passer aucun CONTENU venu du navigateur — le serveur relit la fiche', () => {
    const r = chatSchema.safeParse({ message: 'hi', scopeObject: { kind: 'consultant', id, label: 'Sophie Martin' } })
    expect(r.success && r.data.scopeObject).toEqual({ kind: 'consultant', id })
  })

  it('ne laisse pas le navigateur fixer le plafond de coût d’une réponse', () => {
    const r = chatSchema.safeParse({ message: 'hi', replyCostCeiling: 999 })
    expect(r.success && (r.data as Record<string, unknown>).replyCostCeiling).toBeUndefined()
  })
})

describe('renameChatThreadSchema — renommer un fil (#1911.12, #1955.1)', () => {
  it('retire les espaces et replie les retours ligne', () => {
    const r = renameChatThreadSchema.safeParse({ conversationId: 'c-1', title: '  Préparer\n le RDV   SNCF ' })
    expect(r.success && r.data.title).toBe('Préparer le RDV SNCF')
  })

  it('sait dire NON — un titre vide ou fait de blancs est refusé', () => {
    expect(renameChatThreadSchema.safeParse({ conversationId: 'c-1', title: '   ' }).success).toBe(false)
    expect(renameChatThreadSchema.safeParse({ conversationId: 'c-1' }).success).toBe(false)
  })

  it('accepte 120 caractères, refuse 121', () => {
    expect(renameChatThreadSchema.safeParse({ conversationId: 'c-1', title: 'a'.repeat(120) }).success).toBe(true)
    expect(renameChatThreadSchema.safeParse({ conversationId: 'c-1', title: 'a'.repeat(121) }).success).toBe(false)
  })

  it('désigne le fil comme l’archivage : compte seul pour un fil ancien', () => {
    const accountId = '11111111-1111-4111-8111-111111111111'
    const r = renameChatThreadSchema.safeParse({ accountId, conversationId: null, title: 'X' })
    expect(r.success && r.data.accountId).toBe(accountId)
  })

  it('ne laisse passer aucun champ d’espace ni d’auteur venu du corps', () => {
    const r = renameChatThreadSchema.safeParse({
      conversationId: 'c-1',
      title: 'X',
      workspaceId: 'ws-autre',
      userId: 'u-autre',
    })
    expect(r.success && Object.keys(r.data).sort()).toEqual(['conversationId', 'title'])
  })
})

describe('ragIngestSchema — RAG ingest validation (text + PDF upload)', () => {
  it('accepts a raw-text document', () => {
    const r = ragIngestSchema.safeParse({ title: 'Note', content: 'Bonjour', category: 'Autre' })
    expect(r.success).toBe(true)
  })

  it('accepts a base64 PDF upload (no raw content)', () => {
    const r = ragIngestSchema.safeParse({ title: 'Plaquette', fileB64: 'JVBERi0xLjQK', filename: 'plaquette.pdf' })
    expect(r.success).toBe(true)
  })

  it('rejects a payload with neither content nor fileB64', () => {
    const r = ragIngestSchema.safeParse({ title: 'Vide', category: 'Autre' })
    expect(r.success).toBe(false)
  })

  it('rejects an oversized base64 file (server-side size guard)', () => {
    // Just past the 12M-char cap ≈ ~9MB binary — the last line of defence behind
    // the 12mb express body limit, so a crafted client can't blow past it.
    const r = ragIngestSchema.safeParse({ title: 'Trop gros', fileB64: 'A'.repeat(12_000_001) })
    expect(r.success).toBe(false)
  })

  it('accepts a base64 file at the size cap', () => {
    const r = ragIngestSchema.safeParse({ title: 'Limite', fileB64: 'A'.repeat(12_000_000) })
    expect(r.success).toBe(true)
  })

  it('rejects an empty title', () => {
    const r = ragIngestSchema.safeParse({ title: '', content: 'x' })
    expect(r.success).toBe(false)
  })
})

describe('ragIngestSchema — #1954.7 scope (workspace | conversation)', () => {
  it('scope is optional — omitting it is byte-identical to before this decision', () => {
    const r = ragIngestSchema.safeParse({ title: 'Note', content: 'Bonjour' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.scope).toBeUndefined()
  })

  it('accepts scope: workspace without a conversationId', () => {
    const r = ragIngestSchema.safeParse({ title: 'Référence', content: 'Bonjour', scope: 'workspace' })
    expect(r.success).toBe(true)
  })

  it('accepts scope: conversation WITH a conversationId', () => {
    const r = ragIngestSchema.safeParse({
      title: 'CV',
      content: 'Bonjour',
      scope: 'conversation',
      conversationId: 'thread-42',
    })
    expect(r.success).toBe(true)
  })

  it('rejects scope: conversation WITHOUT a conversationId — the field a fil belongs to is not optional', () => {
    const r = ragIngestSchema.safeParse({ title: 'CV', content: 'Bonjour', scope: 'conversation' })
    expect(r.success).toBe(false)
  })

  it('rejects an unknown scope value', () => {
    const r = ragIngestSchema.safeParse({ title: 'Note', content: 'Bonjour', scope: 'account' })
    expect(r.success).toBe(false)
  })
})

// Compatibilité des onglets ouverts — le lot 2b envoie la portée. D'ici là, l'écran
// du chat (`Chat.tsx::fileToIngestInput`) envoie EXACTEMENT ces deux formes, sans
// portée ni fil (mesuré en production le 12/09 : 4 ingestions 201). Elles doivent
// passer à l'identique et garder la destination d'avant : la base de l'espace.
describe('ragIngestSchema — la forme que l’écran du chat envoie AUJOURD’HUI', () => {
  it('accepte la forme TEXTE, sans portée ni fil', () => {
    const r = ragIngestSchema.safeParse({ title: 'notes.txt', category: 'chat', content: 'Bonjour' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.scope).toBeUndefined()
      expect(r.data.conversationId).toBeUndefined()
    }
  })

  it('accepte la forme FICHIER, sans portée ni fil', () => {
    const r = ragIngestSchema.safeParse({
      title: 'cv.pdf',
      category: 'chat',
      fileB64: 'JVBERi0xLjQK',
      filename: 'cv.pdf',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.scope).toBeUndefined()
      expect(r.data.conversationId).toBeUndefined()
    }
  })
})

/**
 * Un SEUL espace de noms de `conversationId` pour tout le copilote.
 *
 * Avant : `/ia/chat` acceptait l'id synthétique du web (« general »,
 * « account-<uuid> ») pendant que `/ia/chat/messages` exigeait un UUID — deux
 * espaces de noms incompatibles. Le Copilote IA ne pouvait donc PAS persister
 * ses fils (400 à la première écriture), et seul le widget flottant (qui tire
 * un `crypto.randomUUID()`) savait écrire.
 *
 * Après : la persistance accepte la même clé libre que `/ia/chat` — comme
 * `conversation_summaries.conversation_id`, déjà en TEXT « so it can hold the
 * web's synthetic ids » (migration LongMemory). La colonne `chat_messages
 * .conversation_id` passe donc UUID → TEXT (migration 1786500000000), ce qui
 * est un élargissement SANS PERTE : les lignes déjà écrites par le widget
 * restent lisibles à l'identique.
 */
describe('conversationId — un espace de noms unique (chat + persistance)', () => {
  const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
  const accountUuid = '11111111-1111-1111-1111-111111111111'

  it('accepte les ids synthétiques du Copilote en lecture (« general »)', () => {
    const r = listChatMessagesSchema.safeParse({ conversationId: 'general' })
    expect(r.success).toBe(true)
  })

  it('accepte les ids synthétiques du Copilote en écriture (« account-<uuid> »)', () => {
    const r = createChatMessageSchema.safeParse({
      conversationId: `account-${accountUuid}`,
      role: 'user',
      content: 'Quels sont les signaux ?',
    })
    expect(r.success).toBe(true)
  })

  // Non-régression widget flottant : ses lignes existantes sont écrites avec un
  // vrai UUID. Elles doivent continuer à passer, en lecture comme en écriture.
  it('accepte toujours un UUID (lignes déjà écrites par le widget flottant)', () => {
    expect(listChatMessagesSchema.safeParse({ conversationId: uuid }).success).toBe(true)
    expect(createChatMessageSchema.safeParse({ conversationId: uuid, role: 'assistant', content: 'ok' }).success).toBe(
      true,
    )
  })

  it('accepte la même clé que `/ia/chat` — les deux routes parlent le même langage', () => {
    for (const conversationId of ['general', `account-${accountUuid}`, uuid]) {
      expect(chatSchema.safeParse({ message: 'salut', conversationId }).success).toBe(true)
      expect(listChatMessagesSchema.safeParse({ conversationId }).success).toBe(true)
    }
  })

  it('accepte un fil non scopé (null / absent)', () => {
    expect(listChatMessagesSchema.safeParse({}).success).toBe(true)
    expect(listChatMessagesSchema.safeParse({ conversationId: null }).success).toBe(true)
  })

  it('refuse une clé vide (une chaîne vide n’est pas un fil)', () => {
    expect(listChatMessagesSchema.safeParse({ conversationId: '' }).success).toBe(false)
  })

  // La clé vient du client : sans borne, elle deviendrait un vecteur d'écriture
  // de texte arbitrairement long dans une colonne indexée.
  it('refuse une clé démesurée (garde-fou d’écriture)', () => {
    expect(listChatMessagesSchema.safeParse({ conversationId: 'x'.repeat(201) }).success).toBe(false)
    expect(listChatMessagesSchema.safeParse({ conversationId: 'x'.repeat(200) }).success).toBe(true)
  })

  // `accountId` reste un vrai UUID : c'est une colonne uuid qui référence un
  // compte réel — seul `conversationId` (clé de fil, libre) se détend.
  it('garde accountId en UUID strict', () => {
    expect(listChatMessagesSchema.safeParse({ accountId: 'general' }).success).toBe(false)
    expect(listChatMessagesSchema.safeParse({ accountId: accountUuid }).success).toBe(true)
  })
})

/**
 * #1944.20 — LE CURSEUR DE PAGINATION (`before`), DISTINCT DE `version`.
 *
 * `version` borne un LIEN FIGÉ (#2430.4, une version partagée). `before` sert
 * le défilement vers le haut d'un fil VIVANT : « donne-moi ce qui a été écrit
 * avant cette date », la date du plus ancien message déjà à l'écran. Les deux
 * sont des dates de coupure, mais deux concepts — d'où la clé séparée plutôt
 * qu'une réutilisation de `version`.
 */
describe('listChatMessagesSchema — #1944.20 before (curseur de pagination)', () => {
  it('accepte une date ISO et la parse en Date', () => {
    const r = listChatMessagesSchema.safeParse({ before: '2026-09-20T10:00:00.000Z' })
    expect(r.success).toBe(true)
    expect(r.success && r.data.before).toBeInstanceOf(Date)
  })

  it('absent par défaut — un fil sans curseur lit ses derniers messages', () => {
    const r = listChatMessagesSchema.safeParse({})
    expect(r.success && r.data.before).toBeUndefined()
  })

  it('refuse une valeur qui n’est pas une date', () => {
    expect(listChatMessagesSchema.safeParse({ before: 'pas-une-date' }).success).toBe(false)
  })
})

// #1958.8 — la langue de l'INTERFACE, transmise telle quelle par le navigateur
// (porte unique `laura-turn.ts`). Le service IA retombe sur le français pour
// toute valeur absente ou inconnue : cette porte ne rejette donc jamais sur ce
// champ, elle se contente de le laisser passer.
describe('chatSchema — interfaceLanguage (#1958.8)', () => {
  it('accepte le champ absent — un appelant plus ancien garde le comportement d’avant', () => {
    expect(chatSchema.safeParse({ message: 'salut' }).success).toBe(true)
  })

  it('accepte "fr" et "en"', () => {
    expect(chatSchema.safeParse({ message: 'salut', interfaceLanguage: 'fr' }).success).toBe(true)
    expect(chatSchema.safeParse({ message: 'salut', interfaceLanguage: 'en' }).success).toBe(true)
  })

  it('ne rejette pas une valeur inconnue — c’est le service IA qui retombe sur le français', () => {
    // Un futur troisième canal, une typo, une valeur corrompue : la porte les
    // laisse passer, elle ne les devine ni ne les tranche.
    expect(chatSchema.safeParse({ message: 'salut', interfaceLanguage: 'xx' }).success).toBe(true)
  })

  it('refuse une valeur démesurée (garde-fou d’écriture, même discipline que les autres champs libres)', () => {
    expect(chatSchema.safeParse({ message: 'salut', interfaceLanguage: 'x'.repeat(9) }).success).toBe(false)
  })

  it('accepte le corps EXACT des onglets ouverts avant ce lot — sans interfaceLanguage', () => {
    // `laura-turn.ts::chatRequestBody` tel qu'il tourne en production avant ce
    // lot : un onglet ouvert ne recharge pas son bundle au déploiement.
    const r = chatSchema.safeParse({
      message: 'Bonjour',
      accountId: null,
      conversationId: 'general',
      history: [],
      documentIds: [],
      clarificationAsked: false,
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.interfaceLanguage).toBeUndefined()
  })
})

// #1955.18 — même porte et même discipline que `chatSchema.interfaceLanguage`
// (#1958.8) : sert à choisir la locale de la DATE dans l'export d'un fil,
// jamais à filtrer quoi que ce soit côté requête.
describe('chatThreadTargetSchema — interfaceLanguage (#1955.18)', () => {
  it('accepte le champ absent — l’export d’avant ce lot reste valide', () => {
    expect(chatThreadTargetSchema.safeParse({ conversationId: 'c-1' }).success).toBe(true)
  })

  it('accepte "fr" et "en"', () => {
    expect(chatThreadTargetSchema.safeParse({ conversationId: 'c-1', interfaceLanguage: 'fr' }).success).toBe(true)
    expect(chatThreadTargetSchema.safeParse({ conversationId: 'c-1', interfaceLanguage: 'en' }).success).toBe(true)
  })

  it('ne rejette pas une valeur inconnue — c’est le contrôleur qui retombe sur le français', () => {
    expect(chatThreadTargetSchema.safeParse({ conversationId: 'c-1', interfaceLanguage: 'xx' }).success).toBe(true)
  })

  it('refuse une valeur démesurée (même garde-fou d’écriture que chatSchema)', () => {
    expect(chatThreadTargetSchema.safeParse({ conversationId: 'c-1', interfaceLanguage: 'x'.repeat(9) }).success).toBe(
      false,
    )
  })
})

describe('battlecardSchema — one owned account, uuid only', () => {
  it('accepts a uuid accountId', () => {
    expect(battlecardSchema.safeParse({ accountId: '11111111-1111-1111-1111-111111111111' }).success).toBe(true)
  })

  it('rejects a non-uuid accountId', () => {
    expect(battlecardSchema.safeParse({ accountId: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('compareSchema — 2..5 owned account uuids', () => {
  const uuid = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-1111-1111-111111111111`

  it('accepts two uuids', () => {
    expect(compareSchema.safeParse({ accountIds: [uuid(1), uuid(2)] }).success).toBe(true)
  })

  it('rejects a single account (comparison needs at least two)', () => {
    expect(compareSchema.safeParse({ accountIds: [uuid(1)] }).success).toBe(false)
  })

  it('rejects more than five (bounds the prompt / LLM cost)', () => {
    expect(compareSchema.safeParse({ accountIds: [1, 2, 3, 4, 5, 6].map(uuid) }).success).toBe(false)
  })

  it('rejects a non-uuid in the list', () => {
    expect(compareSchema.safeParse({ accountIds: [uuid(1), 'nope'] }).success).toBe(false)
  })
})

describe('chatSchema — #3708 « Outils et sources » : les familles exclues', () => {
  it('accepte des familles connues, et leur absence', () => {
    expect(chatSchema.safeParse({ message: 'hi', excludedToolFamilies: ['crm', 'email'] }).success).toBe(true)
    const r = chatSchema.safeParse({ message: 'hi' })
    expect(r.success && r.data.excludedToolFamilies).toBeUndefined()
  })

  it('refuse une famille inconnue : une exclusion ignorée en silence serait un faux contrôle', () => {
    expect(chatSchema.safeParse({ message: 'hi', excludedToolFamilies: ['hubspot'] }).success).toBe(false)
  })
})

describe('chatSchema — #3708.fournisseur « Outils et sources » : les outils exclus par identifiant', () => {
  it("accepte des identifiants d'outils, et leur absence", () => {
    expect(chatSchema.safeParse({ message: 'hi', excludedToolProviders: ['hubspot', 'gmail'] }).success).toBe(true)
    const r = chatSchema.safeParse({ message: 'hi' })
    expect(r.success && r.data.excludedToolProviders).toBeUndefined()
  })

  it('refuse un identifiant mal formé ou une liste démesurée', () => {
    expect(chatSchema.safeParse({ message: 'hi', excludedToolProviders: [''] }).success).toBe(false)
    expect(chatSchema.safeParse({ message: 'hi', excludedToolProviders: ['Hub Spot!'] }).success).toBe(false)
    const many = Array.from({ length: 41 }, (_, i) => `tool-${i}`)
    expect(chatSchema.safeParse({ message: 'hi', excludedToolProviders: many }).success).toBe(false)
  })
})

// #2370 (épopée #2947) — l'APPELANT du générateur : le composer passe par `/ia/message`. Un canal que le DTO
// refuse serait un générateur sans appelant ; `manual` reste refusé (rien à générer).
describe('generateMessageSchema — #2370 les canaux préparés', () => {
  const contactId = '11111111-1111-4111-8111-111111111111'
  it.each(['introduction_request', 'partner_message', 'follow_up_email', 'profile_push', 'linkedin_connection_note'])(
    'accepte le canal %s',
    channel => {
      expect(generateMessageSchema.safeParse({ contactId, channel }).success).toBe(true)
    },
  )
  it.each(['sms', 'whatsapp', 'voicemail'])('Théo B C5.A24 — refuse le canal retiré %s', channel => {
    expect(generateMessageSchema.safeParse({ contactId, channel }).success).toBe(false)
  })
  it('refuse le canal manuel — le commercial l’écrit lui-même', () => {
    expect(generateMessageSchema.safeParse({ contactId, channel: 'manual' }).success).toBe(false)
  })
})
