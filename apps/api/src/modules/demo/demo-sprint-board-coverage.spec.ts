import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FOCUS_STALE_DAYS, SPRINT_LANE_LEVELS, SPRINT_LANES, SPRINT_LEVELS, type SprintLevel } from '@bellum/contracts'
import { DEMO_SPRINT_BOARD_COVERAGE } from './demo-coverage'
import {
  DEMO_ACTIVITIES,
  DEMO_DOSSIERS,
  DEMO_SPRINT_PARTNER_ROUTE_PARTNER,
  DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER,
} from './demo-dataset'

/**
 * LE BOARD D'EFFORT EN DEUX FILES (`/sprints`, tome 5 §28-31, GA-185).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `accounts.sprint` (`text`, `CHECK … IN ('focus','extension','volume','no_go')`,
 * migration `1789996184270-AccountSprint.ts`) est `NULL` par défaut, DÉLIBÉRÉMENT
 * — « aucun compte existant n'entre dans un sprint sans que quelqu'un l'y
 * mette ». Avant ce lot, AUCUNE ligne du semis ne l'écrivait : les six comptes
 * de la salle valaient tous `NULL`, `SprintsService.board()` ne renvoie que
 * les comptes `sprint IS NOT NULL`, et les DEUX files du board
 * (`SPRINT_LANE_LEVELS` — arbitrage = focus/no_go, exécution =
 * extension/volume) s'ouvraient donc VIDES en démonstration, pas seulement
 * l'une des deux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉPARTITION, ET SA COHÉRENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Depuis le 01/10/2026 (Louis), la salle porte SIX comptes cibles, un par
 * niveau de sprint :
 *  - Société Générale → `no_go`, motif écrit : direction informatique
 *    verrouillée, grandes ESN déjà installées — cohérent avec sa PROPRE
 *    `priority_justification` (« l'accès est le point dur »).
 *  - SNCF → `partner_route` (BEL-SC-228, #3257.4) SANS partenaire lié : le cas
 *    « Partenaire à désigner ». BNP Paribas → `partner_route` AVEC partenaire
 *    lié (`DEMO_SPRINT_PARTNER_ROUTE_PARTNER`, CGI, observée par son brief —
 *    décision Louis 04/10/2026 : plus d'ESN fictive).
 *  - Groupe BPCE → `volume` : cadence légère, touche récente au journal (#3509) ;
 *    il porte aussi le partenaire déclaré qui déclenche `suggested_switch`
 *    (#3296).
 *  - ENGIE → `extension`, Alstom → `focus`, TotalEnergies → `watch` (porte
 *    `parked`/`bad_timing`) : arbitrages de démonstration tirés des briefs
 *    commerciaux. ENGIE est le compte de la file exécution SANS aucun échange
 *    journalisé : c'est lui que compte la carte « sans mouvement » (#3262.24).
 *
 * Tant que la salle n'a pas six dossiers, les niveaux `focus`, `extension` et
 * `watch` ne sont pas exigés (`SPRINT_LEVELS_PENDING_NEW_DOSSIERS`) ; à six, les
 * six niveaux le sont.
 *
 */
