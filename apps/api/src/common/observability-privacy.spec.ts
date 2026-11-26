import {
  describeInsteadOfRaw,
  internalDetailsIn,
  isPrivateContentKey,
  isSecretKey,
  parseRawCaptureWindows,
  rawCaptureDecision,
  redactForLog,
  redactSecrets,
  sanitizeUserFacingText,
  supportReference,
} from './observability-privacy'

describe('#2442.5 — une référence support courte, lisible à voix haute, greppable dans le journal', () => {
  it('dérive la référence des huit premiers caractères hexadécimaux de l’identifiant de corrélation', () => {
    expect(supportReference('3f2a1b4c-5d6e-7f80-9012-3456789abcde')).toBe('BLM-3F2A1B4C')
  })

  it('rend `null` sans identifiant — « non mesuré » n’est jamais une valeur inventée', () => {
    expect(supportReference(null)).toBeNull()
    expect(supportReference(undefined)).toBeNull()
    expect(supportReference('')).toBeNull()
  })

  it('ne recopie JAMAIS un identifiant fourni par le client : seuls des hexadécimaux sortent', () => {
    // L'en-tête `X-Correlation-ID` est lu de la requête (`correlation-id.middleware.ts`) :
    // il est sous le contrôle de l'appelant. La référence est donc DÉRIVÉE, jamais
    // recopiée — ce qui la rend inoffensive à afficher.
    const reference = supportReference('<script>alert(1)</script>')
    expect(reference).not.toBeNull()
    expect(reference).toMatch(/^BLM-[0-9A-F]{8}$/)
    expect(reference).not.toContain('script')
  })

  it('reste stable pour un même identifiant, et diffère pour un autre', () => {
    expect(supportReference('zzzz')).toBe(supportReference('zzzz'))
    expect(supportReference('zzzz')).not.toBe(supportReference('yyyy'))
  })
})

describe('#2442.8 — le brut est remplacé par un type, une taille, une empreinte', () => {
  it('décrit une chaîne par son type, son nombre de caractères et une empreinte — jamais son contenu', () => {
    const described = describeInsteadOfRaw('Bonjour Jean, suite à notre échange de mardi…')
    expect(described).toMatchObject({ redacted: 'private-content', kind: 'string', chars: 45 })
    expect(described.fingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(JSON.stringify(described)).not.toContain('Jean')
  })

  it('reconnaît deux occurrences de la MÊME valeur par son empreinte', () => {
    const first = describeInsteadOfRaw('le même corps de message')
    const second = describeInsteadOfRaw('le même corps de message')
    const other = describeInsteadOfRaw('un autre corps de message')
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.fingerprint).not.toBe(other.fingerprint)
  })

  it('décrit un tableau par son nombre d’éléments, un objet par son nombre de clés', () => {
    expect(describeInsteadOfRaw(['a', 'b', 'c'])).toMatchObject({ kind: 'array', items: 3 })
    expect(describeInsteadOfRaw({ a: 1, b: 2 })).toMatchObject({ kind: 'object', keys: 2 })
  })

  it('n’invente rien sur une valeur absente — pas d’empreinte de `null`', () => {
    expect(describeInsteadOfRaw(null)).toEqual({ redacted: 'private-content', kind: 'null' })
    expect(describeInsteadOfRaw(undefined)).toEqual({ redacted: 'private-content', kind: 'undefined' })
  })

  it('ne donne JAMAIS d’empreinte à un secret — une empreinte est un oracle de confirmation', () => {
    const described = describeInsteadOfRaw('sk-live-000000000000', 'secret')
    expect(described).toEqual({ redacted: 'secret', kind: 'string', chars: 20 })
    expect(described.fingerprint).toBeUndefined()
  })
})

