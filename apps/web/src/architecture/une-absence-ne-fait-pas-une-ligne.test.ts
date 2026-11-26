/**
 * ⚠️ #2613 — CETTE GARDE REVIENT SUR GA-18 / GA-19 POUR LES LISTES.
 * Décision de Louis du 20/09/2026, mot pour mot :
 *
 *   « la règle c'est on affiche pas ce qu'on a pas, on va pas mettre non
 *     mesuré et tout ça, ça envoie juste un signal negatif à l'user qui est
 *     pas utile »
 *
 * Portée tranchée le même jour : **partout dans les LISTES, mais un SCORE
 * garde ses axes.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI BASCULE
 * ─────────────────────────────────────────────────────────────────────────
 * Dans une LISTE, une CARTE, un BANDEAU, un TABLEAU : une valeur absente ne
 * produit AUCUNE ligne. Pas de « Localisation : non mesurée », pas de
 * « Rang 2 : non su », pas de bandeau qui répète l'absence. On affiche ce
 * qu'on sait. GA-18 / GA-19 disaient l'inverse pour tout le produit — « ce
 * qui n'a pas pu être évalué est NOMMÉ ». Cette moitié-là se restreint
 * désormais aux scores.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI NE BASCULE PAS — et qu'on ne rouvre pas
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Un « non mesuré » ne devient JAMAIS un « 0 ».** Ni à l'écran, ni dans
 *    un calcul. La ligne DISPARAÎT ; elle ne se chiffre pas. GA-19 (le
 *    cliquet des `?? 0`) reste intact, au même niveau.
 * 2. **Un axe non évaluable sort toujours du dénominateur.**
 * 3. **Sous un SCORE, l'énoncé des axes non évaluables RESTE.** Sa raison :
 *    un 45/70 dont on ignore ce qui a pu être pesé se lit comme un 45/70
 *    complet. Là, le silence ment vraiment — et c'est exactement le défaut
 *    que GA-18 / GA-19 ont été écrites pour empêcher. La garde SCORE, dans
 *    `un-score-dit-ses-axes-non-evaluables.test.tsx`, refuse un score rendu
 *    sans cet énoncé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE, ET PAS SEULEMENT UN COMMIT
 * ─────────────────────────────────────────────────────────────────────────
 * Le dépôt porte des commentaires DATÉS qui réclament l'inverse — « TOUJOURS
 * l'un des trois états, l'absence de signal EST l'état inconnu, jamais une
 * absence d'affichage » (PartnerResultRow, 19/09/2026), « possédé sans lien
 * connu → non renseigné, jamais silencieux » (CandidateCard). Sans garde, le
 * prochain lecteur lit ces commentaires, croit à une régression, et remet les
 * lignes. Une règle de design qui n'est pas gardée redevient une opinion en
 * trois semaines.
 *
 * Une garde protège une règle, elle ne l'invente pas : elle casse ici un
 * COUPABLE FACTICE et le NOMME.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resources } from '@/i18n/resources'

const WEB_SRC = join(__dirname, '..')

/**
 * Le corpus LISTE — ce sur quoi la décision a été prise.
 *
 * `features/discover/view` en entier (la liste Découvrir, l'écran d'où vient
 * le retour), plus, partout ailleurs dans `features/`, les fichiers dont le
 * NOM dit qu'ils sont une ligne, une carte, un bandeau ou un tableau. Ce sont
 * les surfaces où une absence s'ajoute en ligne supplémentaire.
 *
 * Hors corpus DÉLIBÉRÉMENT à l'origine : la fiche d'un objet (un dossier de
 * compte, une fiche consultant). Là, un champ attendu qui reste muet laisse
 * un libellé orphelin, et la règle d'en face — un score dit ses axes — y vit
 * aussi. Élargir le corpus est un arbitrage produit, pas un élargissement de
 * garde — Louis a tranché cet élargissement le 20/09/2026, pour la famille
 * des FICHES DE COMPTE d'abord (`accountOrg.json` + `accountDetail.json`,
 * #2613 étendu). Voir `FICHE_ABSENCE_ONLY_KEYS` plus bas : la MAJORITÉ des
 * clés d'absence de ces deux catalogues RESTE — mesuré à zéro, axe de score,
 * bandeau de fraîcheur de collecte (doctrine séparée, #2543/#AF.3), libellé
 * de regroupement — seule une poignée était une absence pure.
 */
