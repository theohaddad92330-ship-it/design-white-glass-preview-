import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceRoleValues, can } from '@bellum/contracts'

/**
 * LE DROIT SUR LES NOTES DE FRAIS (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une note de frais est de l'argent qu'on rend à quelqu'un, et sa validation
 * corrige la marge d'une mission. Deux gestes de poids très différent vivent
 * donc sur le même écran, et ils ne peuvent pas porter le même droit :
 *
 *  · **lire** la file — qui attend, depuis quand, pour quel client — est une
 *    question d'organisation. La fermer à qui n'a pas `finance:read` cacherait
 *    la file à ceux qui la font avancer ;
 *  · **décider** engage un remboursement. C'est le poids de « marquer un mois
 *    facturé », qui porte déjà `finance:write`.
 *
 * GA-05 COMPTE les routes nues, elle ne dit pas lesquelles manquent — un
 * cliquet qui baisse ne protège pas la route qu'on vient de couvrir. Ce test lit
 * la SOURCE du contrôleur, seule façon de voir un décorateur qu'aucun test de
 * comportement n'exerce.
 */

const CONTROLLER = join(__dirname, 'expense-reports.controller.ts')
const POLICY_CONTROLLER = join(__dirname, 'expense-policies.controller.ts')
const SERVICE = join(__dirname, 'expense-reports.service.ts')

/**
 * ⚠️ MISE À JOUR DU 31/08/2026 — le DÉPÔT ouvre une troisième famille de droit.
 *
 * La version précédente affirmait « AUCUNE route n'écrit sans `finance:write` »,
 * et c'était juste tant que les seules écritures étaient des DÉCISIONS. Le
 * chemin de dépôt en ajoute quatre qui n'en sont pas : saisir sa note, la
 * corriger, la soumettre, la retirer. Ce sont des gestes du DÉPOSANT sur sa
 * propre demande — les mettre sous `finance:write` fermerait la porte à tous
 * ceux qui se déplacent et n'ont aucune raison de voir la marge.
 *
 * L'invariant tenu reste le même, énoncé plus finement : **décider engage de
 * l'argent, donc `finance:write` ; demander n'engage rien, donc
 * `records:write`.** Aucune route n'est nue, et le test ci-dessous vérifie
 * l'appartenance de CHAQUE écriture à l'une des deux familles — ce qu'un simple
 * compte ne faisait pas.
 */
const ROUTES: { route: string; decorator: string }[] = [
  { route: '@Get()', decorator: "@RequirePermission('finance:read', 'records:write')" },
  { route: "@Get(':id')", decorator: "@RequirePermission('finance:read', 'records:write')" },
  { route: '@Post()', decorator: "@RequirePermission('records:write')" },
  { route: "@Put(':id')", decorator: "@RequirePermission('records:write')" },
  { route: "@Post(':id/submit')", decorator: "@RequirePermission('records:write')" },
  { route: "@Post(':id/withdraw')", decorator: "@RequirePermission('records:write')" },
  { route: "@Post(':id/validate')", decorator: "@RequirePermission('finance:write')" },
  { route: "@Post(':id/reject')", decorator: "@RequirePermission('finance:write')" },
  /*
   * 31/08/2026 — le stockage de fichiers. Déposer une pièce, c'est préparer la
   * décision de remboursement : même poids que la prendre.
   *
   * ⚠️ RÉVISÉ le 09/09/2026 (#1827), et la raison est mesurée, pas théorique.
   * L'écran fait désormais COMMENCER une note par le dépôt de ses
   * justificatifs, et celui qui a la pile de tickets est un commercial :
   * `sales`, `sales_ops`, `member` et `recruiter` portent `records:write` mais
   * PAS `finance:write` — chacun se prenait un 403 sur son propre dépôt.
   *
   * L'élargissement ne dilue pas l'invariant, il le précise : décider engage
   * de l'argent, demander n'engage rien. Il est borné par DEUX verrous que ce
   * fichier vérifie plus bas — la note doit être LA SIENNE, et elle ne doit
   * pas être encore décidée.
   */
  { route: "@Post(':id/attachments')", decorator: "@RequirePermission('records:write', 'finance:write')" },
  // OUVRIR un justificatif, c'est LIRE le montant qu'il porte. Rendre le
  // fichier à qui n'a pas `finance:read` défairait la rédaction des montants
  // en un clic — une porte fermée à côté d'une fenêtre ouverte.
  {
    route: "@Get(':id/attachments/:attachmentId/download')",
    decorator: "@RequirePermission('finance:read')",
  },
]

