import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PORTFOLIO_HANDOVER_KINDS, PORTFOLIO_PERSONAL_KINDS } from '@bellum/contracts'
import { PORTFOLIO_HOLDING_COLUMNS } from './workspace-portfolio-handover.service'

/**
 * LA GARDE DE LA REPRISE DE PORTEFEUILLE.
 *
 * Elle protège quatre règles qui existaient AVANT elle — elle n'en invente
 * aucune :
 *
 *  1. **L'isolation par espace.** Toute lecture et toute écriture de ce chemin
 *     portent `workspace_id`. Un `UPDATE … WHERE owner = :partant` sans
 *     l'espace réattribuerait le portefeuille d'un homonyme dans une AUTRE ESN.
 *  2. **On archive, on ne supprime pas.** Aucune suppression dans ce chemin.
 *  3. **Une boîte mail est PERSONNELLE (D58)** et **le corps des messages ne
 *     sort jamais vers un humain (D65)** : aucune table personnelle n'est
 *     touchée par un transfert.
 *  4. **Ce qui a été APPRIS appartient à l'espace** : angles, notes et mémoire
 *     épinglée se lisent par `workspace_id`. C'est ce qui fait qu'ils survivent
 *     à un départ SANS qu'aucune ligne ne soit réécrite — et donc qu'ils n'ont
 *     rien à faire dans un transfert.
 *
 * ⚠️ Elle prouve DEUX choses, comme toute garde de ce dépôt :
 *  - qu'elle **LIT** — chaque corpus est vérifié non vide, fichier par fichier ;
 *  - qu'elle **sait dire NON** — des contrôles négatifs permanents lui soumettent
 *    du code volontairement fautif et exigent qu'elle le refuse.
 */

const MODULE_DIR = __dirname
const ENTITIES_DIR = join(MODULE_DIR, '..', '..', 'database', 'entities')
const SERVICE_FILE = join(MODULE_DIR, 'workspace-portfolio-handover.service.ts')

/** La table (fichier d'entité) derrière chaque nature transférable. */
const ENTITY_FILE_BY_KIND: Readonly<
  Record<Exclude<(typeof PORTFOLIO_HANDOVER_KINDS)[number], 'actions' | 'followups'>, string>
> = {
  accounts: 'account.entity.ts',
  contacts: 'contact.entity.ts',
  tasks: 'task.entity.ts',
  opportunities: 'project.entity.ts',
  needs: 'project-need.entity.ts',
  missions: 'mission.entity.ts',
}

/**
 * Les tables PERSONNELLES — celles qu'un transfert ne doit jamais toucher.
 *
 * La messagerie et l'agenda connectés (un lien par personne), les conversations
 * avec le copilote (indexées par personne), les préférences et vues de chacun.
 */
const PERSONAL_ENTITY_FILES = [
  'google-connection.entity.ts',
  'microsoft-connection.entity.ts',
  'chat-message.entity.ts',
  'user-preference.entity.ts',
  'saved-view.entity.ts',
] as const

/**
 * Ce qui a été APPRIS sur un compte — et qui appartient à l'ESPACE, donc
 * survit au départ de celui qui l'a appris.
 */
const LEARNED_ENTITY_FILES = [
  'attack-angle.entity.ts',
  'note.entity.ts',
  'memory-pinned-fact.entity.ts',
  'access-fact.entity.ts',
] as const

/** Le corps d'un fichier d'entité, ou `null` s'il n'existe pas (ce qui doit
 *  faire ÉCHOUER la garde, pas la rendre verte en silence). */