const LIST_SUFFIXES = ['Row.tsx', 'Card.tsx', 'Notice.tsx', 'Table.tsx', 'Band.tsx', 'Banner.tsx']
const DISCOVER_VIEW = join(WEB_SRC, 'features', 'discover', 'view')
const FEATURES = join(WEB_SRC, 'features')

function tsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full))
      continue
    }
    if (!entry.endsWith('.tsx')) continue
    if (entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

function listViewFiles(): { path: string; rel: string }[] {
  const discover = tsxFiles(DISCOVER_VIEW)
  const named = tsxFiles(FEATURES).filter(file => LIST_SUFFIXES.some(suffix => file.endsWith(suffix)))
  return [...new Set([...discover, ...named])].map(path => ({ path, rel: path.slice(WEB_SRC.length + 1) }))
}

/**
 * Retire les commentaires avant de lire.
 *
 * Sans cela, un docblock qui EXPLIQUE le renversement le viole — le dépôt a
 * déjà payé ce défaut quatre fois (GA-08 sur une apostrophe, GA-19 sur ses
 * propres exemples, GA-25 sur un `bounce: 0`, la garde « parallaxe »).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les énoncés d'absence RETIRÉS par #2613, avec l'endroit dont ils venaient.
 *
 * Chacun était une ligne — ou un bandeau — dont le seul contenu était le fait
 * qu'on ne sait pas. Ils ne doivent revenir ni dans un catalogue (fr OU en :
 * une clé laissée d'un seul côté est le défaut qu'aucune garde monolingue ne
 * voit), ni dans une vue de liste.
 */
type AbsenceKey = {
  ns: 'discover' | 'accountOrg' | 'accountDetail'
  key: string
  from: string
  /**
   * `true` quand c'est tout un SOUS-ARBRE qui a disparu — la source le lisait
   * par interpolation, ``t(`contactsResult.unknown.${key}`)``, et la clé
   * complète n'apparaît donc nulle part.
   *
   * ⚠️ Sans cette distinction, la garde accusait `CandidateCard` : il reste
   * ``t(`card.groupRole.${role}`)`` pour les deux états QUI DISENT quelque
   * chose, et seule la feuille `unknown` a été retirée. Une garde doit savoir
   * ne pas attraper ce qu'elle ne vise pas.
   */
  family?: true
}

const ABSENCE_ONLY_KEYS: ReadonlyArray<AbsenceKey> = [
  {
    ns: 'discover',
    key: 'confidence.unmeasured',
    from: 'CandidateConfidence — « Confiance dans la donnée · non mesurée » sur une carte de la liste',
  },
  {
    ns: 'discover',
    key: 'unmeasured.title',
    from: 'UnmeasuredNotice — bandeau « Des comptes écartés faute de donnée mémoire marché »',
  },
  {
    ns: 'discover',
    key: 'unmeasured.line_one',
    from: 'UnmeasuredNotice — la ligne qui compte les comptes écartés',
  },
  {
    ns: 'discover',
    key: 'unmeasured.line_other',
    from: 'UnmeasuredNotice — la ligne qui compte les comptes écartés',
  },
  {
    ns: 'discover',
    key: 'contactsResult.unknownLabel',
    from: 'ContactResultRow — « Non su : la localisation · l’expertise… » sous une ligne de personne',
  },
  {
    ns: 'discover',
    key: 'contactsResult.unknown',
    from: 'ContactResultRow — les champs énumérés derrière « Non su »',
    family: true,
  },
  {
    ns: 'discover',
    key: 'contactsResult.notConfirmed',
    from: 'ContactResultRow — « Poste non confirmé — aucune date de dernière vérification »',
  },
  {
    ns: 'discover',
    key: 'contactsResult.sourceUnknown',
    from: 'ContactResultRow — « source non renseignée » accrochée à la provenance',
  },
  { ns: 'discover', key: 'needs.unknownLabel', from: 'NeedResultRow — « Non su : » sous une ligne de besoin' },
  {
    ns: 'discover',
    key: 'needs.unknown',
    from: 'NeedResultRow — les champs énumérés derrière « Non su »',
    family: true,
  },
  {
    ns: 'discover',
    key: 'partners.unknownLabel',
    from: 'PartnerResultRow — « Non su : » sous une ligne de partenaire',
  },
  {
    ns: 'discover',
    key: 'partners.unknown',
    from: 'PartnerResultRow — les champs énumérés derrière « Non su »',
    family: true,
  },
  { ns: 'discover', key: 'partners.rank2.unknown', from: 'PartnerResultRow — « Rang 2 : non su »' },
  { ns: 'discover', key: 'card.peopleUnknownLabel', from: 'CandidatePeople — « Non su : » sous une personne nommée' },
  {
    ns: 'discover',
    key: 'card.peopleUnknown',
    from: 'CandidatePeople — les champs énumérés derrière « Non su »',
    family: true,
  },
  { ns: 'discover', key: 'card.groupRole.unknown', from: 'CandidateCard — la puce « Rattachement non renseigné »' },
  {
    ns: 'discover',
    key: 'callList.cell.unmeasured',
    from: 'CallListResults — « Non mesuré » dans une cellule de tableau et sous un étage de la chute',
  },
  {
    ns: 'discover',
    key: 'card.signalsUnmeasuredCompact',
    from: 'CandidateRow — « Signaux non mesurés » sur une ligne de liste',
  },
  {
    ns: 'discover',
    key: 'card.addressabilityNotMeasured',
    from: 'CandidateScore — la puce « accès non mesuré » sur une carte de liste',
  },
  {
    ns: 'discover',
    key: 'marketContext.results.fitUnmeasured',
    // Retrait de la section « Marché observé » décidé par Louis 31/10 (revient sur #4632) : la clé reste retirée.
    from: 'ex-MarketObservedSection — la pastille « Fit marché : Non mesuré »',
  },
]

/**
 * ⚠️ CE QUE CETTE GARDE NE DOIT JAMAIS ATTRAPER — « mesuré à ZÉRO ».
 *
 * « On a cherché et il n'y a rien » est un FAIT, et il se dit. « On n'a pas pu
 * regarder » est une absence, et elle se tait. Les confondre en nettoyant
 * ferait disparaître une réponse utile ; c'est la moitié de GA-18 / GA-19 qui
 * ne bouge pas, vue de l'autre côté.
 *
 * Ces clés-là restent, et le test plus bas le vérifie sur les DEUX catalogues :
 * si quelqu'un les emporte avec les autres, la CI le dit.
 */
const MEASURED_ZERO_KEYS: ReadonlyArray<{ key: string; why: string }> = [
  {
    key: 'card.signalsNoneCompact',
    why: '« Sélectionné sur le profil, aucun signal mesuré » — la recherche a eu lieu, elle n’a rien rendu',
  },
  {
    key: 'callList.cell.noContact',
    why: '« Aucun contact connu » — un compte sans contact, pas un compte non regardé',
  },
  { key: 'card.signalsEmpty', why: '« Aucun déclencheur récent identifié » — un constat, pas une absence de mesure' },
]

type Tree = Record<string, unknown>

/** La valeur d'une clé pointée dans un catalogue, ou `undefined`. */
function lookup(tree: Tree, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Tree)[part]
    return undefined
  }, tree)
}

