import { describe, expect, it, vi } from 'vitest'
import { TAB_KEYS, sectionOfTab, subSectionAnchorId, type TabId } from './components/AccountDetailTabsBar'
import {
  accountDetailSearchSchema,
  buildTabMappingTable,
  capturedLegacyTabNotice,
  clearCapturedLegacyTab,
  contactsFiltersFromSearch,
  contactsFiltersToSearch,
  resolveLegacyTabNotice,
} from './accountDetailSearch'

/** Ce que TanStack Router ferait d'une URL `/accounts/:id?tab=…`. */
function tabOf(raw: unknown): string | undefined {
  return accountDetailSearchSchema.parse(raw).tab
}

/** Même chose, typée `TabId` — nécessaire pour passer le résultat à
 *  `sectionOfTab` / `subSectionAnchorId`, qui n'acceptent pas un `string` nu. */
function resolvedTab(raw: unknown): TabId | undefined {
  return accountDetailSearchSchema.parse({ tab: raw }).tab
}

describe('accountDetailSearch — un lien vers un onglet tombe au bon endroit', () => {
  it('accepte les clés canoniques', () => {
    for (const key of ['overview', 'contacts', 'organigramme', 'coverage', 'sites', 'veille', 'plan', 'evaluation']) {
      expect(tabOf({ tab: key })).toBe(key)
    }
  })

  it('traduit les libellés intuitifs de l’URL vers la clé canonique', () => {
    // Un commercial qui voit l'onglet « Score » et tape `?tab=score` doit
    // arriver sur le score — pas se faire silencieusement renvoyer sur l'aperçu.
    expect(tabOf({ tab: 'score' })).toBe('evaluation')
    expect(tabOf({ tab: 'influence' })).toBe('organigramme')
    expect(tabOf({ tab: 'carte-d-influence' })).toBe('organigramme')
    expect(tabOf({ tab: 'signaux' })).toBe('veille')
    // #3676 — les anciens liens ?tab=needs|besoins aboutissent à « Signaux et besoins ».
    expect(tabOf({ tab: 'needs' })).toBe('veille')
    expect(tabOf({ tab: 'besoins' })).toBe('veille')
    expect(tabOf({ tab: 'projects' })).toBe('projects')
    // #3677 — l'ancien sous-onglet Programmes mène aux signaux, avec la notice.
    expect(tabOf({ tab: 'programs' })).toBe('veille')
    expect(resolveLegacyTabNotice('programs')).toEqual({ value: 'programs', tab: 'veille', section: 'opportunities' })
    expect(tabOf({ tab: 'zones-blanches' })).toBe('coverage')
  })

  it('est tolérant à la casse et aux espaces/underscores', () => {
    expect(tabOf({ tab: 'Score' })).toBe('evaluation')
    expect(tabOf({ tab: 'Zones blanches' })).toBe('coverage')
    expect(tabOf({ tab: 'plan_action' })).toBe('plan')
  })

  it('accepte `?tab=missions` — l’onglet neuf est atteignable par un lien partagé', () => {
    // Ajouté en FIN de `TAB_KEYS` (BEL-BO-006) : le contrat du paramètre d'URL
    // ne bouge pas pour les treize précédents, et celui-ci en fait partie.
    expect(tabOf({ tab: 'missions' })).toBe('missions')
    expect(tabOf({ tab: 'Missions' })).toBe('missions')
  })

  /**
   * #2115 — LES SEPT SECTIONS SONT AUSSI DES ENTRÉES D'URL (D8, 14/09/2026).
   *
   * Les quatorze clés d'onglet ne bougent pas — c'est la moitié du sujet, et le
   * test au-dessus le tient. Mais le commercial LIT maintenant sept noms de
   * section : un lien écrit à la main (`?tab=personnes`) doit tomber sur la
   * section, pas sur l'onglet par défaut en silence. Chaque nom de section
   * résout vers sa PREMIÈRE sous-partie, c'est-à-dire l'endroit où un clic sur
   * la section atterrit.
   */
  it('#2115.14-20 — un nom de SECTION ouvre sa première sous-partie', () => {
    expect(tabOf({ tab: 'synthese' })).toBe('overview')
    expect(tabOf({ tab: 'perimetres' })).toBe('sites')
    expect(tabOf({ tab: 'opportunites' })).toBe('veille')
    expect(tabOf({ tab: 'personnes' })).toBe('organigramme')
    expect(tabOf({ tab: 'ecosysteme' })).toBe('partners')
    expect(tabOf({ tab: 'historique-preuves' })).toBe('missions')
    // Les noms anglais aussi : l'interface est bilingue, les liens qu'on tape
    // le sont donc aussi.
    expect(tabOf({ tab: 'people' })).toBe('organigramme')
    expect(tabOf({ tab: 'ecosystem' })).toBe('partners')
  })

  it('⚠️ et les ACCENTS ne perdent personne — « périmètres » n’est pas « perimetres »', () => {
    // La casse était pliée depuis le début, les diacritiques ne l'étaient pas :
    // un lien copié depuis un libellé lu à l'écran les porte pourtant toujours.
    expect(tabOf({ tab: 'Périmètres' })).toBe('sites')
    expect(tabOf({ tab: 'Opportunités' })).toBe('veille')
    expect(tabOf({ tab: 'Écosystème' })).toBe('partners')
  })

  it('un tab inconnu retombe sur undefined (onglet par défaut), jamais une erreur', () => {
    expect(tabOf({ tab: 'bogus' })).toBeUndefined()
    expect(tabOf({})).toBeUndefined()
  })

  /**
   * #2115.30-31, #2130.79 — TROIS CLÉS RETROUVÉES PAR `git log --follow -p`,
   * disparues bien AVANT que #1104 ne crée le mécanisme d'alias : sans cette
   * entrée, un lien de mai-juillet 2026 tombait — et tombait encore, hors de ce
   * lot — silencieusement sur l'onglet par défaut.
   */
  it('#2130.79 — deux clés antérieures à #1104, retrouvées dans l’historique git, tombent au bon endroit', () => {
    expect(tabOf({ tab: 'fiche' })).toBe('overview') // renommage pur, commit d5eb69057
    expect(tabOf({ tab: 'notes' })).toBe('overview') // « private notes », supprimé (#118) — aucun successeur
  })

  /**
   * #2115.26 — `messages` A CESSÉ D'ÊTRE UN ALIAS, et c'est un progrès, pas une
   * régression : la section Plan d'action porte désormais une sous-partie
   * « préparation des messages », donc la valeur redevient CANONIQUE. Le lien de
   * mai 2026 ouvre toujours la même section ; il tombe maintenant sur l'ancre
   * exacte au lieu du haut du plan.
   *
   * ⚠️ La laisser en alias EN PLUS aurait fait diverger deux lectures de la même
   * valeur : `resolveTab` consulte `TAB_KEYS` AVANT la table d'alias (donc
   * `messages`), `buildTabMappingTable` applique les alias APRÈS les clés
   * canoniques (donc `plan`) — la table de correspondance aurait annoncé une
   * destination que le routeur n'emprunte pas.
   */
  it('#2115.26 — `messages` est redevenu canonique, et les deux lectures s’accordent', () => {
    expect(tabOf({ tab: 'messages' })).toBe('messages')
    expect(buildTabMappingTable().find(row => row.value === 'messages')?.tab).toBe('messages')
    // Et le lien ancien n'a pas changé de SECTION : personne n'est perdu.
    expect(sectionOfTab('messages')).toBe('actionPlan')
  })
})