function entitySource(file: string): string | null {
  const path = join(ENTITIES_DIR, file)
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** Une colonne DÉCLARÉE sur l'entité — le nom suivi de `:` en début de champ,
 *  pas une simple occurrence (un commentaire ne déclare rien). */
function declaresColumn(source: string, column: string): boolean {
  return new RegExp(`^\\s*${column}\\s*:\\s*`, 'm').test(source)
}

/** L'objet accolade-à-accolade qui commence à `start`, `null` s'il ne ferme pas. */
function objectAt(source: string, start: number): string | null {
  let depth = 0
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Les critères passés à `.count(` et `.update(` — les deux seuls appels que ce
 * service adresse aux six dépôts de portefeuille.
 *
 * ⚠️ Le premier argument est résolu qu'il soit écrit EN PLACE (`.count({ … })`)
 * ou passé par une variable (`const where = { … }` puis `.update(where, …)`).
 * La première version de cette garde ne connaissait que la forme en place ; le
 * jour où le service a extrait son critère dans un `const` — pour une raison
 * qui n'avait rien à voir — elle a cessé de voir une écriture sur deux. Une
 * garde qu'un renommage aveugle n'est pas une garde.
 *
 * ⚠️ Le RÉCEPTEUR est borné à un dépôt (`repository.…` ou `this.<champ>.…`) :
 * sans ça, la garde attrapait aussi `holding.count(workspaceId, userId)` — un
 * appel de la table des natures, pas une requête — et exigeait `workspace_id`
 * là où l'argument EST déjà l'espace. Une garde qui compte du bruit finit par
 * être désactivée.
 */
function scopeCriteria(source: string): string[] {
  const found: string[] = []
  const call = /\b(?:repository|this\.[A-Za-z_$][\w$]*)\.(?:count|update)\(\s*(\{|[A-Za-z_$][\w$]*)/g
  let match: RegExpExecArray | null
  // ⚠️ `exec` avec le drapeau `g` est STATEFUL — la boucle consomme `lastIndex`,
  // et c'est voulu ici. Une regex `g` réutilisée par `test()` ne le serait pas.
  while ((match = call.exec(source)) !== null) {
    const head = match[1] as string
    if (head === '{') {
      const literal = objectAt(source, source.indexOf('{', match.index))
      if (literal) found.push(literal)
      continue
    }
    // Une variable : on va lire sa déclaration dans le même fichier. Introuvable
    // = on remonte le NOM, qui ne contient pas `workspace_id` — donc la garde
    // échoue plutôt que de fermer les yeux.
    const declaration = new RegExp(`const\\s+${head}\\s*=\\s*\\{`).exec(source)
    const literal = declaration ? objectAt(source, source.indexOf('{', declaration.index)) : null
    found.push(literal ?? head)
  }
  return found
}

describe('Reprise de portefeuille — la garde', () => {
  const service = existsSync(SERVICE_FILE) ? readFileSync(SERVICE_FILE, 'utf8') : ''

  it('LIT bien le service — un fichier introuvable passerait au vert pour toujours', () => {
    expect(existsSync(SERVICE_FILE)).toBe(true)
    expect(service.length).toBeGreaterThan(2000)
    expect(service).toContain('class WorkspacePortfolioHandoverService')
  })

  /* ------------------------------------------------------------------ */
  /*  1. L'isolation par espace                                          */
  /* ------------------------------------------------------------------ */

  describe('l’isolation par espace', () => {
    const criteria = scopeCriteria(service)

    it('la garde a bien trouvé des critères à inspecter', () => {
      // Deux au minimum : le comptage et l'écriture. Zéro critère trouvé
      // rendrait le test suivant vrai par vacuité.
      expect(criteria.length).toBeGreaterThanOrEqual(2)
    })

    it('chaque lecture et chaque écriture est bornée par `workspace_id`', () => {
      for (const criterion of criteria) {
        expect(criterion).toContain('workspace_id')
      }
    })

    it('… et le repérage sait dire NON — un critère sans l’espace est repéré, en place', () => {
      const fautif = `
        await repository.update({ assigned_to: from }, { assigned_to: to })
      `
      const found = scopeCriteria(fautif)
      expect(found).toHaveLength(1)
      expect(found[0]).not.toContain('workspace_id')
    })

    it('… et il le repère AUSSI quand le critère passe par une variable', () => {
      const fautif = `
        const where = { assigned_to: from }
        await repository.update(where, patch)
      `
      const found = scopeCriteria(fautif)
      expect(found).toHaveLength(1)
      expect(found[0]).not.toContain('workspace_id')
    })

    it('… et une variable dont il ne trouve pas la déclaration ne le rend pas aveugle', () => {
      const opaque = `await repository.count(criteriaBuiltElsewhere)`
      const found = scopeCriteria(opaque)
      expect(found).toEqual(['criteriaBuiltElsewhere'])
      expect(found[0]).not.toContain('workspace_id')
    })

    it('… et il ne confond PAS un appel de la table des natures avec une requête', () => {
      // `holding.count(workspaceId, userId)` n'est pas une requête : son premier
      // argument EST l'espace. Le compter aurait rendu la garde bruyante, donc
      // à terme désactivée.
      expect(scopeCriteria(`await holding.count(workspaceId, userId)`)).toEqual([])
    })
  })

  /* ------------------------------------------------------------------ */
  /*  2. On archive, on ne supprime pas                                  */
  /* ------------------------------------------------------------------ */

  describe('on archive, on ne supprime pas', () => {
    it('le chemin de reprise ne supprime aucune ligne', () => {
      expect(service).not.toMatch(/\.delete\s*\(/)
      expect(service).not.toMatch(/\.remove\s*\(/)
      expect(service).not.toMatch(/\.softDelete\s*\(/)
      expect(service).not.toMatch(/\bDELETE\s+FROM\b/i)
    })

    it('… et le repérage sait dire NON', () => {
      const fautif = `await this.accounts.delete({ workspace_id: ws, assigned_to: from })`
      expect(fautif).toMatch(/\.delete\s*\(/)
    })
  })

  /* ------------------------------------------------------------------ */
  /*  3. Le personnel ne se transmet pas (D58, D65)                      */
  /* ------------------------------------------------------------------ */

  describe('la messagerie ne change jamais de main (D58, D65)', () => {
    it('les tables personnelles existent bien — sinon la garde surveillerait du vide', () => {
      for (const file of PERSONAL_ENTITY_FILES) {
        // Le nom du fichier voyage dans l'attendu : un échec dit LEQUEL manque.
        expect({ file, found: entitySource(file) !== null }).toEqual({ file, found: true })
      }
    })

    it('aucune entité personnelle n’est importée ni nommée par le service de reprise', () => {
      const forbidden = [
        'GoogleConnectionEntity',
        'MicrosoftConnectionEntity',
        'ChatMessageEntity',
        'UserPreferenceEntity',
        'SavedViewEntity',
        'google_connections',
        'microsoft_connections',
        'chat_messages',
        'user_preferences',
        'saved_views',
      ]
      for (const name of forbidden) {
        expect(service).not.toContain(name)
      }
    })

    it('ce qui reste personnel est NOMMÉ au contrat, et aucune de ces natures n’est transférable', () => {
      expect(PORTFOLIO_PERSONAL_KINDS.length).toBeGreaterThan(0)
      for (const personal of PORTFOLIO_PERSONAL_KINDS) {
        expect(PORTFOLIO_HANDOVER_KINDS as readonly string[]).not.toContain(personal)
      }
    })
  })

  /* ------------------------------------------------------------------ */
  /*  4. Ce qui a été appris appartient à l'espace                       */
  /* ------------------------------------------------------------------ */

  describe('ce qui a été appris survit au départ, sans être réécrit', () => {
    it('angles, notes, mémoire épinglée et faits d’accès se lisent par `workspace_id`', () => {
      for (const file of LEARNED_ENTITY_FILES) {
        const source = entitySource(file)
        // Le nom du fichier voyage dans l'attendu : un échec dit LEQUEL a bougé.
        expect({ file, scoped: source !== null && declaresColumn(source, 'workspace_id') }).toEqual({
          file,
          scoped: true,
        })
      }
    })

    it('… et aucune n’est réécrite par le transfert — leur AUTEUR reste leur auteur', () => {
      for (const name of ['AttackAngleEntity', 'NoteEntity', 'MemoryPinnedFactEntity', 'AccessFactEntity']) {
        expect(service).not.toContain(name)
      }
    })
  })

  /* ------------------------------------------------------------------ */
  /*  5. La table de correspondance couvre le contrat, et rien de plus   */
  /* ------------------------------------------------------------------ */

  describe('la table de correspondance', () => {
    it('couvre exactement les natures du contrat', () => {
      expect(Object.keys(PORTFOLIO_HOLDING_COLUMNS).sort()).toEqual([...PORTFOLIO_HANDOVER_KINDS].sort())
    })

    it('chaque nature repose sur une table qui porte SA colonne de porteur ET `workspace_id`', () => {
      for (const kind of PORTFOLIO_HANDOVER_KINDS) {
        // #4158.29 — `actions` / `followups` n'ont pas de `workspace_id` : elles sont bornées par le
        // compte, garde dédiée plus bas.
        if (kind === 'actions' || kind === 'followups') continue
        const source = entitySource(ENTITY_FILE_BY_KIND[kind]) ?? ''
        // ⚠️ LA règle : sans `workspace_id`, l'écriture ne peut pas être bornée
        // à l'espace. C'est exactement pourquoi `action_plan_items` — qui porte
        // pourtant un `assigned_to` — n'est PAS une nature transférable.
        expect({
          kind,
          owner: declaresColumn(source, PORTFOLIO_HOLDING_COLUMNS[kind]),
          scoped: declaresColumn(source, 'workspace_id'),
        }).toEqual({ kind, owner: true, scoped: true })
      }
    })

    it('… et le contrôle sait dire NON : `action_plan_items` porte un responsable mais aucune borne d’espace', () => {
      const source = entitySource('action-plan-item.entity.ts')
      expect(source).not.toBeNull()
      expect(declaresColumn(source ?? '', 'assigned_to')).toBe(true)
      expect(declaresColumn(source ?? '', 'workspace_id')).toBe(false)
    })

    it('#4158.29 — … donc ses deux natures sont bornées PAR LE COMPTE, jamais par le seul porteur', () => {
      expect(PORTFOLIO_HANDOVER_KINDS as readonly string[]).toContain('actions')
      expect(PORTFOLIO_HANDOVER_KINDS as readonly string[]).toContain('followups')
      // la borne d'espace passe par la sous-requête sur `accounts`
      expect(service).toMatch(/account_id IN \(SELECT a\.id FROM accounts a WHERE a\.workspace_id = :workspaceId\)/)
      // … et la réécriture est UN update de query builder qui porte cette même borne
      expect(service).toMatch(/this\.actionItems\.createQueryBuilder\(\)\.update\(\)/)
    })

    it('… et le contrôle sait dire NON : une réécriture par le seul porteur serait repérée', () => {
      const fautif = `await this.actionItems.update({ assigned_to: from }, { assigned_to: to })`
      expect(fautif).not.toMatch(/createQueryBuilder\(\)\.update\(\)/)
      expect(fautif).not.toContain('FROM accounts')
    })
  })
})
