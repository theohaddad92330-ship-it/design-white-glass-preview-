import {
  ACCESS_MODES,
  ACTIVITY_DIRECTIONS,
  ACTIVITY_KINDS,
  INTERVENTION_STATES,
  INTERVENTION_SUBJECTS,
  INTERVIEW_OUTCOMES,
  INVOICE_READINESS_STATES,
  PRIORITY_GATES,
  PROJECT_NEED_STATUSES,
  PROOF_STRENGTHS,
  SHORTLIST_STATUSES,
  STAFFABLE_VERDICTS,
  chainFlowSteps,
  chainManualSteps,
  commercialStatusSchema,
  type ChainKey,
} from '@bellum/contracts'
import { CHAIN_CATALOG } from './chain-catalog'
import { CHAIN_PROJECTORS, findProjector } from './chain-projectors'

/**
 * LA GARDE DES PROJECTEURS (#1503).
 *
 * Elle protège la seule panne que ce chantier peut produire en silence : un
 * lecteur de fait qui vise une colonne que sa requête ne rend pas. Il lirait
 * `undefined`, le fait ne serait jamais établi, et l'étape correspondante
 * n'aurait plus jamais un seul dossier — sans qu'aucun test ne rougisse et sans
 * qu'aucune erreur ne remonte. C'est le motif « compteur juste, filtre faux »
 * appliqué à la dérivation.
 *
 * Elle prouve aussi qu'elle LIT quelque chose : les listes qu'elle compare ne
 * sont pas vides, et un projecteur qui perdrait tous ses faits la ferait
 * échouer.
 */
