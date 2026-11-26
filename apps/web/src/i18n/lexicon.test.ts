import { describe, expect, it } from 'vitest'
import { resources } from './resources'

/**
 * La doctrine lexicale BellumAI (recette finale du 02/08, §5).
 *
 * Le principe tient en une phrase : le produit doit parler comme un expert du
 * développement commercial en ESN, jamais comme un CRM générique ni comme un
 * outil de staffing qui « vend des consultants ». Ce n'est pas de la cosmétique.
 * Le vocabulaire est ce qu'un prospect entend en réunion, et « quick win »,
 * « battle card » ou « zone blanche » disent tous la même chose de celui qui les
 * emploie : qu'il a repris le lexique d'un outil au lieu de celui du métier.
 *
 * Ce test lit tous les libellés FR et EN et refuse les termes bannis. Il est
 * volontairement distinct de {@link ./no-overpromise.test.ts} : celui-là refuse
 * les phrases qui promettent ce que le code ne fait pas, celui-ci refuse les
 * phrases qui disent la bonne chose avec le mauvais mot. Deux fautes
 * différentes, deux gardes qui échouent pour deux raisons lisibles.
 */

function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (typeof value === 'string') {
    out.set(path, value)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${key}` : key, out)
    }
  }
}

/**
 * Date à laquelle la doctrine a été arrêtée. Les entrées de changelog
 * ANTÉRIEURES en sont exemptes, et c'est délibéré : une entrée de changelog est
 * le compte rendu daté de ce qui a été annoncé aux utilisateurs ce jour-là. La
 * réécrire ne corrigerait pas le produit — elle falsifierait ce qu'on leur a
 * dit, et ferait disparaître la trace de l'ancien vocabulaire au moment même où
 * l'on prétend en changer. Toute entrée écrite À PARTIR de cette date, elle,
 * doit respecter la doctrine.
 */
const DOCTRINE_DATE = '2026-08-02'

/** Une clé de changelog porte sa date : `changelog.entries.2026-07-22-…`. */
const CHANGELOG_ENTRY = /\bchangelog\.entries\.(\d{4}-\d{2}-\d{2})-/

function isGrandfatheredChangelog(key: string): boolean {
  const date = CHANGELOG_ENTRY.exec(key)?.[1]
  return date !== undefined && date < DOCTRINE_DATE
}

const ALL_STRINGS: Map<string, string> = (() => {
  const out = new Map<string, string>()
  for (const [locale, namespaces] of Object.entries(resources)) {
    flatten(namespaces, locale, out)
  }
  for (const key of [...out.keys()]) {
    if (isGrandfatheredChangelog(key)) out.delete(key)
  }
  return out
})()

/**
 * Retire les segments entre guillemets français avant de chercher un terme banni.
 *
 * CITER un mot n'est pas l'EMPLOYER. L'entrée de changelog qui annonce le
 * changement doit pouvoir écrire « quick win » pour dire qu'il disparaît — sans
 * cette exception, la seule façon d'annoncer la correction serait de ne pas
 * nommer ce qu'on corrige, ce qui rend l'annonce inutile.
 *
 * La règle est étroite et vérifiable : seuls les guillemets typographiques
 * français comptent. Dans la copie du produit, ils marquent une citation ; un
 * libellé d'interface, lui, ne s'écrit pas entre guillemets.
 */
function withoutQuotations(text: string): string {
  return text.replace(/«[^»]*»/g, ' ').replace(/"[^"]*"/g, ' ')
}

/**
 * Les termes bannis, avec ce qu'il faut dire à la place.
 *
 * `pattern` cible le TERME, pas une combinaison — contrairement à la garde
 * anti-promesse, ici le mot seul est la faute. D'où l'attention portée aux
 * frontières de mots : « fil de discussion » est légitime, « thread achats » ne
 * l'est pas, et `\bthread\b` attraperait les deux si on ne bornait pas au sens
 * métier.
 */
const BANNED: { label: string; pattern: RegExp; instead: string }[] = [
  {
    label: 'quick win',
    pattern: /\bquick[- ]?wins?\b/i,
    instead: '« Action immédiate » / « première action recommandée » (FR), “Immediate action” (EN).',
  },
  {
    label: 'battle card',
    pattern: /\bbattle[- ]?cards?\b/i,
    instead:
      '« Fiche de positionnement concurrentiel » / « arguments face aux acteurs en place » (FR), “Competitive positioning sheet” (EN).',
  },
  {
    label: 'zone blanche',
    pattern: /\bzones?\s+blanches?\b|\bwhite\s?space\b/i,
    instead:
      '« Couverture à compléter » / « interlocuteur manquant » / « périmètre non couvert » (FR), “Account coverage” (EN).',
  },
  {
    label: 'thread (au sens commercial)',
    pattern: /\bthread\s+(achats?|commercial|procurement|sales)\b|\bmulti[- ]?threading\b/i,
    instead:
      '« Axe d’approche » / « mouvement commercial » / « séquence de contact » / « chemin d’accès » (FR). Un fil de conversation ou un fil Gmail reste un « thread » légitime.',
  },
  {
    label: 'fit offre',
    pattern: /\bfit\s?_?\s?offres?\b/i,
    instead: '« Adéquation avec vos expertises et votre capacité de delivery ».',
  },
  {
    label: 'vendre des consultants',
    pattern: /vendre\s+(des\s+)?(consultants?|profils?|ressources?)|sell(ing)?\s+consultants?/i,
    instead:
      '« Positionner vos experts » / « proposer une expertise » / « mobiliser une équipe » / « répondre à un projet ».',
  },
  {
    label: 'vendre à ce compte',
    pattern: /vendre\s+à\s+ce\s+compte|sell\s+to\s+this\s+account/i,
    instead: '« Ouvrir ce compte » / « entrer sur un périmètre » / « développer la relation ».',
  },
  {
    label: 'audit flash',
    pattern: /\baudits?\s+flash\b|\bflash\s+audits?\b/i,
    instead:
      '« Atelier de cadrage » / « renfort ciblé » / « mission pilote » / « expertise ponctuelle » — et seulement si c’est crédible.',
  },
  {
    label: 'contact détecté (comme libellé d’état)',
    pattern: /\bcontacts?\s+détectés?\b/i,
    instead: '« Profil identifié » / « interlocuteur potentiel » / « identité à vérifier ».',
  },

  /* ---------------------------------------------------------------- */
  /*  COPY-01 (audit terrain du 17/08) — la moitié « staffing » du     */
  /*  lexique, restée hors doctrine parce que les écrans Talents,      */
  /*  Missions et Projets sont arrivés APRÈS le 02/08.                 */
  /* ---------------------------------------------------------------- */
  {
    label: 'des personnes qu’on « vend »',
    // La garde « vendre des consultants » ne cherchait le verbe que SUIVI de son
    // objet. L'écran Talents disait « Les personnes que ton ESN vend » — même
    // faute, tournure inversée, et elle est passée jusqu'en production (TAL-01).
    //
    // Le motif exige que la PERSONNE soit le complément direct de la relative :
    // le nom colle au « que », et le verbe suit de près. Sans cette rigueur il
    // attrapait « rien n'a été adapté à ce que tu vends », où l'on vend une
    // offre — ce qui est parfaitement légitime.
    pattern: /\b(personnes?|profils?|consultants?|experts?|talents?)\s+(que|qu’|qu')\s*(?:\w+\s+){0,3}vends?\b/i,
    instead:
      '« Les experts que ton ESN peut positionner » / « proposer une expertise ». On ne vend pas des personnes : on répond à un besoin avec quelqu’un.',
  },
  {
    label: 'caser un profil',
    pattern: /\bcaser\s+(un\s+)?(profils?|consultants?|candidats?)\b/i,
    instead:
      '« Préparer une mise en relation » / « proposer un consultant qualifié ». « Caser » dit qu’on cherche à placer quelqu’un, pas à répondre à un besoin — c’est exactement la réputation dont une ESN essaie de sortir.',
  },
  {
    label: 'ressource (pour désigner une personne)',
    pattern:
      /\b(une|des|la|les)\s+ressources?\s+(disponibles?|qualifiées?|techniques?|humaines?)\b|\bnos\s+ressources\b/i,
    instead:
      '« Talent » / « expert » / « consultant ». Une personne n’est pas une ressource, et un client qui lit ce mot dans une proposition l’entend très bien.',
  },
  {
    label: 'matching générique',
    pattern: /\bmatching\s+(générique|automatique|simple)\b|\bgeneric\s+matching\b/i,
    instead:
      '« Correspondance argumentée » / « score de pertinence ». Un rapprochement qui ne dit pas POURQUOI ne vaut rien — c’est le même défaut que les comptes similaires sans justification (SIM-01).',
  },
]

/** #4485 — retire « marquer/marqué(e)s (comme) faites » : l'accord du participe passé, jamais un impératif. */
function withoutPastParticiple(value: string): string {
  return value.replace(/marqu(?:er|ée?s?|és)\s+(?:[^\s.?!]+\s+){0,2}?(?:comme\s+)?faites/gi, '')
}

describe('doctrine lexicale BellumAI (§5)', () => {
  it('lit bien tous les libellés — sinon le test ne prouve rien', () => {
    expect(ALL_STRINGS.size).toBeGreaterThan(2000)
    expect([...ALL_STRINGS.keys()].some(key => key.startsWith('fr.'))).toBe(true)
    expect([...ALL_STRINGS.keys()].some(key => key.startsWith('en.'))).toBe(true)
  })

  it.each(BANNED)('ne dit pas : $label', ({ pattern, instead }) => {
    const offenders = [...ALL_STRINGS.entries()]
      .filter(([, text]) => pattern.test(withoutQuotations(text)))
      .map(([key, text]) => `${key} → « ${text.slice(0, 140)} »`)

    expect(offenders, `\nÀ employer à la place : ${instead}\n\nLibellés fautifs :\n${offenders.join('\n')}\n`).toEqual(
      [],
    )
  })

  it('laisse passer une CITATION — annoncer le retrait d’un mot exige de le nommer', () => {
    // Sans cette exception, la seule façon d'annoncer la correction serait de
    // ne pas nommer ce qu'on corrige. On vérifie que l'exception est ÉTROITE :
    // le mot cité passe, le mot employé ne passe pas.
    const quickWin = BANNED.find(entry => entry.label === 'quick win')?.pattern as RegExp
    expect(quickWin.test(withoutQuotations('« Quick win » devient « action immédiate ».'))).toBe(false)
    expect(quickWin.test(withoutQuotations('Voici votre quick win du jour.'))).toBe(true)
  })

  it('laisse passer un fil de conversation — le mot « thread » n’est pas banni en soi', () => {
    // Le chat et Gmail ont de vrais threads. Bannir le mot entier casserait des
    // libellés justes et pousserait à inventer un synonyme pour rien.
    const threadPattern = BANNED.find(entry => entry.label.startsWith('thread'))?.pattern as RegExp
    expect(threadPattern.test('Nouvelle conversation')).toBe(false)
    expect(threadPattern.test('Recent Gmail threads')).toBe(false)
    expect(threadPattern.test('multi-threading, thread achats')).toBe(true)
  })

  /**
   * §55, revu le 13/09/2026 (décision Louis, batch 15, `.claude/notes/decisions-2026-09-12.md`).
   *
   * L'axe D354 (CLAUDE.md, déjà écrit pour le site public) s'étend ici à
   * l'application : « l'outil du client se nomme s'il est branché, notre
   * fournisseur jamais, un registre public oui parce que le nom EST la
   * garantie. » Le critère n'est donc pas l'ÉCRAN mais À QUI APPARTIENT L'OUTIL :
   *
   *   - un FOURNISSEUR DE DONNÉES PRIVÉ (Apollo, Pappers, Firecrawl, SalesQL,
   *     Dropcontact, Serper, Tavily) ne se nomme JAMAIS dans la vue métier —
   *     « le client achète BellumAI, pas une addition d'APIs », et ils sont
   *     interchangeables ;
   *   - un REGISTRE PUBLIC (BOAMP, BODACC, DECP, France Travail, APEC,
   *     SEC EDGAR) se nomme au contraire : un commercial qui cite le BOAMP en
   *     rendez-vous cite une source officielle, le nom EST la garantie.
   *
   * L'ancienne regex mélangeait les deux (#1912.11) : 8 libellés FR/EN
   * légitimes (BOAMP, BODACC, DECP, France Travail) étaient accusés à tort.
   * NE JAMAIS refusionner ces deux listes en une seule — c'est exactement
   * l'erreur que ce commentaire existe pour empêcher de refaire.
   */
  const FOURNISSEURS_PRIVES = /\b(Apollo|Pappers|Firecrawl|SalesQL|Dropcontact|Serper|Tavily)\b/
  const REGISTRES_PUBLICS = /\b(BOAMP|BODACC|DECP|France Travail|APEC|SEC EDGAR)\b/

  it('ne nomme aucun FOURNISSEUR DE DONNÉES PRIVÉ dans la vue métier (§55, D354)', () => {
    // Filet du filet : si l'aplatissement casse, cette garde serait verte sur du vide.
    expect(ALL_STRINGS.size).toBeGreaterThan(0)

    const offenders = [...ALL_STRINGS.entries()]
      .filter(
        ([key]) => !key.includes('.integrations.') && !key.startsWith('fr.settings') && !key.startsWith('en.settings'),
      )
      .filter(([, text]) => FOURNISSEURS_PRIVES.test(text))
      .map(([key, text]) => `${key} → « ${text.slice(0, 120)} »`)

    expect(
      offenders,
      '\nNommer la CAPACITÉ : « registre officiel », « réseau professionnel », « marchés publics », « offres d’emploi ».\n' +
        `\nLibellés fautifs :\n${offenders.join('\n')}\n`,
    ).toEqual([])
  })

  it('sait dire NON — un fournisseur privé glissé dans un libellé reste détecté (§55)', () => {
    // Témoin de non-régression : la garde doit continuer à attraper un VRAI
    // fournisseur, pas seulement laisser passer les registres publics.
    const probe = new Map(ALL_STRINGS)
    probe.set('fr.__probe__.title', 'Détecté grâce à Apollo')
    const offenders = [...probe.entries()]
      .filter(
        ([key]) => !key.includes('.integrations.') && !key.startsWith('fr.settings') && !key.startsWith('en.settings'),
      )
      .filter(([, text]) => FOURNISSEURS_PRIVES.test(text))
      .map(([key]) => key)

    expect(offenders).toEqual(['fr.__probe__.title'])
  })

  it('laisse passer un REGISTRE PUBLIC — le nom EST la garantie (§55, D354)', () => {
    // Témoin écrit en dur : ces six noms faisaient échouer la garde avant
    // #1912.11. Ils ne doivent plus jamais être pris pour un fournisseur privé.
    for (const registre of ['BOAMP', 'BODACC', 'DECP', 'France Travail', 'APEC', 'SEC EDGAR']) {
      expect(FOURNISSEURS_PRIVES.test(registre)).toBe(false)
      expect(REGISTRES_PUBLICS.test(registre)).toBe(true)
    }
  })

  it('exempte les entrées de changelog ANTÉRIEURES à la doctrine, et elles seules', () => {
    // Le risque de cette exemption est qu'elle serve de porte dérobée : il
    // suffirait de dater une entrée dans le passé pour écrire n'importe quoi.
    // On vérifie donc que la borne est bien une DATE, pas le namespace entier.
    expect(isGrandfatheredChangelog('fr.changelog.entries.2026-07-22-quick-wins-dates.title')).toBe(true)
    expect(isGrandfatheredChangelog('fr.changelog.entries.2026-08-02-recette-finale.title')).toBe(false)
    expect(isGrandfatheredChangelog('fr.changelog.entries.2026-09-01-nouveaute.title')).toBe(false)
    expect(isGrandfatheredChangelog('fr.changelog.menu.title')).toBe(false)
    expect(isGrandfatheredChangelog('fr.accountDetail.coverage.title')).toBe(false)
  })

  it('dit toujours ce qu’il faut employer à la place', () => {
    // Une garde qui refuse sans proposer se contourne : le contributeur suivant
    // cherchera un synonyme au lieu du terme métier.
    for (const entry of BANNED) {
      expect(entry.instead.length).toBeGreaterThan(20)
    }
  })
})

describe('le coût annoncé ne contredit jamais la grille (§11)', () => {
  it('aucun libellé ne dit qu’une analyse coûte un crédit', () => {
    // Le §11 exige que le site, l'app, Stripe, les CGV et le back-office
    // décrivent LE MÊME crédit. Une phrase oubliée — « 1 analyse consomme
    // 1 crédit » sur l'écran de facturation, « coût estimé : 1 crédit » sur
    // Découvrir — annonce un huitième du prix réel, et l'utilisateur découvre
    // l'écart au débit. C'est le pire endroit pour se tromper : celui où il
    // décide de payer.
    const CONTRADICTIONS = [
      /\b(une?\s+)?analyse[^.]{0,40}\b1\s+cr[ée]dit\b/i,
      /\banalysis[^.]{0,40}\b1\s+credit\b/i,
      /\bdossier\s+complet[^.]{0,40}\b1\s+cr[ée]dit\b/i,
      /chaque\s+cr[ée]dit\s+vaut\s+une\s+action/i,
      /\bune\s+action\s*=\s*un\s+cr[ée]dit\b/i,
    ]
    const offenders = [...ALL_STRINGS.entries()]
      .filter(([, text]) => CONTRADICTIONS.some(rx => rx.test(text)))
      .map(([key, text]) => `${key} → « ${text.slice(0, 140)} »`)

    expect(
      offenders,
      '\nUne analyse complète coûte 8 crédits (CREDIT_WEIGHTS.account_analysis).\n' +
        `\nLibellés fautifs :\n${offenders.join('\n')}\n`,
    ).toEqual([])
  })
})

/**
 * Le tutoiement de l'interface (recette finale §6).
 *
 * Le rapport le demande explicitement : « Tutoyer l'utilisateur dans l'interface
 * — “Théo, voici pourquoi ce compte mérite ton attention” ». La règle porte sur
 * l'INTERFACE, pas sur les messages produits pour un prospect : le §41 tranche
 * l'inverse pour ceux-là (« Ton : tutoiement par défaut entre pairs, vouvoiement
 * C-level / contexte institutionnel » sur LinkedIn, « vouvoiement par défaut »
 * en e-mail). Ces messages sont écrits par les prompts, pas par les libellés —
 * les deux surfaces ne se croisent donc pas, et les prompts gardent leur
 * doctrine.
 *
 * À la différence des termes bannis ci-dessus, cette garde n'exempte PAS les
 * entrées de changelog antérieures à la doctrine. Le distinguo est volontaire :
 * une entrée qui dit « zone blanche » est la TRACE d'un vocabulaire qu'on a
 * employé, et l'effacer ferait disparaître la preuve au moment où l'on prétend
 * en changer ; un « vous » ne prouve rien. C'est du texte lu aujourd'hui, dans
 * une interface qui dit « tu » partout ailleurs — le laisser fait basculer le ton
 * dès qu'on ouvre le panneau Nouveautés.
 */
describe('l’interface tutoie l’utilisateur (§6)', () => {
  /** « rendez-vous » est un NOM. Il n'a rien à voir avec le vouvoiement, et une
   *  garde qui le refuse pousse à écrire « RDV » partout. */
  const RENDEZ_VOUS = /rendez-vous/gi

  /** Libellés où le vouvoiement est INTENTIONNEL, avec la raison. Toute entrée
   *  ajoutée ici doit dire à QUI le libellé parle — c'est la seule chose qui
   *  distingue une exception d'un oubli. */
  const VOUVOIEMENT_INTENTIONNEL: { key: string; reason: string }[] = [
    // ⚠️ Ces clés vivaient à `fr.brief.questions.*` / `fr.brief.objections.*`
    // jusqu'à ce que le brief passe par MODE (premier rendez-vous, point client,
    // partenaire, défense). Les exceptions, elles, étaient restées sur les
    // anciennes clés : elles n'exemptaient donc plus rien, et la garde a rougi
    // sur des scripts de rendez-vous qu'elle n'a jamais visés. Le test
    // « chaque exception désigne une clé qui EXISTE », plus bas, est là pour que
    // la prochaine restructuration se voie tout de suite.
    {
      key: 'fr.briefing.agenda.brief.pitch.sentence.answer_no_stake',
      reason: 'Phrase d’ouverture que le commercial DIT au prospect en premier rendez-vous (#4424) — adressée à lui.',
    },
    {
      key: 'fr.briefing.agenda.brief.pitch.sentence.ask',
      reason: 'Question que le commercial POSE au prospect — elle se lit à voix haute.',
    },
    {
      key: 'fr.briefing.agenda.brief.pitch.sentence.ask_workshop',
      reason: 'Proposition d’atelier dite au prospect — adressée à lui, pas à l’utilisateur.',
    },
    {
      key: 'fr.brief.modes.first_meeting.questions.0',
      reason: 'Question que le commercial POSE au prospect en rendez-vous — elle se lit à voix haute.',
    },
    {
      key: 'fr.brief.modes.first_meeting.questions.2',
      reason: 'Idem : script de rendez-vous, adressé au client, pas à l’utilisateur.',
    },
    {
      key: 'fr.brief.modes.first_meeting.questions.3',
      reason: 'Idem. « Comment tu staffes » ne se dit pas à un directeur qu’on rencontre pour la première fois.',
    },
    {
      key: 'fr.brief.modes.first_meeting.objections.2',
      reason: 'Objection RAPPORTÉE — ce que le client dit, entre guillemets. La corriger la rendrait fausse.',
    },
    {
      key: 'fr.brief.modes.client_checkin.questions.0',
      reason: 'Question posée au client pendant le point de suivi — adressée à lui, pas à l’utilisateur.',
    },
    {
      key: 'fr.brief.modes.partner.questions.0',
      reason: 'Question posée au PARTENAIRE — un interlocuteur externe se vouvoie.',
    },
    {
      key: 'fr.brief.modes.partner.questions.1',
      reason: 'Idem : script de rendez-vous partenaire.',
    },
    {
      key: 'fr.brief.modes.partner.questions.2',
      reason: 'Idem : script de rendez-vous partenaire.',
    },
    {
      key: 'fr.brief.modes.partner.objections.2',
      reason: 'Objection RAPPORTÉE du partenaire, entre guillemets.',
    },
    {
      key: 'fr.brief.modes.defense.questions.1',
      reason: 'Question posée au client quand un concurrent est en lice — adressée à lui.',
    },
    {
      key: 'fr.brief.modes.defense.objections.1',
      reason: 'Objection RAPPORTÉE du client, entre guillemets.',
    },
    {
      key: 'fr.briefing.conflictDialog.warnDialog.body',
      reason:
        'Brouillon de mail à envoyer à un invité EXTERNE sans fiche CRM (conflit de rendez-vous) — adressé à lui, pas à l’utilisateur.',
    },
    // Refonte Théo (séquences › bibliothèque) — les MODÈLES DE DÉPART sont des e-mails que le commercial
    // ENVOIE au prospect ou au client : objet et corps lui sont adressés, et un interlocuteur externe se
    // vouvoie (« vouvoiement par défaut » en e-mail). Clé par clé, pour que l'existence de chacune reste vérifiée.
    ...[
      'prospecting.0.subject',
      'prospecting.0.body',
      'prospecting.1.subject',
      'prospecting.1.body',
      'development.0.subject',
      'development.0.body',
      'development.1.subject',
      'development.1.body',
      'development.2.body',
      'meeting.0.body',
      'meeting.1.body',
      'meeting.2.body',
      'staffing.0.subject',
      'staffing.0.body',
      'staffing.1.subject',
      'staffing.1.body',
      'staffing.2.body',
      'mission_follow_up.1.body',
      'mission_follow_up.2.body',
      'admin.0.body',
      'admin.1.body',
      'admin.2.body',
    ].map(suffix => ({
      key: `fr.outreach.libraryView.model.starter.${suffix}`,
      reason: 'Modèle d’e-mail de départ ENVOYÉ au prospect ou au client — adressé à lui, pas à l’utilisateur.',
    })),
  ]

  const VOUVOIEMENT = /\b(vous|votre|vos)\b/i

  it('n’emploie plus vous / votre / vos dans les libellés FR', () => {
    const exempt = new Set(VOUVOIEMENT_INTENTIONNEL.map(entry => entry.key))
    const offenders: string[] = []
    for (const [key, value] of ALL_STRINGS) {
      if (!key.startsWith('fr.')) continue
      if (exempt.has(key)) continue
      const withoutNoun = value.replace(RENDEZ_VOUS, 'RDV')
      if (VOUVOIEMENT.test(withoutNoun)) offenders.push(`${key} → ${value}`)
    }
    expect(offenders).toEqual([])
  })

  it('ne laisse pas de verbe à la 2e personne du pluriel', () => {
    // Le piège du passage au tutoiement : convertir le pronom en oubliant
    // l'accord (« tu pouvez »), ou laisser un impératif pluriel isolé
    // (« Cliquez ici ») que plus aucun « vous » ne signale.
    // Les frontières sont des lookarounds sur LETTRES, pas des `\b` : en
    // JavaScript, `\b` ne connaît que l'ASCII, si bien que `\bêtes\b` matche au
    // milieu de « requêtes » — le « ê » n'étant pas un caractère de mot, une
    // frontière s'ouvre juste devant lui. Le test accusait donc « 120
    // requêtes/min » de vouvoyer.
    // ⚠️ LE PRÉFIXE. La liste porte des formes CONJUGUÉES écrites à la main, et
    // une liste ne voit jamais ce qui n'y est pas : `lancez` y était, `relancez`
    // non — et le lookaround sur lettres le fait manquer, puisque le `e` de
    // « re » ferme la frontière. Trouvé EN RECETTE, à l'écran d'une démo :
    // « Relancez une analyse pour l'obtenir. » Le `(?:r[eé]?)?` optionnel couvre
    // d'un coup relancez / réessayez / reconnectez / revérifiez, sans allonger
    // la liste — mesuré au moment de le poser : UNE seule chaîne du dépôt en
    // profitait, donc la garde ne s'ouvre sur aucun rouge préexistant.
    const SECOND_PLURAL =
      /(?<![A-Za-zÀ-ÿ])(?:r[eé]?)?(avez|êtes|pouvez|devez|voulez|savez|attendez|cherchez|obtenez|partagez|préparez|retrouvez|travaillez|cliquez|choisissez|sélectionnez|connectez|ajoutez|lancez|vérifiez|essayez|créez|recevez|utilisez|gérez|laissez|mettez|indiquez|renseignez|complétez|consultez|importez|exportez|activez|configurez|répondez|envoyez|invitez|analysez|corrigez|validez|confirmez|annulez|prenez|faites|soyez)(?![A-Za-zÀ-ÿ])/i
    const exempt = new Set(VOUVOIEMENT_INTENTIONNEL.map(entry => entry.key))
    const offenders: string[] = []
    for (const [key, value] of ALL_STRINGS) {
      if (!key.startsWith('fr.')) continue
      if (exempt.has(key)) continue
      if (SECOND_PLURAL.test(withoutPastParticiple(value))) offenders.push(`${key} → ${value}`)
    }
    expect(offenders).toEqual([])
  })

  it('« faites » participe passé (« marquées faites ») n’est pas un impératif, « Faites » le reste', () => {
    // #4485 (Louis 24/10) — « les marquer faites ? » : l'accord du participe, pas un vouvoiement. La garde
    // l'accusait ; elle doit savoir ne pas attraper ce qu'elle ne vise pas, et continuer à dire NON.
    const SECOND_PLURAL = /(?<![A-Za-zÀ-ÿ])faites(?![A-Za-zÀ-ÿ])/i
    expect(SECOND_PLURAL.test(withoutPastParticiple('3 actions en retard — les marquer faites ?'))).toBe(false)
    expect(SECOND_PLURAL.test(withoutPastParticiple('{{count}} actions marquées faites'))).toBe(false)
    expect(SECOND_PLURAL.test(withoutPastParticiple('Impossible de marquer ces actions faites.'))).toBe(false)
    expect(SECOND_PLURAL.test(withoutPastParticiple('Faites un essai.'))).toBe(true)
  })

  it('chaque exception désigne une clé qui EXISTE — une exception morte n’exempte rien', () => {
    // La garde d'avant a rougi parce que six exceptions pointaient des clés
    // disparues dans une restructuration : elles n'exemptaient plus rien, et
    // personne ne pouvait le voir. Une exception qui ne désigne aucun libellé
    // est un oubli en train de se former.
    const connues = new Set<string>()
    for (const [key] of ALL_STRINGS) connues.add(key)
    expect(VOUVOIEMENT_INTENTIONNEL.length).toBeGreaterThan(0)
    expect(VOUVOIEMENT_INTENTIONNEL.filter(entry => !connues.has(entry.key)).map(e => e.key)).toEqual([])
  })

  it('laisse passer le nom « rendez-vous »', () => {
    const withNoun = 'Crée tes rendez-vous depuis Bellum.'
    expect(VOUVOIEMENT.test(withNoun.replace(RENDEZ_VOUS, 'RDV'))).toBe(false)
  })
})