describe('couverture du board d’effort (sprint) — les deux files non vides', () => {
  const dossiersBySprint = new Map<string, (typeof DEMO_DOSSIERS)[number]>(
    DEMO_DOSSIERS.map(dossier => [dossier.account.sprint ?? '', dossier]),
  )

  /** Niveaux BLOQUÉS (voir l'en-tête) tant que la salle n'a pas ses six dossiers. */
  const SPRINT_LEVELS_PENDING_NEW_DOSSIERS: readonly string[] =
    DEMO_DOSSIERS.length >= 6 ? [] : ['focus', 'extension', 'watch']
  /** Les niveaux que la salle DOIT occuper aujourd'hui. */
  const SEEDED_LEVELS = SPRINT_LEVELS.filter(level => !SPRINT_LEVELS_PENDING_NEW_DOSSIERS.includes(level))

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(SPRINT_LEVELS.length).toBe(6)
    expect(SPRINT_LANES.length).toBe(2)
    expect(DEMO_DOSSIERS.length).toBeGreaterThanOrEqual(3)
  })

  it('chaque dossier réel porte un niveau de sprint VALIDE — jamais `null`', () => {
    for (const dossier of DEMO_DOSSIERS) {
      expect(dossier.account.sprint).not.toBeNull()
      expect(SPRINT_LEVELS as readonly string[]).toContain(dossier.account.sprint)
    }
  })

  it('occupe tous les niveaux atteignables, pas un seul — sinon une file entière reste vide', () => {
    const levels = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.sprint))
    for (const level of SEEDED_LEVELS) expect(levels.has(level)).toBe(true)
  })

  // Décision Louis 04/10/2026 — plus AUCUNE ESN fictive « (exemple) » : les deux
  // partenaires déclarés sont de VRAIES ESN observées par le brief du compte.
  const briefEsnNames = (slug: string): string[] => {
    const brief = JSON.parse(readFileSync(join(__dirname, 'data/commercial-briefs', `${slug}.json`), 'utf8')) as {
      esn: { name: string }[]
    }
    return brief.esn.map(entry => entry.name)
  }

  it('`partner_route` est seedé (#3257.4) : BNP Paribas, avec UN partenaire déclaré — une vraie ESN observée par son brief', () => {
    const routed = DEMO_DOSSIERS.filter(dossier => dossier.account.sprint === 'partner_route').map(
      dossier => dossier.account.company_name,
    )
    expect(routed).toContain('BNP Paribas')
    expect(DEMO_SPRINT_PARTNER_ROUTE_PARTNER.accountName).toBe('BNP Paribas')
    expect(DEMO_SPRINT_PARTNER_ROUTE_PARTNER.name).not.toMatch(/exemple/i)
    expect(briefEsnNames('bnp-paribas')).toContain(DEMO_SPRINT_PARTNER_ROUTE_PARTNER.name)
    expect(DEMO_SPRINT_PARTNER_ROUTE_PARTNER.relationship).toBe('partner')
    // Le semis l'écrit VRAIMENT, sur le bon compte — un jeu de données sans
    // appelant est le motif que le dépôt a déjà payé.
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_SPRINT_PARTNER_ROUTE_PARTNER')
    expect(seed).toMatch(/INSERT INTO account_partners[\s\S]{0,400}'declared'/)
  })

  it('#3296 (#3269.6) — Groupe BPCE (volume) porte un partenaire déclaré qui déclenche `suggested_switch`', () => {
    const bpce = dossiersBySprint.get('volume')
    expect(bpce?.account.company_name).toBe('Groupe BPCE')
    expect(DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.accountName).toBe('Groupe BPCE')
    expect(DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.name).not.toMatch(/exemple/i)
    expect(briefEsnNames('bpce')).toContain(DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.name)
    expect(DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.relationship).toBe('partner')
    // `volume` fait partie des niveaux d'où `shouldSwitch` propose la route
    // partenaire — jamais depuis `partner_route` lui-même.
    expect(['focus', 'extension', 'volume', 'watch']).toContain(bpce?.account.sprint)
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER')
  })

  it('#3296 (#3257.4) — « Partenaire à désigner » est démontré : SNCF, en `partner_route` sans AUCUN partenaire lié', () => {
    const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
    expect(sncf?.account.sprint).toBe('partner_route')
    // Aucune écriture de partenaire de route du semis ne vise SNCF — c'est ce
    // qui laisse `partner_name` vide sur le board.
    const linkedAccounts = [
      DEMO_SPRINT_PARTNER_ROUTE_PARTNER.accountName,
      DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.accountName,
    ]
    expect(linkedAccounts).not.toContain('SNCF')
    // L'écran écrit bien l'état quand `partner_name` est vide (pas de vide muet).
    const card = readFileSync(join(__dirname, '../../../../web/src/features/sprints/view/SprintBoard.tsx'), 'utf8')
    expect(card).toMatch(/account\.sprint === 'partner_route'[\s\S]{0,300}card\.partnerToAssign/)
  })

  it('« Veille » transcrit sa PROPRE justification — la condition de réveil n’est pas inventée (BLOQUÉ tant que la salle n’a pas six dossiers)', () => {
    const watching = dossiersBySprint.get('watch')
    if (!watching) {
      expect(SPRINT_LEVELS_PENDING_NEW_DOSSIERS).toContain('watch')
      return
    }
    expect((watching.account.sprint_promotion_condition ?? '').length).toBeGreaterThan(20)
  })

  it('remplit les DEUX files — arbitrage (focus/no_go) et exécution (extension/volume)', () => {
    for (const lane of SPRINT_LANES) {
      const levelsInLane = SPRINT_LANE_LEVELS[lane] as readonly SprintLevel[]
      const accountsInLane = DEMO_DOSSIERS.filter(dossier =>
        levelsInLane.includes(dossier.account.sprint as SprintLevel),
      )
      expect(accountsInLane.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('le seul compte `no_go` porte un motif de sortie NON VIDE — sinon l’écran ne dit pas pourquoi', () => {
    const exited = DEMO_DOSSIERS.filter(dossier => dossier.account.sprint === 'no_go')
    expect(exited.length).toBeGreaterThanOrEqual(1)
    for (const dossier of exited) {
      expect((dossier.account.sprint_exit_reason ?? '').trim().length).toBeGreaterThan(20)
    }
  })

  it('un compte qui n’est PAS `no_go` ne porte aucun motif de sortie — le champ appartient à la sortie', () => {
    for (const dossier of DEMO_DOSSIERS) {
      if (dossier.account.sprint === 'no_go') continue
      expect(dossier.account.sprint_exit_reason).toBeNull()
    }
  })

  it('sait dire NON — un jeu à un seul niveau viderait une des deux files', () => {
    // Contrepartie obligatoire : la partition doit pouvoir échouer. Un jeu où
    // TOUS les comptes seraient `focus` ne remplit que la file arbitrage.
    const allFocus = SPRINT_LANES.map(lane => (SPRINT_LANE_LEVELS[lane] as readonly SprintLevel[]).includes('focus'))
    const filledLanes = allFocus.filter(Boolean).length
    expect(filledLanes).toBeLessThan(SPRINT_LANES.length)
  })

  it('cohérence entre écrans — le compte `no_go` recoupe sa propre analyse d’accès', () => {
    const societeGenerale = dossiersBySprint.get('no_go')
    expect(societeGenerale?.account.company_name).toBe('Société Générale')
    expect(societeGenerale?.account.priority_justification).toMatch(/verrouillée/)
  })

  it('la capacité est classée dans le registre de couverture, avec une raison qui tient', () => {
    expect(DEMO_SPRINT_BOARD_COVERAGE.state).toBe('seede')
    expect(DEMO_SPRINT_BOARD_COVERAGE.reason.length).toBeGreaterThan(60)
  })
})

/**
 * La contrepartie « une table déclarée seedée l'est vraiment » (même esprit
 * que `demo-coverage.spec.ts`), à la maille des DEUX colonnes `sprint` /
 * `sprint_exit_reason` : sans elle, remplir `demo-dataset.ts` sans brancher
 * `demo-seed.service.ts` ferait passer cette garde-ci au vert tout en laissant
 * les deux colonnes NULL en base — exactement le défaut « code juste que
 * personne n'appelle ».
 */
describe('le seed écrit vraiment sprint / sprint_exit_reason', () => {
  it('`demo-seed.service.ts` pose les deux colonnes à la création du compte', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toMatch(/sprint:\s*dossier\.account\.sprint/)
    expect(source).toMatch(/sprint_exit_reason:\s*dossier\.account\.sprint_exit_reason/)
  })
})

/**
 * #3262.24 (recette 30/09 : la carte « sans mouvement » du pilotage valait 0
 * en démo, donc ne se voyait jamais). `PilotageService.reviewSignals` compte
 * les comptes de la file EXÉCUTION sans activité depuis `FOCUS_STALE_DAYS` :
 * au moins un dossier de la salle doit l'être.
 */
describe('la salle montre un compte actif sans mouvement (#3262.24)', () => {
  it('au moins un dossier de la file exécution n’a aucune activité plus récente que le seuil', () => {
    const execution = new Set<string>(SPRINT_LANE_LEVELS.execution)
    const silent = DEMO_DOSSIERS.filter(d => d.account.sprint && execution.has(d.account.sprint)).filter(d =>
      DEMO_ACTIVITIES.filter(a => a.company === d.account.company_name).every(a => a.daysAgo > FOCUS_STALE_DAYS),
    )
    expect(silent.map(d => d.account.company_name)).toContain('ENGIE')
  })

  it('un compte récemment actif existe — il n’est PAS compté « sans mouvement » (la garde sait dire non)', () => {
    // Le dossier récemment actif de la file exécution (`extension`) a quitté la
    // salle le 01/10/2026 (BLOQUÉ, voir l'en-tête) : SNCF (`partner_route`,
    // hors file exécution) porte la preuve que la garde distingue un compte
    // actif d'un compte silencieux.
    const active = DEMO_DOSSIERS.filter(d =>
      DEMO_ACTIVITIES.some(a => a.company === d.account.company_name && a.daysAgo <= FOCUS_STALE_DAYS),
    )
    expect(active.map(d => d.account.company_name)).toContain('SNCF')
    const execution = new Set<string>(SPRINT_LANE_LEVELS.execution)
    const activeInExecution = active.filter(d => d.account.sprint && execution.has(d.account.sprint))
    if (DEMO_DOSSIERS.length >= 6) expect(activeInExecution.length).toBeGreaterThanOrEqual(1)
  })
})
