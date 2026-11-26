import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-92 / GA-93 — les CGV et la carte de tarifs disent du report de crédits ce
 * que le code en fait, dans les QUATRE langues du site.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois textes disaient trois choses du même objet :
 *
 *   — les CGV        « les crédits non utilisés ne sont pas reportables sur la
 *                      période suivante, sauf mention contraire expresse » ;
 *   — la page tarifs « crédits non utilisés reportables sur 30 jours » ;
 *   — le CODE        `rollover_expires_at: () => "now() + interval '30 days'"`,
 *                    appliqué à TOUS les paliers payants au renouvellement.
 *
 * La clause d'échappement (« sauf mention contraire expresse ») sauvait
 * techniquement les CGV, mais le sens du défaut était l'inverse du produit : le
 * texte qui FAIT FOI promettait moins que ce que le code donne. Un client qui
 * lit ses conditions y apprend qu'il perd ce qu'il n'a pas consommé, alors que
 * le renouvellement le lui reporte. Louis a tranché le 30/08 : on inverse la
 * clause (D252), on ne touche pas au code.
 *
 * Un contrat corrigé dans une seule langue serait PIRE qu'un contrat faux : il
 * ferait deux contrats différents selon la langue du client. D'où les quatre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE LIT LE CODE, ELLE NE LE RECOPIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La durée n'est écrite nulle part dans ce fichier : elle est EXTRAITE de
 * `credits.service.ts`. Le jour où le report passe de trente à soixante jours,
 * les cinq textes publics doivent suivre ou la CI tombe. Un « 30 » recopié ici
 * serait exactement le mensonge que la garde prétend empêcher, avec un cran de
 * retard — c'est la leçon de `messages-credit-truth.test.ts`, dont ce fichier
 * reprend la forme.
 *
 * Elle vérifie aussi qu'il n'existe qu'UNE durée dans le code. Un palier qui
 * reporterait sur une autre durée ferait tomber la garde, et c'est le but : la
 * clause devrait alors le dire, et elle ne le dit pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ELLE CHERCHE — LE SENS, PAS UNE PHRASE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui chercherait la phrase exacte serait cassée par la première
 * relecture juridique, et une garde qu'un passage de style casse finit
 * désactivée. Elle cherche donc deux choses, qui sont le SENS de la clause :
 *
 *   1. le FAIT du report — un verbe de report appliqué aux crédits, sans
 *      négation devant lui ;
 *   2. sa DURÉE — le nombre du code, en chiffres ou en toutes lettres, collé à
 *      son unité de temps.
 *
 * ⚠️ SES LIMITES, écrites pour que personne ne la croie plus forte qu'elle :
 *
 *   — elle ne comprend pas le français, elle reconnaît des racines. Une clause
 *     réécrite avec un vocabulaire entièrement neuf (« les crédits survivent au
 *     renouvellement pendant trente jours ») la ferait tomber alors que le texte
 *     serait JUSTE. C'est un faux rouge assumé : il coûte une minute et une
 *     ligne ajoutée à {@link ROLLS_OVER}, là où un faux vert coûte un litige.
 *   — elle ne lit pas la NUANCE du report (seul le quota du palier est
 *     reportable, ni la recharge ponctuelle ni un report antérieur). Elle
 *     vérifie que la clause dit OUI et pendant COMBIEN DE TEMPS ; que le reste
 *     de la clause soit exact reste une lecture humaine.
 *   — elle lit le fichier source de l'API en TEXTE. Elle survit à un
 *     déplacement de ligne, pas à un déplacement de fichier — auquel cas elle
 *     dit « introuvable », ce qui est le bon message.
 */

/** La racine du dépôt : le porteur du chiffre vit hors de `apps/website`. */
const REPO_ROOT = join(__dirname, '..', '..', '..')
const CGV_PAGE = join(__dirname, 'app', '[locale]', 'cgv', 'page.tsx')
const CREDITS_SERVICE = join(REPO_ROOT, 'apps', 'api', 'src', 'modules', 'credits', 'credits.service.ts')
const MESSAGES = join(__dirname, '..', 'messages')