describe('#2442.7 — le contenu brut des données privées n’entre pas dans un journal, PAR DÉFAUT', () => {
  it('reconnaît les noms de clé qui portent du contenu privé', () => {
    for (const key of ['body', 'content', 'text', 'subject', 'email', 'phone', 'prompt', 'completion', 'cv']) {
      expect(isPrivateContentKey(key)).toBe(true)
    }
    expect(isPrivateContentKey('messageBody')).toBe(true)
    expect(isPrivateContentKey('raw_analysis')).toBe(true)
  })

  it('reconnaît les noms de clé qui portent un secret', () => {
    for (const key of ['authorization', 'cookie', 'set-cookie', 'password', 'apiKey', 'access_token', 'jwt']) {
      expect(isSecretKey(key)).toBe(true)
    }
  })

  it('N’ATTRAPE PAS les métadonnées — c’est avec elles qu’on explique un échec (#2442.1)', () => {
    for (const key of ['status', 'statusCode', 'code', 'count', 'durationMs', 'accountId', 'workspaceId', 'attempt']) {
      expect(isPrivateContentKey(key)).toBe(false)
      expect(isSecretKey(key)).toBe(false)
    }
  })

  it('remplace le contenu privé d’un méta de journal, à toute profondeur', () => {
    const redacted = redactForLog({
      accountId: 'acc-1',
      status: 502,
      contact: { email: 'jean.dupont@example.test', phone: '+33612345678' },
      draft: { subject: 'Suite à notre échange', body: 'Bonjour Jean, …' },
    }) as Record<string, unknown>

    expect(redacted['accountId']).toBe('acc-1')
    expect(redacted['status']).toBe(502)
    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain('jean.dupont@example.test')
    expect(serialized).not.toContain('+33612345678')
    expect(serialized).not.toContain('Bonjour Jean')
    expect(serialized).not.toContain('Suite à notre échange')
  })

  it('efface la VALEUR d’un secret sans la décrire par une empreinte', () => {
    const redacted = redactForLog({ authorization: 'Bearer abcdef.ghijkl.mnopqr' }) as Record<string, unknown>
    expect(JSON.stringify(redacted)).not.toContain('abcdef.ghijkl.mnopqr')
    expect(redacted['authorization']).toMatchObject({ redacted: 'secret' })
  })

  it('garde la PILE d’appels d’une erreur : une pile est à NOUS, ce n’est pas une donnée client', () => {
    const error = new Error('échec de la collecte')
    const redacted = redactForLog({ error }) as { error: { name: string; message: string; stack?: string } }
    expect(redacted.error.name).toBe('Error')
    expect(redacted.error.message).toBe('échec de la collecte')
    expect(redacted.error.stack).toContain('observability-privacy.spec')
  })

  it('caviarde un secret reconnu à sa FORME, même sous une clé anodine', () => {
    const redacted = redactForLog({ detail: 'appel refusé (Authorization: Bearer eyJhbGciOi.abc.def)' })
    expect(JSON.stringify(redacted)).not.toContain('eyJhbGciOi.abc.def')
  })

  it('ne boucle pas sur une référence circulaire et borne sa profondeur', () => {
    const root: Record<string, unknown> = { status: 200 }
    root['self'] = root
    expect(() => redactForLog(root)).not.toThrow()
  })
})

describe('#2442.6 — ni pile, ni fournisseur, ni clé, ni SQL vers l’utilisateur', () => {
  it('voit une pile d’appels', () => {
    const text =
      'Échec\n    at AnalysisService.run (/app/apps/api/src/modules/analysis/analysis.service.ts:412:19)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)'
    expect(internalDetailsIn(text)).toContain('pile d’appels')
    expect(sanitizeUserFacingText(text)).not.toContain('analysis.service.ts')
  })

  it('voit une requête SQL et une contrainte de base', () => {
    expect(internalDetailsIn('SELECT id, email FROM contacts WHERE workspace_id = $1')).toContain('requête SQL')
    expect(internalDetailsIn('duplicate key value violates unique constraint "contacts_email_key"')).toContain(
      'contrainte de base',
    )
    expect(internalDetailsIn('relation "attack_angles" does not exist')).toContain('contrainte de base')
  })

  it('voit le nom d’UN DE NOS fournisseurs — et nomme lequel', () => {
    // Doctrine : « on nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert ».
    expect(internalDetailsIn('Enrichissement indisponible (apollo_enrich a répondu 429)')).toContain(
      'fournisseur : Apollo',
    )
    expect(sanitizeUserFacingText('Firecrawl a répondu 503')).not.toMatch(/firecrawl/i)
  })

  it('voit une clé et un jeton', () => {
    expect(internalDetailsIn('api_key=AKIA0000000000000000')).toContain('secret')
    expect(sanitizeUserFacingText('token: eyJhbGciOi.abc.def')).not.toContain('eyJhbGciOi.abc.def')
  })

  it('N’ATTRAPE PAS une phrase d’erreur normale — la garde doit laisser passer le bien', () => {
    for (const innocent of [
      'La collecte n’a pas abouti. Réessaie dans quelques minutes.',
      'Ce compte n’a pas encore été analysé.',
      'Il te reste 12 crédits sur 100 ce cycle.',
      'Ton brouillon est déposé dans Gmail.',
      'Le service est momentanément indisponible, rien n’a été débité.',
    ]) {
      expect(internalDetailsIn(innocent)).toEqual([])
      expect(sanitizeUserFacingText(innocent)).toBe(innocent)
    }
  })
})