/**
 * #2115.30-32 — LA REDIRECTION CANONIQUE CONSERVE UNE ANCRE PRÉCISE.
 *
 * Pour CHAQUE ancienne valeur, la section ET l'ancre attendues — pas seulement
 * l'onglet. C'est ce qui distingue #2115.31 (juste la bonne section) de
 * #2115.32 (la bonne ancre DANS la section, pas seulement le haut de page).
 */
describe('accountDetailSearch — la redirection canonique amène à la section ET à l’ancre précises', () => {
  const cases: [string, string, string][] = [
    // Les quatre cas NOMMÉS du lot (Score/Évaluation, Couverture, Accès, Missions).
    ['score', 'synthesis', 'dossier-evaluation'],
    ['couverture', 'people', 'dossier-coverage'],
    ['access', 'ecosystem', 'dossier-access'],
    ['missions', 'historyProofs', 'dossier-missions'],
    // Le reste de la table — accentué/majuscule compris (P1 les acceptait déjà
    // pour l'ONGLET ; ce lot le prouve pour la SECTION + l'ANCRE).
    ['Zones Blanches', 'people', 'dossier-coverage'],
    ['Périmètres', 'perimeters', 'dossier-sites'],
    ['Écosystème', 'ecosystem', 'dossier-partners'],
    ['fiche', 'synthesis', 'dossier-overview'],
    ['messages', 'actionPlan', 'dossier-messages'],
    ['notes', 'synthesis', 'dossier-overview'],
  ]

  it.each(cases)('%s → section %s, ancre %s', (raw, expectedSection, expectedAnchor) => {
    const tab = resolvedTab(raw)
    if (!tab) throw new Error(`${raw} n'a résolu vers AUCUN onglet — 404/page vide interdits`)
    expect(sectionOfTab(tab)).toBe(expectedSection)
    expect(subSectionAnchorId(tab)).toBe(expectedAnchor)
  })

  it('sait dire NON : une ancienne valeur qui résoudrait vers la mauvaise ancre serait détectée', () => {
    // Casse volontairement l'assertion pour prouver que le test MESURE quelque
    // chose : `score` n'atterrit jamais sur l'ancre `dossier-overview`.
    const tab = resolvedTab('score')
    if (!tab) throw new Error('score doit résoudre vers un onglet')
    expect(subSectionAnchorId(tab)).not.toBe('dossier-overview')
  })
})