/**
 * Les écritures qui portent le droit FINANCIER — DÉRIVÉES de `ROUTES`, jamais
 * réécrites à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE LISTE NE S'ÉCRIT PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle s'écrivait à la main, et le 01/09/2026 deux lots ont fusionné : l'un
 * avait ajouté le dépôt d'un justificatif sous `finance:write` (« déposer une
 * pièce, c'est préparer la décision de remboursement »), l'autre tenait une
 * liste de deux décisions. Les deux étaient vertes chez elles et **rouges
 * ensemble** — `ROUTES` déclarait trois routes financières, la liste en
 * comptait deux.
 *
 * Une liste recopiée à côté de sa source diverge le jour où quelqu'un touche
 * l'une des deux (loi 1 du tome 7). La dérivation vit donc à un seul endroit :
 * `ROUTES`. Ajouter une route financière ne demande plus qu'un geste.
 */
const FINANCE_WRITES = ROUTES.filter(r => r.decorator === "@RequirePermission('finance:write')").map(r => r.route)

/**
 * #1827 (09/09/2026) — la TROISIÈME famille, et pourquoi elle doit être nommée.
 *
 * Jusqu'ici toute écriture tombait dans l'une de deux familles : décider
 * (`finance:write`) ou demander (`records:write`). Le dépôt d'un justificatif
 * n'est ni tout à fait l'un ni tout à fait l'autre — c'est une demande, mais
 * sur un dossier d'argent. Il porte donc les DEUX droits en « l'un suffit »,
 * et l'écart se rattrape par un contrôle de PROPRIÉTÉ dans le contrôleur.
 *
 * La faire passer pour l'une des deux aurait été plus court et faux : le test
 * ci-dessous n'aurait plus rien dit du verrou qui borne réellement la route.
 * Une garde décrit ce qui est, pas ce qui serait plus simple à écrire.
 */
const BOUNDED_WRITES = ROUTES.filter(r => r.decorator === "@RequirePermission('records:write', 'finance:write')").map(
  r => r.route,
)

describe('les notes de frais déclarent leur droit', () => {
  const source = readFileSync(CONTROLLER, 'utf8')

  it('lit bien le contrôleur — un fichier vide passerait au vert', () => {
    expect(source.length).toBeGreaterThan(1500)
    expect(source).toContain("@Controller('expenses/reports')")
  })

  it('monte la garde qui LIT les permissions — sans elle, les décorateurs sont sourds', () => {
    // GA-05 bis : `@RequirePermission` sans `WorkspacePermissionGuard` ne
    // refuse rien. Le décorateur seul est décoratif.
    expect(source).toContain('@UseGuards(JwtGuard, WorkspacePermissionGuard)')
  })

  it.each(ROUTES)('$route porte $decorator', ({ route, decorator }) => {
    const at = source.indexOf(route)
    expect(at).toBeGreaterThan(-1)
    // On regarde la fenêtre qui SUIT la route, pas le fichier entier : sinon un
    // décorateur posé sur une AUTRE route ferait passer celle-ci.
    expect(source.slice(at, at + 200)).toContain(decorator)
  })

  it('la garde sait dire NON — une route inventée n’est pas dans le fichier', () => {
    expect(source.indexOf("@Post(':id/rembourser')")).toBe(-1)
  })

  it('AUCUNE route d’écriture n’est NUE, et chacune tombe dans la bonne famille', () => {
    // Le motif à empêcher : une route d'écriture ajoutée plus tard sous le
    // droit de LECTURE, parce que la porte y était déjà ouverte.
    const writes = [...source.matchAll(/@(Post|Patch|Put|Delete)\([^)]*\)/g)]
    // La garde LIT quelque chose : le compte est vérifié pour qu'une regex qui
    // cesserait de mordre ne passe pas au vert.
    //
    // ⚠️ SEPT depuis le 01/09/2026, et pas six. Deux lots ont fusionné : l'un
    // livrait le dépôt d'un justificatif (`@Post(':id/attachments')`), l'autre
    // les cinq gestes du déposant. Chacun comptait juste chez lui. Relever ce
    // nombre demande de dire LAQUELLE a été ajoutée — c'est fait ici, et c'est
    // tout l'intérêt d'un cliquet plutôt que d'un `>=`.
    expect(writes.length).toBe(7)
    for (const write of writes) {
      const window = source.slice(write.index ?? 0, (write.index ?? 0) + 200)
      const route = write[0] as string
      const expected = FINANCE_WRITES.includes(route)
        ? "@RequirePermission('finance:write')"
        : BOUNDED_WRITES.includes(route)
          ? "@RequirePermission('records:write', 'finance:write')"
          : "@RequirePermission('records:write')"
      expect(window).toContain(expected)
    }
  })

  it('les écritures financières du fichier sont EXACTEMENT celles que `ROUTES` déclare', () => {
    // Sait dire NON : si quelqu'un fait glisser « soumettre » sous le droit
    // financier sans le déclarer, le fichier en compte une de plus que la table.
    // La garde LIT : `ROUTES` en déclare au moins deux, sinon elle ne trie rien.
    expect(FINANCE_WRITES.length).toBeGreaterThanOrEqual(2)
    // #1827 — la troisième famille LIT quelque chose : si elle tombait à zéro,
    // la branche qui la trie ci-dessus ne serait jamais exercée.
    expect(BOUNDED_WRITES.length).toBeGreaterThanOrEqual(1)
    for (const route of FINANCE_WRITES) expect(source).toContain(route)
    const financeWrites = [...source.matchAll(/@RequirePermission\('finance:write'\)/g)]
    expect(financeWrites.length).toBe(FINANCE_WRITES.length)
  })
})