describe('#2442.9 / #2442.19 — la capture brute est une PORTE : contrôlée, expirante, auditée', () => {
  const now = new Date('2026-09-21T12:00:00.000Z')

  it('SANS RÉGLAGE, la porte est fermée — no-op strict, aucune capture', () => {
    expect(parseRawCaptureWindows(undefined)).toEqual([])
    expect(parseRawCaptureWindows('')).toEqual([])
    expect(rawCaptureDecision({ context: 'ChatService', now, windows: [] })).toEqual({
      allowed: false,
      reason: 'not_configured',
    })
  })

  it('REFUSE une entrée séparée par des deux-points — l’heure ISO en porte elle-même', () => {
    // Mesuré en écrivant cette garde : `ChatService:2026-09-21T18:00:00Z` se
    // découpait en quatre champs, et « 00Z » devenait la référence d'audit.
    // Un séparateur ambigu ouvrait donc une fenêtre que personne n'avait posée.
    expect(parseRawCaptureWindows('ChatService:2026-09-21T18:00:00Z:SUP-1234')).toEqual([])
  })

  it('lit une fenêtre complète : contexte, échéance, référence d’audit', () => {
    expect(parseRawCaptureWindows('ChatService|2026-09-21T18:00:00Z|SUP-1234')).toEqual([
      { context: 'ChatService', expiresAt: '2026-09-21T18:00:00.000Z', auditReference: 'SUP-1234' },
    ])
  })

  it('REFUSE une fenêtre sans référence d’audit — #2442.19 : aucun accès brut sans trace', () => {
    expect(parseRawCaptureWindows('ChatService|2026-09-21T18:00:00Z')).toEqual([])
    expect(parseRawCaptureWindows('ChatService|2026-09-21T18:00:00Z|')).toEqual([])
  })

  it('REFUSE une fenêtre sans échéance lisible — une porte sans fin ne se referme jamais', () => {
    expect(parseRawCaptureWindows('ChatService|bientôt|SUP-1234')).toEqual([])
    expect(parseRawCaptureWindows('ChatService||SUP-1234')).toEqual([])
  })

  it('REFUSE le joker : une fenêtre nomme UN contexte, jamais « tout »', () => {
    expect(parseRawCaptureWindows('*|2026-09-21T18:00:00Z|SUP-1234')).toEqual([])
  })

  it('ouvre la porte pour le contexte nommé, et nomme la référence d’audit', () => {
    const windows = parseRawCaptureWindows('ChatService|2026-09-21T18:00:00Z|SUP-1234')
    expect(rawCaptureDecision({ context: 'ChatService', now, windows })).toEqual({
      allowed: true,
      auditReference: 'SUP-1234',
    })
  })

  it('laisse la porte fermée pour TOUT AUTRE contexte — la fenêtre ne déborde pas', () => {
    const windows = parseRawCaptureWindows('ChatService|2026-09-21T18:00:00Z|SUP-1234')
    expect(rawCaptureDecision({ context: 'AnalysisService', now, windows })).toEqual({
      allowed: false,
      reason: 'no_window',
    })
    expect(rawCaptureDecision({ context: undefined, now, windows })).toEqual({
      allowed: false,
      reason: 'no_window',
    })
  })

  it('referme la porte d’elle-même à l’échéance', () => {
    const windows = parseRawCaptureWindows('ChatService|2026-09-21T11:59:59Z|SUP-1234')
    expect(rawCaptureDecision({ context: 'ChatService', now, windows })).toEqual({
      allowed: false,
      reason: 'expired',
    })
  })

  it('porte ouverte, le brut passe — et c’est la SEULE façon de le faire passer', () => {
    const meta = { draft: { body: 'Bonjour Jean, …' } }
    expect(JSON.stringify(redactForLog(meta))).not.toContain('Bonjour Jean')
    expect(JSON.stringify(redactForLog(meta, { rawCapture: true }))).toContain('Bonjour Jean')
  })
})

describe('#2084.37 — redactSecrets : une erreur ne porte jamais un secret, un IBAN ou un identifiant d’infra', () => {
  it('SAIT DIRE NON — un jeton Bearer littéral est détecté et masqué', () => {
    const text = 'Connexion refusée : Bearer sk_live_abcdef1234567890ABCDEF'
    const redacted = redactSecrets(text)
    expect(redacted).not.toContain('sk_live_abcdef1234567890ABCDEF')
    expect(redacted).toContain('[secret]')
  })

  it('masque des identifiants de connexion portés dans une URL', () => {
    const text = 'Échec de connexion à postgres://bellum:S3cr3tPass@db.internal:5432/prod'
    const redacted = redactSecrets(text)
    expect(redacted).not.toContain('S3cr3tPass')
    expect(redacted).not.toContain('bellum:')
  })

  it('masque une paire clé=valeur au nom sensible (api_key, token, secret, password)', () => {
    expect(redactSecrets('api_key=AKIA1234567890')).not.toContain('AKIA1234567890')
    expect(redactSecrets('token: eyJhbGciOiJIUzI1NiJ9.abc.def')).not.toContain('eyJhbGciOiJIUzI1NiJ9.abc.def')
  })

  it('masque un IBAN', () => {
    const redacted = redactSecrets('Virement refusé pour FR7630006000011234567890189')
    expect(redacted).not.toContain('FR7630006000011234567890189')
    expect(redacted).toContain('[secret]')
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un message d’erreur normal traverse intact', () => {
    const text = 'Impossible de sauvegarder les réponses'
    expect(redactSecrets(text)).toBe(text)
  })
})