/**
 * #2115.33 — LA NOTICE DE MIGRATION NE S'AFFICHE QUE QUAND ELLE EST UTILE.
 */
describe('accountDetailSearch — resolveLegacyTabNotice', () => {
  it('une ancienne valeur (pré-sections) déclenche la notice, avec la bonne section cible', () => {
    const notice = resolveLegacyTabNotice('score')
    expect(notice).toEqual({ value: 'score', tab: 'evaluation', section: 'synthesis' })
  })

  it('jamais sur une valeur déjà canonique — elle n’a pas bougé, ce n’est pas une migration', () => {
    for (const tab of TAB_KEYS) {
      expect(resolveLegacyTabNotice(tab), `${tab} est canonique et ne doit déclencher aucune notice`).toBeUndefined()
    }
  })

  it('jamais sur un raccourci de section — né AVEC les sections, rien n’y surprend', () => {
    for (const shortcut of ['synthese', 'personnes', 'ecosysteme', 'historique-preuves', 'people', 'ecosystem']) {
      expect(resolveLegacyTabNotice(shortcut), `${shortcut} est un raccourci de section`).toBeUndefined()
    }
  })

  it('tolère la casse et les accents, comme resolveTab', () => {
    expect(resolveLegacyTabNotice('SCORE')).toBeDefined()
    expect(resolveLegacyTabNotice('Zones Blanches')).toBeDefined()
  })

  it('undefined sur une valeur inconnue', () => {
    expect(resolveLegacyTabNotice('bogus')).toBeUndefined()
    expect(resolveLegacyTabNotice(undefined)).toBeUndefined()
  })
})

/**
 * #2130.79 — LA TABLE DE CORRESPONDANCE COMPLÈTE.
 */