/**
 * Un fichier LIT-il cette clé ?
 *
 * TROIS formes, parce que le dépôt emploie les trois :
 *  - l'appel littéral `t('confidence.unmeasured')` ;
 *  - le PLURIEL i18next — le catalogue porte `unmeasured.line_one` /
 *    `_other`, la source écrit `t('unmeasured.line', { count })`. Ne chercher
 *    que la clé de catalogue ne trouverait jamais l'appelant, et la garde
 *    serait verte sur un bandeau bien vivant ;
 *  - la FAMILLE interpolée ``t(`contactsResult.unknown.${key}`)``, qui ne
 *    contient pas la clé complète : on cherche alors son PRÉFIXE suivi de
 *    `.${`.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function mentions(body: string, literal: string): boolean {
  return body.includes(`'${literal}'`) || body.includes(`\`${literal}\``) || body.includes(`"${literal}"`)
}

function interpolatedFamily(body: string, prefix: string): boolean {
  return new RegExp(`\`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\$\\{`).test(body)
}

function readsKey(source: string, entry: Pick<AbsenceKey, 'key' | 'family'>): boolean {
  const body = stripComments(source)
  if (mentions(body, entry.key)) return true
  const base = entry.key.replace(PLURAL_SUFFIX, '')
  if (base !== entry.key && mentions(body, base)) return true
  // Un SOUS-ARBRE retiré est lu par interpolation et n'apparaît jamais en
  // toutes lettres. Une FEUILLE retirée, elle, laisse sa famille vivante :
  // chercher l'interpolation du parent accuserait les états qui subsistent.
  return entry.family === true && interpolatedFamily(body, base)
}

describe('#2613 — une absence ne fait pas une ligne (LISTE)', () => {
  const files = listViewFiles()

  it('la garde lit bien un corpus — sinon elle passerait au vert sur du vide', () => {
    // Sans ceci, un chemin devenu faux rendrait zéro fichier et la garde
    // serait verte pour toujours (le défaut « sonde sans corpus »).
    expect(files.length).toBeGreaterThan(30)
    expect(existsSync(DISCOVER_VIEW), `corpus introuvable : ${DISCOVER_VIEW}`).toBe(true)
    // Retrait décidé par Louis 31/10 (revient sur #4632) : la section « Marché observé » n'est plus lue ;
    // la garde de corpus tient sur un écran qui reste (la liste de Découvrir).
    expect(files.some(file => file.rel.endsWith('Discover.tsx'))).toBe(true)
    expect(Object.keys(resources.fr.discover as Tree).length).toBeGreaterThan(10)
    expect(Object.keys(resources.en.discover as Tree).length).toBeGreaterThan(10)
  })

  it.each(ABSENCE_ONLY_KEYS)('« $key » a disparu des DEUX catalogues', ({ ns, key, from }) => {
    expect(lookup(resources.fr[ns] as Tree, key), `fr/${ns}.json porte encore ${key} — ${from}`).toBeUndefined()
    expect(lookup(resources.en[ns] as Tree, key), `en/${ns}.json porte encore ${key} — ${from}`).toBeUndefined()
  })

  it('aucune vue de liste ne relit un énoncé d’absence retiré', () => {
    const offenders = files.flatMap(file => {
      const source = readFileSync(file.path, 'utf8')
      return ABSENCE_ONLY_KEYS.filter(entry => readsKey(source, entry)).map(
        entry => `${file.rel} lit « ${entry.key} » (${entry.from})`,
      )
    })
    // Joint en UNE chaîne : un tableau tronqué à « …(2) » ne nomme pas le coupable.
    expect(offenders.join('\n')).toBe('')
  })

  /**
   * Le coupable FACTICE.
   *
   * Sans ce test, une garde qui ne trouve plus rien est indiscernable d'une
   * garde qui ne cherche plus rien.
   */
  it.each(MEASURED_ZERO_KEYS)('« $key » RESTE — mesuré à zéro n’est pas non mesuré ($why)', ({ key }) => {
    expect(lookup(resources.fr.discover as Tree, key), `fr/discover.json a perdu ${key}`).toBeTypeOf('string')
    expect(lookup(resources.en.discover as Tree, key), `en/discover.json a perdu ${key}`).toBeTypeOf('string')
  })

  it('sait dire NON — une ligne d’absence remontée, un innocent laissé tranquille', () => {
    const coupableLitteral = `<p>{t('confidence.unmeasured')}</p>`
    const coupablePluriel = `<li>{t('unmeasured.line', { count: entry.count })}</li>`
    const coupableFamille = '<p>{row.unknown.map(k => t(`contactsResult.unknown.${k}`)).join(" · ")}</p>'
    const innocentValeur = `<p>{t('confidence.title')} {t('confidence.score', { score })}</p>`
    const innocentVoisin = `<p>{t('unmeasured.lineage')}</p>`
    const innocentCommentaire = `// #2613 — on n'écrit plus t('confidence.unmeasured') ici.\n<p>{score}</p>`

    const innocentFamilleVivante = '<Chip>{t(`card.groupRole.${candidate.groupRole}`)}</Chip>'

    expect(readsKey(coupableLitteral, { key: 'confidence.unmeasured' })).toBe(true)
    // Le PLURIEL : le catalogue dit `_one`/`_other`, la source dit la base.
    expect(readsKey(coupablePluriel, { key: 'unmeasured.line_one' })).toBe(true)
    // Le SOUS-ARBRE retiré, lu par interpolation et jamais écrit en entier.
    expect(readsKey(coupableFamille, { key: 'contactsResult.unknown', family: true })).toBe(true)
    expect(readsKey(innocentValeur, { key: 'confidence.unmeasured' })).toBe(false)
    // …elle n'attrape pas ce qu'elle ne vise pas : `unmeasured.lineage` n'est
    // pas `unmeasured.line`.
    expect(readsKey(innocentVoisin, { key: 'unmeasured.line_one' })).toBe(false)
    // …ni la FAMILLE encore vivante dont une seule feuille a été retirée : le
    // vrai faux positif qui a fait rougir CandidateCard pendant l'écriture.
    expect(readsKey(innocentFamilleVivante, { key: 'card.groupRole.unknown' })).toBe(false)
    // …et elle ne se fait pas accuser par sa propre explication : une garde qui
    // lit la PROSE accuse le bien (leçon « parallaxe en commentaire »).
    expect(readsKey(innocentCommentaire, { key: 'confidence.unmeasured' })).toBe(false)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LE CORPUS FICHE — élargissement du 20/09/2026, lot « fiches de compte »
 * ─────────────────────────────────────────────────────────────────────────
 * `features/accounts/view/account-detail` en entier : c'est la fiche compte,
 * pas une liste. Seuls `accountOrg.json` et `accountDetail.json` sont dans CE
 * lot (50 clés mesurées dans `.claude/notes/inventaire-2026-09-20-absences-
 * fiches.md`) — les autres catalogues de fiches (consultants, missions…)
 * restent HORS corpus, pour un lot suivant.
 */
const FICHE_DIR = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail')

function ficheViewFiles(): { path: string; rel: string }[] {
  return tsxFiles(FICHE_DIR).map(path => ({ path, rel: path.slice(WEB_SRC.length + 1) }))
}

/**
 * Les énoncés d'absence PURE retirés du lot fiches — la minorité. Chacun
 * était un libellé:valeur où la valeur manquante rendait « non renseigné »
 * / « inconnu » / « non renseignée » SANS aucune raison d'agir attachée.
 *
 * La MAJORITÉ des 50 clés mesurées est restée (axe de score, bandeau de
 * fraîcheur de collecte #2543/#AF.3, libellé de regroupement, phrase d'anti-
 * invention documentée dans le code) — voir le rapport du lot, pas cette
 * garde : une garde vérifie un retrait, elle ne réexplique pas un maintien.
 */
const FICHE_ABSENCE_ONLY_KEYS: ReadonlyArray<AbsenceKey> = [
  {
    ns: 'accountOrg',
    key: 'priorityPath.card.entityUnknown',
    from: 'PriorityPathSection — « Entité non renseignée » sous une carte de contact prioritaire',
  },
  {
    ns: 'accountOrg',
    key: 'priorityPath.access.never_searched',
    from: 'PriorityPathSection — la ligne « Voie d’accès » quand rien n’a jamais été cherché',
  },
  {
    ns: 'accountOrg',
    key: 'enrichmentPlanner.unknownValue',
    from: 'EnrichmentPlannerDialog — clé orpheline, aucun appelant ne la lisait déjà',
  },
  {
    ns: 'accountDetail',
    key: 'competitors.noStrengths',
    from: 'IncumbentEsnCard — « Forces non renseignées » sous un concurrent en place',
  },
  {
    ns: 'accountDetail',
    key: 'competitors.noWeaknesses',
    from: 'IncumbentEsnCard — « Faiblesses non renseignées » sous un concurrent en place',
  },
  {
    ns: 'accountDetail',
    key: 'programs.noBudget',
    from: 'ItProgramsCard — « Budget non renseigné » sous un programme IT nommé',
  },
  {
    ns: 'accountDetail',
    key: 'attackAngles.notProvided',
    from: 'AttackAnglesSection — repli mort de DialogDetailRow, les trois appelants ne passent déjà que du connu (#1091)',
  },
  {
    ns: 'accountDetail',
    key: 'provenance.dateUnknown',
    from: 'AccountProvenancePanel — la date d’une source, dans SourceRow',
  },
  // #3711.17 (décision Louis 17/10/2026, recette R41 EDF : 5 « Non mesuré » HORS score) — la garde du lot C ne les
  // avait pas attrapés : elle ne lisait que les clés listées. Ces trois-là, sur la fiche, étaient des lignes d'absence.
  {
    ns: 'accountDetail',
    key: 'variation.notMeasured',
    from: 'AccountVariationSignalsCard — « Non mesuré — … » sous chacune des quatre variations du compte',
  },
  {
    ns: 'accountDetail',
    key: 'variation.reasons',
    from: 'AccountVariationSignalsCard — la raison de chaque variation non mesurée',
    family: true,
  },
  {
    ns: 'accountDetail',
    key: 'competitors.unknownReason',
    from: 'IncumbentEsnCard — « non mesuré — aucune ESN nommée » (écosystème), carte entière sur une absence',
    family: true,
  },
  {
    ns: 'accountOrg',
    key: 'orgGraph.sourceDateUnknown',
    from: 'OrgSourceChips — « Réseau professionnel · date inconnue » sous une carte de personne (#3037, retour bêta)',
  },
]

/**
 * ⚠️ Témoins — des clés d'absence VOISINES, gardées, qui ne doivent JAMAIS
 * être attrapées par cette garde. Chacune porte sa raison dans le code
 * source, pas ici (une garde vérifie, elle n'explique pas un arbitrage) :
 *  - `priorityPath.reasons.entity_unknown` : la raison d'un AXE de score
 *    (`RankingDetail`, `ScoreWithAxes`, GA-18/19) — texte proche de la clé
 *    retirée `priorityPath.card.entityUnknown`, chemin différent ;
 *  - `plan.facts.confidenceNotMeasured` / `costNotMeasured` : PlanItemFacts
 *    documente noir sur blanc « une puce qui disparaît se lit *rien à
 *    signaler* » (GA-18/19) — l'exact inverse de #2613 pour cette fiche ;
 *  - `planFreshness.inconnu` : badge obligatoire même périmé (D78,
 *    `PlanFreshnessBadge`) — jamais masqué à cause de l'âge.
 */
const FICHE_MEASURED_ZERO_KEYS: ReadonlyArray<{ ns: 'accountOrg' | 'accountDetail'; key: string; why: string }> = [
  {
    ns: 'accountOrg',
    key: 'priorityPath.reasons.entity_unknown',
    why: 'raison d’un axe de score (RankingDetail) — voisine de la clé retirée, chemin différent',
  },
  {
    ns: 'accountDetail',
    key: 'plan.facts.confidenceNotMeasured',
    why: 'GA-18/19 cité dans PlanItemFacts : une puce absente se lirait « rien à signaler »',
  },
  {
    ns: 'accountDetail',
    key: 'planFreshness.inconnu',
    why: 'D78 — le badge de fraîcheur du plan ne se masque jamais, même « inconnu »',
  },
]

describe('#2613 étendu — une fiche n’affiche pas ce qu’elle ignore (FICHE compte)', () => {
  const files = ficheViewFiles()

  it('la garde lit bien un corpus — sinon elle passerait au vert sur du vide', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(existsSync(FICHE_DIR), `corpus introuvable : ${FICHE_DIR}`).toBe(true)
    expect(Object.keys(resources.fr.accountOrg as Tree).length).toBeGreaterThan(10)
    expect(Object.keys(resources.fr.accountDetail as Tree).length).toBeGreaterThan(10)
  })

  it.each(FICHE_ABSENCE_ONLY_KEYS)('« $key » a disparu des DEUX catalogues', ({ ns, key, from }) => {
    expect(lookup(resources.fr[ns] as Tree, key), `fr/${ns}.json porte encore ${key} — ${from}`).toBeUndefined()
    expect(lookup(resources.en[ns] as Tree, key), `en/${ns}.json porte encore ${key} — ${from}`).toBeUndefined()
  })

  it('aucun fichier de la fiche compte ne relit un énoncé d’absence retiré', () => {
    const offenders = files.flatMap(file => {
      const source = readFileSync(file.path, 'utf8')
      return FICHE_ABSENCE_ONLY_KEYS.filter(entry => readsKey(source, entry)).map(
        entry => `${file.rel} lit « ${entry.key} » (${entry.from})`,
      )
    })
    expect(offenders.join('\n')).toBe('')
  })

  /** Le coupable FACTICE — sans lui, une garde qui ne trouve plus rien est
   *  indiscernable d'une garde qui ne cherche plus rien. */
  it.each(FICHE_MEASURED_ZERO_KEYS)('« $key » RESTE — ce n’est pas une absence pure ($why)', ({ ns, key }) => {
    expect(lookup(resources.fr[ns] as Tree, key), `fr/${ns}.json a perdu ${key}`).toBeTypeOf('string')
    expect(lookup(resources.en[ns] as Tree, key), `en/${ns}.json a perdu ${key}`).toBeTypeOf('string')
  })

  it('sait dire NON sur la fiche — une ligne retirée remontée, un axe de score laissé tranquille', () => {
    const coupable = `{contact.entity?.trim() || t('priorityPath.card.entityUnknown')}`
    // Chemin VOISIN, gardé : la raison d'un axe de score (`RankingDetail`),
    // lue par interpolation — elle ne contient donc JAMAIS la feuille exacte
    // `entity_unknown` en toutes lettres, et la garde ne doit pas l'inventer.
    const innocentAxeDeScore = 'detail: t(`priorityPath.reasons.${axis.reason}`)'
    const innocentPuceScore = "t('plan.facts.confidenceNotMeasured')"
    const innocentCommentaire = "// #2613 — on n'écrit plus t('priorityPath.card.entityUnknown') ici.\n<p>{entity}</p>"

    expect(readsKey(coupable, { key: 'priorityPath.card.entityUnknown' })).toBe(true)
    // …elle n'attrape pas le chemin VOISIN : « entityUnknown » (retiré) et
    // « entity_unknown » (gardé, un axe) ne partagent qu'un préfixe visuel.
    expect(readsKey(innocentAxeDeScore, { key: 'priorityPath.card.entityUnknown' })).toBe(false)
    expect(readsKey(innocentPuceScore, { key: 'plan.facts.confidenceNotMeasured' })).toBe(true)
    expect(readsKey(innocentPuceScore, { key: 'competitors.noStrengths' })).toBe(false)
    expect(readsKey(innocentCommentaire, { key: 'priorityPath.card.entityUnknown' })).toBe(false)
  })

  // #3711.17 — la garde étendue DIT NON sur le cas de la recette R41 (les deux composants de la Vue d'ensemble).
  it('sait dire NON sur les « Non mesuré » de la Vue d’ensemble (variations du compte, écosystème)', () => {
    const coupableVariation = "t('variation.notMeasured', { reason: t(`variation.reasons.${signal.reason}`) })"
    const coupableEcosysteme = 't(`competitors.unknownReason.${UNKNOWN_REASON_KEY[incumbentEsn.reason]}`)'
    const innocentMesure = "t('variation.measured', { current, previous })"
    expect(readsKey(coupableVariation, { key: 'variation.notMeasured' })).toBe(true)
    expect(readsKey(coupableVariation, { key: 'variation.reasons', family: true })).toBe(true)
    expect(readsKey(coupableEcosysteme, { key: 'competitors.unknownReason', family: true })).toBe(true)
    expect(readsKey(innocentMesure, { key: 'variation.notMeasured' })).toBe(false)
    expect(readsKey(innocentMesure, { key: 'variation.reasons', family: true })).toBe(false)
  })
})