/** Les quatre langues servies par les CGV. */
const LOCALES = ['de', 'nl', 'en', 'fr'] as const
type Locale = (typeof LOCALES)[number]

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. CE QUE LE CODE FAIT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * L'échéance posée au renouvellement, telle qu'elle est ÉCRITE dans le service
 * de crédits — `rollover_expires_at: () => "now() + interval 'N days'"`.
 *
 * Le motif est ancré sur le NOM DE COLONNE, pas sur un numéro de ligne : la
 * ligne bouge à chaque relecture, le nom de la colonne ne bouge qu'avec une
 * migration. Un `interval` d'un autre champ (une purge, une rétention) ne peut
 * donc pas être pris pour celui-ci.
 */
const ROLLOVER_INTERVAL = /rollover_expires_at\s*:\s*\(\)\s*=>\s*`now\(\)\s*\+\s*interval\s*'(\d+)\s*days?'`/g

/** Toutes les durées de report écrites dans le code, dans l'ordre. */
function rolloverDaysInCode(source: string): number[] {
  return [...source.matchAll(ROLLOVER_INTERVAL)].map(match => Number(match[1]))
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. CE QUE LES CGV DISENT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Découpe la page des CGV en quatre régions, une par langue.
 *
 * La page est un composant unique : trois `if (locale === '…')` qui rendent
 * chacun leur tableau `sections={[…]}`, puis le français en repli. On repère
 * donc les quatre `sections={[`, et on attribue à chacun la langue du dernier
 * garde-fou `locale === '…'` rencontré depuis le précédent — le tableau qui
 * n'en a aucun devant lui est le repli, c'est-à-dire le français.
 *
 * ⚠️ Compter les `sections={[` et se fier à l'ORDRE d'écriture serait plus
 * court et faux le jour où quelqu'un réordonne les blocs.
 */
function localeRegions(page: string): { locale: Locale; text: string }[] {
  const starts: number[] = []
  for (let at = page.indexOf('sections={['); at !== -1; at = page.indexOf('sections={[', at + 1)) starts.push(at)

  return starts.map((start, index) => {
    const previous = index === 0 ? 0 : starts[index - 1]!
    const guards = [...page.slice(previous, start).matchAll(/locale === '([a-z]{2})'/g)]
    const found = guards.at(-1)?.[1]
    return {
      locale: (found ?? 'fr') as Locale,
      text: page.slice(start, index + 1 < starts.length ? starts[index + 1]! : page.length),
    }
  })
}

/** La section « Système de crédits » d'une région, en texte lisible. */
function creditClause(region: string): string | null {
  const at = region.indexOf("id: 'systeme-credits'")
  if (at === -1) return null
  const next = region.indexOf("id: '", at + "id: 'systeme-credits'".length)
  return plainText(region.slice(at, next === -1 ? region.length : next))
}

/**
 * Du JSX vers de la prose.
 *
 * Le JSX coupe les phrases en fin de ligne : « ne sont pas reportables sur la\n
 * période suivante » ne contient AUCUNE des expressions qu'on y cherche tant
 * que les retours à la ligne n'ont pas été aplatis. C'est la première façon
 * dont ce genre de garde devient borgne.
 */
function plainText(jsx: string): string {
  return jsx
    .replace(/\{'\s*'\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Les phrases d'un texte. Le point d'ancrage de toutes les vérifications :
 *  une négation qui vit trois phrases plus loin ne nie pas ce report-ci. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(one => one.trim())
    .filter(one => one.length > 0)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. LE SENS QU'ON Y CHERCHE
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ `\b` NE CONNAÎT PAS LES ACCENTS — la première version de cette garde est
 * morte là-dessus.
 *
 * En JavaScript, `\b` est calculé sur `[A-Za-z0-9_]`. « ü » n'en fait pas
 * partie, donc `/\bübertragen\b/` ne trouve JAMAIS « übertragen » : le mot est
 * précédé d'une espace (non-mot) et commence par un non-mot, il n'y a donc pas
 * de frontière. La garde était verte sur l'allemand — c'est-à-dire aveugle sur
 * une langue entière — pendant que la clause allemande niait le report.
 * Vérifié : `deniedIn` rendait `null` sur le texte qui était EN LIGNE.
 *
 * Toutes les frontières de mot passent donc par ces deux sentinelles, qui
 * comptent les lettres Unicode et exigent le drapeau `u`.
 */
const BEFORE = '(?<![\\p{L}\\p{N}_])'
const AFTER = '(?![\\p{L}\\p{N}_])'

/** Une alternance de mots entiers, accents compris. Jamais de drapeau `g` :
 *  `.test()` et `.match()` sont alors STATEFUL, et une garde qui alterne vrai
 *  et faux d'un appel à l'autre est pire que pas de garde. */
function words(...alternatives: string[]): RegExp {
  return new RegExp(`${BEFORE}(?:${alternatives.join('|')})${AFTER}`, 'iu')
}

/**
 * « Crédits NON UTILISÉS » — l'adjectif, retiré avant toute analyse.
 *
 * Sans ce blanchiment, la garde est borgne dans les deux sens : « non utilisés »
 * / « not used » / « nicht genutzte » / « niet gebruikt » portent une négation
 * qui ne nie PAS le report, et qui ferait lire « les crédits non utilisés sont
 * reportés » comme un refus. C'est exactement le motif du dépôt : une garde qui
 * découpe sans nettoyer.
 */
const UNUSED_ADJECTIVE: Record<Locale, RegExp> = {
  fr: new RegExp(`${BEFORE}non\\s+utilis[ée]s?${AFTER}`, 'giu'),
  en: new RegExp(`${BEFORE}(?:unused|not\\s+used)${AFTER}`, 'giu'),
  de: new RegExp(`${BEFORE}nicht\\s+genutzte[nrms]?${AFTER}`, 'giu'),
  nl: new RegExp(`${BEFORE}niet\\s+(?:zijn\\s+|is\\s+|worden\\s+)?gebruikte?${AFTER}`, 'giu'),
}

/**
 * Le VERBE du report, par langue.
 *
 * ⚠️ Il ne faut surtout pas y mettre les mots de la CESSIBILITÉ, qui sont
 * voisins et disent autre chose : l'allemand « übertragbar » et le néerlandais
 * « overdraagbaar » veulent dire *cessible à un tiers*, et la même clause écrit
 * « Credits sind weder umtauschbar noch erstattungsfähig noch übertragbar » /
 * « Credits zijn niet inwisselbaar, niet terugbetaalbaar en niet overdraagbaar »
 * — trois négations qui n'ont rien à voir avec le report. Une première version
 * de ce motif les lisait comme un refus de report : faux rouge garanti, et une
 * garde qu'on désactive.
 */
const ROLLS_OVER: Record<Locale, RegExp> = {
  fr: words('report(?:ables|able|ées|ée|és|é|es|e|s)?'),
  en: words('carr(?:y|ies|ied)\\s+over', 'carry-over', 'roll(?:s|ed)?\\s+over'),
  de: words('übertragen', 'übertragene[nrms]?', 'Übertragung(?:en)?'),
  nl: words('overgedragen', 'overdracht(?:en)?'),
}

/** La marque de la PÉRIODE SUIVANTE — ce dont on parle quand on parle du report. */
const NEXT_PERIOD: Record<Locale, RegExp> = {
  fr: /p[ée]riode\s+suivante/iu,
  en: /(?:following|next)\s+(?:billing\s+)?period/iu,
  de: /(?:folgenden|nächsten|naechsten)\s+(?:Abrechnungs)?[Zz]eitraum/iu,
  nl: /volgende\s+(?:facturerings)?periode/iu,
}

/** La négation, une fois « non utilisés » retiré. */
const NEGATION: Record<Locale, RegExp> = {
  // « n'est pas » : l'apostrophe n'est pas une lettre, donc `AFTER` la refuse —
  // ce cas a sa propre alternance, sans frontière à droite.
  fr: new RegExp(`${BEFORE}(?:ne|pas|jamais|non|aucune?)${AFTER}|${BEFORE}n['’]`, 'iu'),
  en: words('not', 'never', 'no', 'neither', 'nor', 'cannot'),
  de: words('nicht', 'kein(?:e|en|er|em|es)?', 'niemals'),
  nl: words('niet', 'geen', 'nooit'),
}

/** L'unité de temps qui fait d'un nombre une durée. */
const DAYS_UNIT: Record<Locale, string> = { fr: 'jours?', en: 'days?', de: 'Tagen?', nl: 'dagen' }

/**
 * Les nombres en toutes lettres que la garde sait lire.
 *
 * Les CGV écrivent leurs délais en toutes lettres (« quinze jours », « trente
 * jours ») ; la clause du report écrit les DEUX (« trente (30) jours »), pour
 * que le chiffre reste vérifiable sans casser le style du document. La garde
 * accepte l'une ou l'autre forme : imposer les chiffres condamnerait une
 * relecture juridique légitime.
 *
 * Une durée absente de cette table n'est pas une panne : seuls les chiffres
 * seront alors acceptés, et un texte resté en toutes lettres tombera — ce qui
 * est le bon résultat, puisque le chiffre du code aura changé.
 */
const SPELLED_OUT: Record<number, Record<Locale, string>> = {
  30: { fr: 'trente', en: 'thirty', de: 'dreißig|dreissig', nl: 'dertig' },
  60: { fr: 'soixante', en: 'sixty', de: 'sechzig', nl: 'zestig' },
  90: { fr: 'quatre-vingt-dix', en: 'ninety', de: 'neunzig', nl: 'negentig' },
}

/** « 30 jours », « trente (30) jours », « dreißig (30) Tagen ». */
function durationPattern(days: number, locale: Locale): RegExp {
  const spelled = SPELLED_OUT[days]?.[locale]
  const number = spelled ? `${days}|${spelled}` : `${days}`
  return new RegExp(`${BEFORE}(?:${number})${AFTER}[^.;!?]{0,30}?${BEFORE}(?:${DAYS_UNIT[locale]})${AFTER}`, 'iu')
}

/**
 * La phrase nie-t-elle le report ? — et si oui, laquelle.
 *
 * Une phrase nie le report quand elle parle de la PÉRIODE SUIVANTE et qu'une
 * négation précède le verbe de report. « Précède » compte : c'est l'ordre des
 * quatre langues (« ne sont pas reportables », « are not carried over »,
 * « werden nicht … übertragen », « worden niet overgedragen »), et il laisse
 * passer les incises qui suivent (« sofern … nicht ausdrücklich etwas anderes
 * bestimmt ist »), qui ne nient rien du tout.
 */
function deniedIn(clause: string, locale: Locale): string | null {
  for (const sentence of sentences(clause)) {
    if (!NEXT_PERIOD[locale].test(sentence)) continue
    const cleaned = sentence.replace(UNUSED_ADJECTIVE[locale], ' ')
    const verb = cleaned.match(ROLLS_OVER[locale])
    if (!verb || verb.index === undefined) continue
    if (NEGATION[locale].test(cleaned.slice(0, verb.index))) return sentence
  }
  return null
}

/** La clause affirme-t-elle le report POUR la durée du code ? */
function affirms(clause: string, locale: Locale, days: number): boolean {
  const duration = durationPattern(days, locale)
  return sentences(clause).some(sentence => {
    const cleaned = sentence.replace(UNUSED_ADJECTIVE[locale], ' ')
    const verb = cleaned.match(ROLLS_OVER[locale])
    if (!verb || verb.index === undefined) return false
    if (NEGATION[locale].test(cleaned.slice(0, verb.index))) return false
    return duration.test(cleaned)
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. LA GARDE
 * ═══════════════════════════════════════════════════════════════════════════ */

const page = readFileSync(CGV_PAGE, 'utf8')
const service = readFileSync(CREDITS_SERVICE, 'utf8')
const clauses = new Map<Locale, string>(
  localeRegions(page).flatMap(({ locale, text }) => {
    const clause = creditClause(text)
    return clause ? ([[locale, clause]] as [Locale, string][]) : []
  }),
)

describe('GA-92 — le corpus n’est pas vide', () => {
  it('lit vraiment les quatre CGV et le service de crédits', () => {
    // Sans ces assertions, un chemin cassé ou un extracteur muet rendrait tous
    // les tests suivants verts sur zéro texte lu — la garde borgne du dépôt.
    expect(page.length).toBeGreaterThan(20_000)
    expect(service.length).toBeGreaterThan(20_000)
    expect([...clauses.keys()].sort()).toEqual([...LOCALES].sort())
    for (const locale of LOCALES) {
      expect(clauses.get(locale)!.length, `La clause ${locale} est trop courte pour être la vraie.`).toBeGreaterThan(
        400,
      )
      // #4466.4 (Louis 23/10) — « usage inclus dans la formule » : le mot « crédits » ne figure plus dans les CGV.
      expect(clauses.get(locale)!, `La clause ${locale} ne parle pas de l'usage inclus.`).toMatch(
        /usage|Nutzung|gebruik/i,
      )
      // L'identifiant de section (`systeme-credits`) est une ancre, pas du texte lu par le client.
      expect(
        clauses.get(locale)!.replace("id: 'systeme-credits'", ''),
        `La clause ${locale} emploie encore le mot « crédits ».`,
      ).not.toMatch(/credit|crédit/i)
    }
  })

  it('trouve la durée du report dans le code, et une seule', () => {
    const found = rolloverDaysInCode(service)
    expect(
      found.length,
      "\nAucun `rollover_expires_at: () => `now() + interval 'N days'`` dans credits.service.ts.\n" +
        'Soit le report a changé de forme, soit il a déménagé : dans les deux cas,\n' +
        'la garde ne peut plus dire si les CGV disent vrai, et personne ne le saurait.\n',
    ).toBeGreaterThan(0)
    expect(
      [...new Set(found)],
      '\nDeux durées de report différentes coexistent dans le code.\n' +
        'La clause des CGV en annonce UNE, pour tous les paliers : elle est donc fausse\n' +
        'pour au moins un palier. Écrire la nuance dans les quatre langues, puis ici.\n',
    ).toHaveLength(1)
  })
})

describe('GA-92 — les CGV disent du report ce que le code en fait', () => {
  const days = rolloverDaysInCode(service)[0]!

  it.each([...LOCALES])('%s : la clause ne nie pas le report', locale => {
    const denied = deniedIn(clauses.get(locale)!, locale)
    expect(
      denied,
      `\nLes CGV (${locale}) refusent le report alors que le code le pratique :\n` +
        `credits.service.ts pose \`now() + interval '${days} days'\` à chaque renouvellement,\n` +
        'pour tous les paliers payants, sans exception.\n' +
        'Le texte qui FAIT FOI promet moins que le produit ne donne — corriger le TEXTE.\n' +
        `\nPhrase lue : « ${denied} »\n`,
    ).toBeNull()
  })

  it.each([...LOCALES])('%s : la clause annonce le report et sa durée', locale => {
    expect(
      affirms(clauses.get(locale)!, locale, days),
      `\nLes CGV (${locale}) n'annoncent pas le report sur ${days} jours.\n` +
        'Il faut une phrase qui applique le report aux crédits SANS négation devant,\n' +
        `et qui porte la durée du code (« ${days} », ou en toutes lettres) collée à son unité.\n` +
        `\nClause lue : « ${clauses.get(locale)!.slice(0, 700)} »\n`,
    ).toBe(true)
  })
})

/** La note « report » de la grille tarifaire publique, dans une langue. */
function rolloverNote(locale: Locale): string {
  const pricing = JSON.parse(readFileSync(join(MESSAGES, locale, 'pricing.json'), 'utf8')) as {
    plans?: { notes?: { rollover?: string } }
  }
  return pricing.plans?.notes?.rollover ?? ''
}

describe('GA-93 — la carte de tarifs annonce la durée du code', () => {
  it('lit vraiment les quatre notes de tarification', () => {
    for (const locale of LOCALES) {
      expect(rolloverNote(locale).length, `${locale} : la note de report est vide.`).toBeGreaterThan(20)
    }
  })

  it.each([...LOCALES])('%s : la note de report cite la durée du code', locale => {
    const days = rolloverDaysInCode(service)[0]!
    expect(
      durationPattern(days, locale).test(rolloverNote(locale)),
      `\nLa note « report » de la page tarifs (${locale}) n'annonce pas ${days} jours.\n` +
        "C'est le premier chiffre qu'un prospect lit, et c'est le code qui le tient.\n" +
        `\nNote lue : « ${rolloverNote(locale)} »\n`,
    ).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. ELLE SAIT DIRE NON
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('GA-92 — le détecteur sait dire NON', () => {
  /** Les quatre clauses EXACTEMENT telles qu'elles étaient en ligne le 30/08. */
  const wasOnline: Record<Locale, string> = {
    fr: "Les crédits non utilisés au cours d'une période de facturation ne sont pas reportables sur la période suivante, sauf mention contraire expresse dans la formule souscrite. L'acquisition de crédits supplémentaires peut être proposée selon les conditions affichées sur le Site. Les crédits ne sont ni échangeables, ni remboursables, ni cessibles.",
    en: 'Credits not used during a billing period are not carried over to the following period, unless expressly stated otherwise in the plan taken out. The purchase of additional credits may be offered under the conditions displayed on the Site. Credits are non-exchangeable, non-refundable and non-transferable.',
    de: 'Während eines Abrechnungszeitraums nicht genutzte Credits werden nicht auf den folgenden Zeitraum übertragen, sofern im abgeschlossenen Modell nicht ausdrücklich etwas anderes bestimmt ist. Der Erwerb zusätzlicher Credits kann zu den auf der Website angezeigten Bedingungen angeboten werden. Credits sind weder umtauschbar noch erstattungsfähig noch übertragbar.',
    nl: 'Credits die tijdens een factureringsperiode niet zijn gebruikt, worden niet overgedragen naar de volgende periode, tenzij uitdrukkelijk anders vermeld in de afgesloten formule. De aankoop van extra credits kan worden aangeboden onder de voorwaarden vermeld op de Site. Credits zijn niet inwisselbaar, niet terugbetaalbaar en niet overdraagbaar.',
  }

  it.each([...LOCALES])('%s : le refus qui était en ligne est reconnu', locale => {
    expect(deniedIn(wasOnline[locale], locale), `Refus non détecté (${locale}).`).not.toBeNull()
    expect(affirms(wasOnline[locale], locale, 30), `Faussement lu comme une promesse (${locale}).`).toBe(false)
  })

  it.each([...LOCALES])('%s : elle ne crie pas sur ce qui est VRAI', locale => {
    // La cessibilité, la non-reconduction d'un report, l'expiration d'une
    // recharge : trois phrases qui portent une négation et qui ne nient pas le
    // report. Une garde qui les casserait forcerait à réécrire du texte juste.
    const trueNeighbours: Record<Locale, string[]> = {
      fr: [
        'Les crédits ne sont ni échangeables, ni remboursables, ni cessibles.',
        "Les crédits acquis ponctuellement en complément expirent au terme de la période pour laquelle ils ont été acquis, et un report déjà accordé n'est pas reconduit.",
      ],
      en: [
        'Credits are non-exchangeable, non-refundable and non-transferable.',
        'Additional credits purchased on a one-off basis expire at the end of the period for which they were purchased, and a carry-over already granted is not renewed.',
      ],
      de: [
        'Credits sind weder umtauschbar noch erstattungsfähig noch übertragbar.',
        'Zusätzlich erworbene Credits verfallen mit dem Ende des Zeitraums, für den sie erworben wurden, und eine bereits gewährte Übertragung wird nicht verlängert.',
      ],
      nl: [
        'Credits zijn niet inwisselbaar, niet terugbetaalbaar en niet overdraagbaar.',
        'Extra aangekochte credits vervallen aan het einde van de periode waarvoor zij zijn gekocht, en een reeds toegekende overdracht wordt niet verlengd.',
      ],
    }
    for (const sentence of trueNeighbours[locale]) {
      expect(deniedIn(sentence, locale), `Faux positif (${locale}) : « ${sentence} »`).toBeNull()
    }
  })

  it('une durée qui ne vient pas du code n’est pas acceptée', () => {
    // Le cœur du cliquet : ce n'est pas « une durée » qui est exigée, c'est
    // CELLE du code. Sans ce test, « reportables sur 15 jours » passerait.
    const clause = 'Les crédits non utilisés sont reportés sur la période suivante pendant quinze (15) jours.'
    expect(affirms(clause, 'fr', 15)).toBe(true)
    expect(affirms(clause, 'fr', 30)).toBe(false)
  })

  it('une clause muette sur le report n’est pas prise pour un accord', () => {
    // Retirer la phrase entière est l'autre façon de casser le contrat : le
    // silence ne vaut pas promesse.
    const silent =
      "L'acquisition de crédits supplémentaires peut être proposée selon les conditions affichées sur le Site."
    expect(deniedIn(silent, 'fr')).toBeNull()
    expect(affirms(silent, 'fr', 30)).toBe(false)
  })

  it('l’extracteur de durée sait dire NON', () => {
    expect(rolloverDaysInCode('rien du tout')).toEqual([])
    expect(rolloverDaysInCode("rollover_expires_at: () => `now() + interval '45 days'`")).toEqual([45])
    // Un `interval` d'un AUTRE champ ne doit pas être pris pour celui du report.
    expect(rolloverDaysInCode("purge_at: () => `now() + interval '7 days'`")).toEqual([])
  })
})