describe('le barème déclare son droit, et il n’est pas celui du dépôt', () => {
  const source = readFileSync(POLICY_CONTROLLER, 'utf8')

  it('lit bien le contrôleur du barème', () => {
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toContain("@Controller('expenses/policies')")
    expect(source).toContain('@UseGuards(JwtGuard, WorkspacePermissionGuard)')
  })

  it('se LIT avec le droit d’organisation, s’ÉCRIT avec le droit financier', () => {
    // Lire le barème explique POURQUOI une note est « non vérifiée » : le
    // cacher à qui fait avancer la file lui laisserait un verdict sans raison.
    // L'écrire décide de ce qu'on rembourse — même poids que valider.
    const read = source.indexOf('@Get()')
    expect(read).toBeGreaterThan(-1)
    expect(source.slice(read, read + 200)).toContain("@RequirePermission('finance:read', 'records:write')")

    const write = source.indexOf('@Put()')
    expect(write).toBeGreaterThan(-1)
    expect(source.slice(write, write + 200)).toContain("@RequirePermission('finance:write')")
  })

  it('n’expose AUCUNE autre écriture — un barème ne se supprime pas', () => {
    // On archive, on ne supprime pas : une révision de barème a jugé des notes,
    // et l'effacer changerait un verdict déjà rendu.
    expect([...source.matchAll(/@(Post|Patch|Put|Delete)\(/g)]).toHaveLength(1)
  })
})

describe('le droit choisi ferme bien les bons sièges', () => {
  it('les sièges SANS `finance:write` ne peuvent pas décider', () => {
    const deciders = workspaceRoleValues.filter(role => can(role, [], 'finance:write'))
    const rest = workspaceRoleValues.filter(role => !can(role, [], 'finance:write'))
    // La garde LIT quelque chose : les deux camps existent, sinon le droit
    // choisi ne trierait personne et ce test serait décoratif.
    expect(deciders.length).toBeGreaterThan(0)
    expect(rest.length).toBeGreaterThan(0)
  })

  it('lire la file reste possible sans droit financier — c’est le but du OU', () => {
    // Au moins un siège porte `records:write` sans porter `finance:read` : c'est
    // exactement celui à qui l'écran servirait à rien s'il était fermé.
    const organisers = workspaceRoleValues.filter(
      role => can(role, [], 'records:write') && !can(role, [], 'finance:read'),
    )
    expect(organisers.length).toBeGreaterThan(0)
  })
})

describe('la rédaction financière n’est pas contournable', () => {
  const service = readFileSync(SERVICE, 'utf8')

  it('lit bien le service', () => {
    expect(service.length).toBeGreaterThan(4000)
  })

  it('le détail passe par `redactExpenseReportFinance`, jamais par un tri à la main', () => {
    // Trois rédactions écrites à la main avaient déjà divergé dans ce dépôt.
    expect(service).toContain('return redactExpenseReportFinance(view, canReadFinance)')
  })

  it('le DROIT voyage avec la réponse de la liste', () => {
    // Sans `canReadFinance` dans la charge, « pas le droit » et « pas mesuré »
    // deviennent le même `null` et l'écran ne peut plus les dire différemment.
    //
    // ⚠️ 31/08/2026 : la charge a gagné la pagination, donc l'objet retourné
    // n'est plus une ligne unique et `canReadFinance }` ne mordait plus. On
    // vérifie le CHAMP dans le littéral de retour, pas sa position — une garde
    // qui s'accroche à une accolade tombe au premier champ ajouté.
    expect(/return \{[\s\S]{0,400}\n\s+canReadFinance,/.test(service)).toBe(true)
  })

  it('aucun montant ne retombe sur zéro à la place de `null`', () => {
    // Le motif interdit : `canReadFinance ? x : 0`. Un zéro se lirait « la note
    // fait 0 € », c'est-à-dire une information fausse.
    expect(/canReadFinance\s*\?[^:]*:\s*0\b/.test(service)).toBe(false)
    // ⚠️ Ce cas épinglait le TERNAIRE `canReadFinance ? … : null` écrit à la
    // main. Il a été retiré le 31/08/2026 parce qu'une autre garde le refusait :
    // « la rédaction financière passe par `redactFinance`, et par lui seul »
    // (D45, `finance-redaction-single-path.spec.ts`). Deux gardes se
    // contredisaient — l'une exigeait le motif que l'autre interdit.
    //
    // Ce qui est gardé ici reste le même INVARIANT : le montant se retire, il ne
    // se replie jamais sur zéro. Ce qui change est la preuve — on vérifie que la
    // porte unique est empruntée, plutôt qu'une écriture particulière.
    expect(service).toContain('redactFinance(')
    expect(service).not.toContain(': null,\n    }))')
  })
})

/**
 * #1827 — les deux verrous qui BORNENT l'élargissement.
 *
 * Ouvrir la route à `records:write` sans eux donnerait à tout membre le droit
 * de joindre une pièce à la note de n'importe qui. Ce test lit la SOURCE,
 * seule façon de voir un contrôle qu'aucun test de comportement n'exerce
 * encore — c'est la même méthode que le reste de ce fichier.
 */
describe('#1827 — le dépôt élargi reste borné', () => {
  const controller = readFileSync(CONTROLLER, 'utf8')
  const service = readFileSync(SERVICE, 'utf8')

  it('le contrôleur exige la PROPRIÉTÉ de la note pour qui n’a pas `finance:write`', () => {
    expect(controller).toContain('canWriteFinance')
    expect(controller).toContain('if (!canWriteFinance) await this.reports.assertBearerIs(')
  })

  it('le contrôle de propriété passe AVANT le stockage — sinon un refus laisse des octets orphelins', () => {
    const gate = controller.indexOf('assertBearerIs(')
    const put = controller.indexOf('this.storage.put(', gate === -1 ? 0 : gate)
    expect(gate).toBeGreaterThan(-1)
    expect(put).toBeGreaterThan(gate)
  })

  it('le service compare bien au porteur, dans le bon espace', () => {
    expect(service).toContain('async assertBearerIs(')
    expect(service).toMatch(/SELECT bearer_user_id[\s\S]*?WHERE id = \$1 AND workspace_id = \$2/)
    expect(service).toContain('ForbiddenException')
  })

  it('le second verrou — une note DÉCIDÉE refuse toute pièce — n’a pas bougé', () => {
    expect(service).toContain('Cette note a déjà été décidée')
  })

  /*
   * Le témoin : ces rôles portent `records:write` et pas `finance:write`.
   * S'ils venaient à porter les deux, l'élargissement perdrait son sens et ce
   * test le dirait — une garde doit lire quelque chose de vivant.
   */
  it('les rôles visés portent bien `records:write` sans `finance:write`', () => {
    for (const role of ['sales', 'sales_ops', 'member', 'recruiter'] as const) {
      expect(workspaceRoleValues).toContain(role)
      expect(can(role, [], 'records:write')).toBe(true)
      expect(can(role, [], 'finance:write')).toBe(false)
    }
  })
})