describe('projecteurs de parcours', () => {
  /** Les alias que le SQL expose : `… AS nom`, plus les colonnes nues `t.nom`. */
  function columnsOf(sql: string): Set<string> {
    const columns = new Set<string>()
    for (const match of sql.matchAll(/\bAS\s+([a-z_][a-z0-9_]*)/gi)) columns.add(match[1].toLowerCase())
    // `a.priority_score,` — une colonne rendue sans alias porte son propre nom.
    for (const match of sql.matchAll(/^\s{9,}[a-z]\.([a-z_][a-z0-9_]*),?\s*$/gim)) columns.add(match[1].toLowerCase())
    return columns
  }

  it('couvre les sept parcours du catalogue, sans doublon', () => {
    expect(CHAIN_PROJECTORS).toHaveLength(CHAIN_CATALOG.length)
    const keys = CHAIN_PROJECTORS.map(projector => projector.chainKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const chain of CHAIN_CATALOG) expect(findProjector(chain.key)).toBeDefined()
  })

  it.each(CHAIN_PROJECTORS.map(projector => [projector.chainKey] as [ChainKey]))(
    '%s — chaque colonne LUE est une colonne que la requête rend',
    chainKey => {
      const projector = findProjector(chainKey)
      if (!projector) throw new Error(`Projecteur introuvable : ${chainKey}`)
      const produced = columnsOf(projector.sql)

      // La garde LIT vraiment : sans ces deux bornes, un projecteur vidé de ses
      // faits passerait au vert en ne comparant rien.
      expect(produced.size).toBeGreaterThan(5)
      expect(projector.readColumns.length).toBeGreaterThan(3)

      const missing = projector.readColumns.filter(column => !produced.has(column.toLowerCase()))
      expect(missing).toEqual([])
    },
  )

  it.each(CHAIN_PROJECTORS.map(projector => [projector.chainKey] as [ChainKey]))(
    '%s — rend les trois colonnes que le service manipule sans connaître le métier',
    chainKey => {
      const projector = findProjector(chainKey)
      if (!projector) throw new Error(`Projecteur introuvable : ${chainKey}`)
      const produced = columnsOf(projector.sql)
      for (const required of ['id', 'label', 'moved_at']) expect([...produced]).toContain(required)
    },
  )

  it('ne prend qu’un seul paramètre — l’espace. Rien d’autre n’est interpolé', () => {
    for (const projector of CHAIN_PROJECTORS) {
      // Un `$2` voudrait dire qu'une seconde valeur entre dans la requête ;
      // un `${` voudrait dire qu'elle y entre sans passer par un paramètre.
      expect(projector.sql).toContain('$1')
      expect(projector.sql).not.toContain('$2')
      expect(projector.sql).not.toContain('${')
      // Toutes les requêtes filtrent l'espace : une projection qui l'oublierait
      // montrerait les dossiers d'un autre client.
      expect(projector.sql).toMatch(/workspace_id = \$1/)
    }
  })

  it('chaque étape du flux a SON lecteur de fait, et aucun ne déborde sur la checklist', () => {
    let readers = 0
    for (const chain of CHAIN_CATALOG) {
      const projector = findProjector(chain.key)
      if (!projector) throw new Error(`Projecteur introuvable : ${chain.key}`)
      const flow = chainFlowSteps(chain).map(step => step.position)
      const manual = new Set(chainManualSteps(chain).map(step => step.position))

      // Une étape sans lecteur n'est jamais atteinte, donc jamais dépassée :
      // tous les dossiers s'arrêtent avant elle, et la piste se remplit à
      // l'étape 3 puis reste vide. Ça ressemble à un produit qui marche.
      expect([...projector.factPositions].sort((a, b) => a - b)).toEqual(flow)
      // Un fait posé sur un geste hors outil serait invisible : `derivePosition`
      // écarte tout ce qui dépasse le flux. Les deux ne se recouvrent jamais.
      for (const position of projector.factPositions) expect(manual.has(position)).toBe(false)
      readers += projector.factPositions.length
    }
    // La garde LIT : sans cette borne, sept projecteurs vidés passeraient au vert.
    expect(readers).toBeGreaterThan(40)
  })

  /**
   * ⚠️ CETTE GARDE EXISTE PARCE QUE LE DÉFAUT A ÉTÉ COMMIS ICI.
   *
   * Le projecteur « rang 2 → rang 1 » comptait les preuves avec
   * `p.strength = 'strong'`. Les trois valeurs réelles sont `measured`,
   * `attested` et `declared` : le prédicat rendait donc TOUJOURS zéro, l'étape
   * « Preuves qualifiées » n'était jamais atteinte, et la porte refusait pour
   * toujours. Un littéral hors énumération ne lève rien et ne filtre rien — il
   * est simplement INERTE, exactement ce que GA-62 décrit pour les besoins.
   *
   * Elle compare à l'UNION des énumérations du contrat, sans résoudre la table
   * de chaque alias : elle attrape donc une valeur qui n'existe NULLE PART, ce
   * qui est précisément la faute commise. Une valeur valide ailleurs lui
   * échappe, et ce n'est pas ce qu'elle prétend garder.
   */
  it('aucun littéral comparé à une colonne n’est hors de toute énumération connue', () => {
    const known = new Set<string>([
      ...ACCESS_MODES,
      ...ACTIVITY_DIRECTIONS,
      ...ACTIVITY_KINDS,
      ...INTERVENTION_STATES,
      ...INTERVENTION_SUBJECTS,
      ...INTERVIEW_OUTCOMES,
      ...INVOICE_READINESS_STATES,
      ...PRIORITY_GATES,
      ...PROOF_STRENGTHS,
      ...PROJECT_NEED_STATUSES,
      ...SHORTLIST_STATUSES,
      ...STAFFABLE_VERDICTS,
      ...commercialStatusSchema.options,
      // Les statuts de mission et la disponibilité d'un consultant n'ont pas
      // d'énumération dans le contrat : ils sont NOMMÉS ici, avec leur source,
      // plutôt que laissés hors garde — une garde qui ignore la moitié de son
      // sujet ne garde rien (`missions.status`, `consultants.availability`).
      'onboarding',
      'renewed',
      'immediate',
      'sous_1_mois',
      // `consultant_push_feedback.outcome` : « retenu | refuse | en_attente ».
      'retenu',
    ])
    // ⚠️ Les fautes sont COLLECTÉES puis comparées à une liste vide, pour que le
    // message dise LESQUELLES. `expect(x, 'message')` n'existe pas en jest —
    // c'est une signature de vitest, et elle échoue sur « Expect takes at most
    // one argument », ce qui masque la vraie faute.
    const offenders: string[] = []
    let checked = 0
    for (const projector of CHAIN_PROJECTORS) {
      const sql = projector.sql.replace(/--.*$/gm, '')
      for (const match of sql.matchAll(/\b[a-z]\.[a-z_]+\s*(?:=|<>|IN)\s*\(?((?:'[^']*'\s*,?\s*)+)\)?/gi)) {
        for (const literal of match[1].matchAll(/'([^']*)'/g)) {
          checked += 1
          if (!known.has(literal[1])) offenders.push(`${projector.chainKey} : ${literal[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
    // La garde LIT : sans littéral trouvé, elle passerait au vert pour toujours.
    expect(checked).toBeGreaterThan(10)
  })

  it('les gestes hors outil sont TOUS à la fin — sinon la coupure réordonnerait les étapes', () => {
    for (const chain of CHAIN_CATALOG) {
      const flow = chainFlowSteps(chain).map(step => step.position)
      const manual = chainManualSteps(chain).map(step => step.position)
      if (manual.length === 0) continue
      expect(Math.max(...flow)).toBeLessThan(Math.min(...manual))
      // Le flux est contigu à partir de 1 : c'est ce qui permet de le rendre
      // comme un fil horizontal sans trou.
      expect(flow).toEqual(flow.map((_, index) => index + 1))
    }
  })
})
