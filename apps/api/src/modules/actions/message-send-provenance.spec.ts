import { EMPTY_MESSAGE_SEND_BREAKDOWN, MESSAGE_SEND_SQL, breakdownMessageSends } from './message-send-provenance'

/**
 * Le classifieur de provenance est la source de vérité partagée par le cockpit
 * perso (`ActionsService.getWeeklyStats`) et les KPIs manager
 * (`TeamKpisService`). Ce qu'on verrouille ici :
 *
 * 1. un envoi déclaré n'est JAMAIS promu en « vérifié » ;
 * 2. l'historique sans `metadata.via` n'est JAMAIS compté comme vérifié ;
 * 3. les prédicats SQL restent le miroir exact du classifieur TS.
 */
describe('message send provenance', () => {
  describe('breakdownMessageSends', () => {
    it('counts a Bellum-delivered email as verified', () => {
      const breakdown = breakdownMessageSends([
        { action_type: 'message_sent', metadata: { via: 'bellum', subject: 'Bonjour' } },
      ])
      expect(breakdown).toEqual({ verified: 1, declared: 0, unattributed: 0, total: 1 })
    })

    it('counts a self-reported LinkedIn send as declared, never as verified', () => {
      const breakdown = breakdownMessageSends([
        { action_type: 'plan_action_message_sent', metadata: { via: 'declaration', declared: true } },
      ])
      expect(breakdown).toEqual({ verified: 0, declared: 1, unattributed: 0, total: 1 })
    })

    it('treats a declaration carried by the generic action type as declared', () => {
      // Défense en profondeur : une déclaration reste une déclaration même si
      // elle arrive sur `message_sent` (client tiers via POST /actions/track).
      const breakdown = breakdownMessageSends([
        { action_type: 'message_sent', metadata: { via: 'declaration' } },
        { action_type: 'message_sent', metadata: { via: 'bellum', declared: true } },
      ])
      expect(breakdown).toEqual({ verified: 0, declared: 2, unattributed: 0, total: 2 })
    })

    it('never counts a plan_action_message_sent as verified, even stamped via=bellum', () => {
      // Aucun chemin d'écriture réel ne produit ça ; si ça arrive, c'est forgé.
      const breakdown = breakdownMessageSends([
        { action_type: 'plan_action_message_sent', metadata: { via: 'bellum' } },
      ])
      expect(breakdown).toEqual({ verified: 0, declared: 0, unattributed: 1, total: 1 })
    })

    describe('historical rows (written before provenance stamping)', () => {
      it('counts a row with no via as unattributed, never as verified', () => {
        const breakdown = breakdownMessageSends([
          { action_type: 'message_sent', metadata: {} },
          { action_type: 'plan_action_message_sent', metadata: {} },
        ])
        expect(breakdown).toEqual({ verified: 0, declared: 0, unattributed: 2, total: 2 })
      })

      it('tolerates null/absent metadata without crashing or claiming proof', () => {
        const breakdown = breakdownMessageSends([
          { action_type: 'message_sent', metadata: null },
          { action_type: 'message_sent' },
        ])
        expect(breakdown).toEqual({ verified: 0, declared: 0, unattributed: 2, total: 2 })
      })

      it('ignores a non-string via rather than trusting it', () => {
        const breakdown = breakdownMessageSends([{ action_type: 'message_sent', metadata: { via: { fake: true } } }])
        expect(breakdown.verified).toBe(0)
        expect(breakdown.unattributed).toBe(1)
      })
    })

    it('ignores action types that are not sends', () => {
      const breakdown = breakdownMessageSends([
        { action_type: 'message_copied', metadata: { via: 'bellum' } },
        { action_type: 'response_received', metadata: {} },
        { action_type: 'analysis_completed', metadata: {} },
      ])
      expect(breakdown).toEqual(EMPTY_MESSAGE_SEND_BREAKDOWN)
    })

    it('keeps total equal to the sum of the three buckets on a mixed batch', () => {
      const breakdown = breakdownMessageSends([
        { action_type: 'message_sent', metadata: { via: 'bellum' } },
        { action_type: 'message_sent', metadata: { via: 'bellum' } },
        { action_type: 'plan_action_message_sent', metadata: { via: 'declaration' } },
        { action_type: 'message_sent', metadata: {} },
        { action_type: 'message_copied', metadata: {} },
      ])
      expect(breakdown).toEqual({ verified: 2, declared: 1, unattributed: 1, total: 4 })
      expect(breakdown.verified + breakdown.declared + breakdown.unattributed).toBe(breakdown.total)
    })
  })

  describe('SQL predicates mirror the TS classifier', () => {
    // Chaque ligne est classée par le TS, puis par une évaluation JS des mêmes
    // prédicats SQL. Les deux doivent tomber d'accord — sinon le cockpit et le
    // dashboard manager repartiraient en divergence silencieuse.
    const rows = [
      { action_type: 'message_sent', metadata: { via: 'bellum' } },
      { action_type: 'message_sent', metadata: { via: 'declaration' } },
      { action_type: 'message_sent', metadata: { declared: true } },
      { action_type: 'message_sent', metadata: {} },
      { action_type: 'plan_action_message_sent', metadata: { via: 'declaration', declared: true } },
      { action_type: 'plan_action_message_sent', metadata: { via: 'bellum' } },
      { action_type: 'plan_action_message_sent', metadata: {} },
      { action_type: 'message_copied', metadata: { via: 'bellum' } },
    ]

    /**
     * Évalue un prédicat de MESSAGE_SEND_SQL contre une ligne.
     *
     * On ne réimplémente PAS un moteur SQL : on substitue les cinq comparaisons
     * atomiques par leur valeur booléenne (calculée comme le ferait Postgres,
     * `->>` rendant du texte), puis on évalue l'algèbre booléenne restante
     * (AND / OR / NOT / parenthèses). Si un prédicat gagne un nouvel atome, la
     * substitution ne couvrira plus tout et l'assertion finale le détectera.
     */
    function evalSql(predicate: string, row: (typeof rows)[number]): boolean {
      const meta = row.metadata as Record<string, unknown>
      const via = typeof meta.via === 'string' ? meta.via : null
      // `->>'declared'` rend le booléen jsonb sous forme de texte 'true'/'false'.
      const declaredText = typeof meta.declared === 'boolean' ? String(meta.declared) : null
      const atoms: ReadonlyArray<readonly [string, boolean]> = [
        [`action_type IN ('message_sent', 'plan_action_message_sent')`, isSendType(row.action_type)],
        [`COALESCE(metadata, '{}'::jsonb)->>'via' = 'declaration'`, via === 'declaration'],
        [`COALESCE(metadata, '{}'::jsonb)->>'declared' = 'true'`, declaredText === 'true'],
        [`COALESCE(metadata, '{}'::jsonb)->>'via' = 'bellum'`, via === 'bellum'],
        [`action_type = 'message_sent'`, row.action_type === 'message_sent'],
      ]
      let js = predicate
      for (const [sql, value] of atoms) js = js.split(sql).join(String(value))
      js = js
        .replace(/\bAND\b/g, '&&')
        .replace(/\bOR\b/g, '||')
        .replace(/\bNOT\b/g, '!')

      // Garde-fou : après substitution il ne doit rester QUE de l'algèbre
      // booléenne. Tout résidu (nouvel atome non couvert) casse le test au lieu
      // de le faire passer silencieusement.
      expect(js).toMatch(/^[\s()!&|truefals]*$/)
      // eslint-disable-next-line no-new-func -- expression booléenne close, en test seulement
      return Boolean(new Function(`return (${js})`)())
    }

    function isSendType(actionType: string): boolean {
      return actionType === 'message_sent' || actionType === 'plan_action_message_sent'
    }

    it.each(['verified', 'declared', 'unattributed'] as const)('agrees with the TS classifier for %s', bucket => {
      const fromSql = rows.filter(row => evalSql(MESSAGE_SEND_SQL[bucket], row)).length
      const fromTs = breakdownMessageSends(rows)[bucket]
      expect(fromSql).toBe(fromTs)
    })

    it('agrees on the total, and the three buckets partition it', () => {
      const total = rows.filter(row => evalSql(MESSAGE_SEND_SQL.total, row)).length
      expect(total).toBe(breakdownMessageSends(rows).total)
      const buckets = (['verified', 'declared', 'unattributed'] as const).map(
        b => rows.filter(row => evalSql(MESSAGE_SEND_SQL[b], row)).length,
      )
      expect(buckets.reduce((a, b) => a + b, 0)).toBe(total)
    })
  })
})