describe('accountDetailSearch — buildTabMappingTable', () => {
  const table = buildTabMappingTable()

  it('contient les quatorze clés canoniques ET tous les alias — rien n’est oublié', () => {
    expect(table.length).toBeGreaterThanOrEqual(44)
    for (const tab of TAB_KEYS) {
      expect(table.some(row => row.value === tab && row.tab === tab)).toBe(true)
    }
  })

  it('chaque ligne calcule son ancre depuis subSectionAnchorId — jamais une chaîne recopiée', () => {
    for (const row of table) {
      expect(row.anchor).toBe(subSectionAnchorId(row.tab))
      expect(row.section).toBe(sectionOfTab(row.tab))
    }
  })

  it('une seule page propriétaire — le dossier compte n’a pas de route par sous-partie', () => {
    expect(new Set(table.map(row => row.ownerPage))).toEqual(new Set(['/accounts/$id']))
  })

  it('sait dire NON : deux lignes ne partagent jamais la même valeur (clé de table)', () => {
    const values = table.map(row => row.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('#2120.77 — les filtres de l’onglet Contacts vivent dans l’URL', () => {
  it('le schéma GARDE rôle, entité et niveau (zod retire en silence une clé non déclarée)', () => {
    const parsed = accountDetailSearchSchema.parse({
      tab: 'contacts',
      q: 'DSI',
      role: 'decision_maker',
      entity: 'DSI Groupe',
      level: 'L1',
    })
    expect(contactsFiltersFromSearch(parsed)).toEqual({
      search: 'DSI',
      role: 'decision_maker',
      entity: 'DSI Groupe',
      level: 'L1',
    })
  })

  it('une URL sans filtre rend les valeurs par défaut de l’onglet, jamais undefined', () => {
    expect(contactsFiltersFromSearch(accountDetailSearchSchema.parse({ tab: 'contacts' }))).toEqual({
      search: '',
      role: 'all',
      entity: 'all',
      level: 'all',
    })
  })

  it('écrire les valeurs par défaut RETIRE les clés — un lien partagé reste propre', () => {
    expect(contactsFiltersToSearch({ search: '', role: 'all', entity: 'all', level: 'all' })).toEqual({
      q: undefined,
      role: undefined,
      entity: undefined,
      level: undefined,
    })
  })

  it('sait dire NON : un filtre posé survit à l’aller-retour URL → onglet', () => {
    const filters = { search: 'achat', role: 'influencer', entity: 'all', level: 'L2' }
    const roundTrip = contactsFiltersFromSearch(accountDetailSearchSchema.parse(contactsFiltersToSearch(filters)))
    expect(roundTrip).toEqual(filters)
    expect(roundTrip).not.toEqual({ search: '', role: 'all', entity: 'all', level: 'all' })
  })

  it('une valeur illisible (non chaîne) retombe sur le défaut, jamais une erreur', () => {
    expect(contactsFiltersFromSearch(accountDetailSearchSchema.parse({ role: 42, entity: ['x'] }))).toEqual({
      search: '',
      role: 'all',
      entity: 'all',
      level: 'all',
    })
  })
})

/**
 * #2128.50 / #2128.53 — LA RECHERCHE ET L'OBJET OUVERT VIVENT DANS L'URL.
 *
 * Un retour navigateur rejoue l'URL, pas un état React : la requête (`find`)
 * et l'objet ouvert (`item`) doivent donc y être, et survivre à la lecture du
 * schéma. Un `item` illisible disparaît au lieu d'ouvrir un objet deviné.
 */
describe('accountDetailSearchSchema — `find` et `item` (#2128.50/.53)', () => {
  it('garde la requête de recherche du dossier', () => {
    expect(accountDetailSearchSchema.parse({ tab: 'contacts', find: 'sarah' })).toMatchObject({
      tab: 'contacts',
      find: 'sarah',
    })
  })

  it('garde un objet lisible, et retire un objet illisible sans casser le reste de l’URL', () => {
    expect(accountDetailSearchSchema.parse({ item: 'signal:s1' }).item).toBe('signal:s1')
    const parsed = accountDetailSearchSchema.parse({ tab: 'veille', item: 'pirate:1' })
    expect(parsed.item).toBeUndefined()
    expect(parsed.tab).toBe('veille')
  })
})

/**
 * #3677 / #3720 (RAN, recette ND 10/10 en prod, toujours KO malgré trois captures « au premier rendu ») —
 * le routeur réécrit `?tab=programs` en `?tab=veille` en validant la recherche, AVANT tout rendu de
 * l'écran : l'URL lue au premier rendu dit déjà `veille`. Le seul endroit qui voit encore la valeur
 * d'origine est la validation elle-même : elle la dépose, l'écran la reprend.
 */
describe('arrivée par un ancien lien — capturée à la validation de la recherche', () => {
  it('une valeur héritée déposée par la validation reste lisible après la réécriture', () => {
    clearCapturedLegacyTab()
    accountDetailSearchSchema.parse({ tab: 'programs' })
    // Le routeur re-valide ensuite l'URL déjà réécrite : cela n'efface pas l'arrivée.
    accountDetailSearchSchema.parse({ tab: 'veille' })
    expect(capturedLegacyTabNotice()?.value).toBe('programs')
  })

  it('une valeur canonique ne dépose rien (dit NON)', () => {
    clearCapturedLegacyTab()
    accountDetailSearchSchema.parse({ tab: 'veille' })
    expect(capturedLegacyTabNotice()).toBeUndefined()
  })

  it('une arrivée trop ancienne n’est plus reprise', () => {
    clearCapturedLegacyTab()
    vi.useFakeTimers()
    try {
      accountDetailSearchSchema.parse({ tab: 'programs' })
      vi.advanceTimersByTime(60_000)
      expect(capturedLegacyTabNotice()).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('#4061.b — l’état de l’organigramme survit à la validation de l’URL', () => {
  it('les clés ov / od / oc / of / os ne sont pas retirées en silence', () => {
    const parsed = accountDetailSearchSchema.parse({
      tab: 'organigramme',
      ov: 'system',
      od: 'e2',
      oc: 'e1',
      of: 'level=L2',
      os: 'p-claire',
    })
    expect(parsed).toMatchObject({ ov: 'system', od: 'e2', oc: 'e1', of: 'level=L2', os: 'p-claire' })
  })
})

describe('#4996 L6 — le segment « Mon périmètre · Tout le compte » vit dans l’URL', () => {
  it('lit `perimeter=mine|all` et jette une valeur périmée sans casser l’écran', () => {
    expect(accountDetailSearchSchema.parse({ perimeter: 'mine' }).perimeter).toBe('mine')
    expect(accountDetailSearchSchema.parse({ perimeter: 'all' }).perimeter).toBe('all')
    expect(accountDetailSearchSchema.parse({ perimeter: 'nope' }).perimeter).toBeUndefined()
    expect(accountDetailSearchSchema.parse({}).perimeter).toBeUndefined()
  })
})
