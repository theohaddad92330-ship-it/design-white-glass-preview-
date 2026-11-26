import { describe, expect, it } from 'vitest'
import { resources } from './resources'

/**
 * Ce que le produit n'a pas le droit de promettre (addendum final p79).
 *
 * Le rapport dresse une liste explicite : automatiser n'importe quel workflow
 * depuis le copilote, synchroniser complètement et bidirectionnellement tous les
 * CRM, envoyer en multicanal de façon autonome, lire LinkedIn, remplacer
 * BoondManager, produire un organigramme officiel à partir des seules données
 * publiques. Le code ne permet aucune de ces choses.
 *
 * Le risque n'est pas théorique. Une phrase d'interface est le seul endroit du
 * produit qu'un prospect lit VRAIMENT, et une promesse écrite là devient une
 * attente en réunion. Ce test lit donc tous les libellés FR et EN et refuse les
 * formulations qui promettent ce que le produit ne tient pas.
 *
 * Il ne cherche pas des mots-clés isolés — « envoyer » est légitime, « envoi
 * automatique » ne l'est pas. Chaque motif est une COMBINAISON, et chaque entrée
 * porte la raison de son interdiction : un futur contributeur doit pouvoir
 * comprendre le refus sans relire les 94 pages.
 */

/** Un aplatissement `namespace.chemin.de.clé` → texte, pour pouvoir nommer le
 *  coupable dans le message d'échec. */
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

const ALL_STRINGS: Map<string, string> = (() => {
  const out = new Map<string, string>()
  for (const [locale, namespaces] of Object.entries(resources)) {
    flatten(namespaces, locale, out)
  }
  return out
})()

/**
 * Les promesses interdites. `pattern` doit matcher une FORMULATION, jamais un mot
 * seul ; `why` dit ce que le code ne fait pas.
 */
/**
 * `allowedUnder` — le SEUL bloc de libellés où la formulation est permise.
 * Introduit le 11/10/2026 (#4016 L1) pour la probabilité calibrée : la phrase
 * « probabilité de signature » est légitime là où `CalibratedProbabilityView`
 * l'affiche avec sa méthode, son intervalle et ses axes, et nulle part ailleurs.
 */
const FORBIDDEN: { label: string; pattern: RegExp; why: string; allowedUnder?: RegExp }[] = [
  {
    label: 'envoi automatique',
    pattern:
      /(envoi|envois)\s+(automatique|automatiques)|envoie\s+automatiquement|sends?\s+automatically|automatic\s+sending/i,
    why: "Bellum PRÉPARE les messages ; l'envoi est un geste humain (règle produit « on prépare, l'utilisateur envoie »).",
  },
  {
    label: 'séquence qui part seule',
    pattern:
      /(séquence|campagne|cadence)[^.]{0,40}(part|partent|s'exécute|se déclenche)\s+(seule|seules|tout seul|automatiquement)/i,
    why: 'Une étape e-mail prépare un brouillon et pose un rappel — elle ne part jamais seule.',
  },
  {
    label: 'synchronisation CRM COMPLÈTE',
    // « Bidirectionnelle » est désormais VRAI et sort donc du motif : la donnée
    // circule dans les deux sens — lecture de la fiche CRM, remplissage des
    // champs vides, export — et un passage quotidien la maintient.
    //
    // « Complète » reste faux, et c'est une nuance qui se paie cher si on la
    // laisse passer : la boucle ne réconcilie pas tout. Elle remplit les blancs
    // et signale les écarts ; remplacer une valeur non vide côté client demande
    // une autorisation explicite d'opérateur (`CRM_SYNC_OVERWRITE`), et deux
    // champs seulement sont couverts. Promettre « complet » ferait attendre une
    // synchronisation de tous les champs, en continu, dans les deux sens — ce
    // qui n'existe pas.
    pattern: /synchronisation\s+(complète|totale)|(sync|synchronisation)\s+complète|full\s+(sync|synchronisation)/i,
    why:
      'La synchronisation est bien BIDIRECTIONNELLE (lecture de la fiche CRM, remplissage des ' +
      "champs vides, export, passage quotidien) — ce mot est autorisé. Mais elle n'est pas " +
      "COMPLÈTE : deux champs sont couverts, et l'écrasement d'une valeur non vide exige une " +
      "autorisation explicite d'opérateur. Dire « complète » ferait attendre une synchronisation " +
      "de tous les champs en continu, qui n'existe pas.",
  },
  {
    label: 'lecture ou action LinkedIn',
    pattern:
      /(lecture|lit|lisons|scrap\w*|extraction)[^.]{0,30}linkedin|linkedin[^.]{0,30}(automatiquement|scrap)|(read|scrape)s?\s+linkedin/i,
    why: "Aucune lecture LinkedIn n'est en place et l'API officielle ne l'autorise pas (cf. étude ToS).",
  },
  {
    label: 'remplacement d’un ERP/ATS',
    pattern: /remplace[^.]{0,30}(boond|erp|ats)|(replaces?)[^.]{0,30}(boond|erp|ats)/i,
    why: 'Bellum intègre ces outils ; il ne les remplace pas (principe « integrate first »).',
  },
  {
    label: 'organigramme officiel',
    pattern: /organigramme\s+(officiel|certifié|garanti)|(official|certified)\s+org\s?chart/i,
    why: "L'organigramme est reconstitué depuis des sources publiques, avec un niveau de confiance — jamais officiel.",
  },
  {
    label: 'probabilité NUE (chiffre écrit dans un libellé)',
    // GD-05 (tome 2 §27), et le 8ᵉ refus de l'arbitrage n°4 du 16/08 —
    // ⚠️ RENVERSÉ LE 11/10/2026 (décision Louis, #4016 L1) : la probabilité
    // s'affiche désormais, CALIBRÉE. Ce qui reste refusé, partout et sans
    // exception : un chiffre de chance écrit EN DUR dans un libellé. Le chiffre
    // vient du calcul (`calibratedProbabilitySchema`), avec ses axes et son
    // intervalle — jamais d'une phrase.
    //
    // Le motif vise la FORMULATION, jamais le mot « chance » ou « % » isolé :
    // « 40 % des comptes suivis » est une part mesurée, parfaitement légitime.
    pattern: /\d+\s*%\s*(de\s+)?(chances?|probabilit|réussite|succès)/i,
    why:
      'Une probabilité écrite en dur dans un libellé est NUE : ni méthode, ni intervalle, ni axes. ' +
      'Depuis le 11/10/2026 (#4016 L1), le chiffre vient du calcul calibré et s’affiche par ' +
      '`CalibratedProbabilityView`, jamais d’un texte.',
  },
  {
    label: 'probabilité de signature hors de la vue calibrée',
    // Même renversement (11/10/2026, #4016 L1). La formulation « probabilité de
    // signature / chance de closing » n'est permise QUE dans le bloc que lit la
    // vue calibrée (`projects.probability`). Ailleurs, elle promettrait une
    // probabilité sans ses axes.
    pattern:
      /(chances?|probabilit\S*)\s+(de|d’)\s*(closing|signature|gagner|conversion)|(probability|chance)\s+(of|to)\s+(clos|win|sign)/i,
    allowedUnder: /^(fr|en)\.projects\.probability\./,
    why:
      'Une probabilité de signature ne s’affiche que CALIBRÉE — méthode nommée, intervalle, axes, ' +
      'axes non évaluables nommés (#4016 L1, 11/10/2026). Son seul libellé vit dans ' +
      '`projects.probability`, lu par `CalibratedProbabilityView`.',
  },
  {
    label: 'brouillon sur un canal qui n’en a pas',
    // §7 du PDF 5. Une messagerie d'ÉQUIPE n'a pas de brouillon : le message
    // part, ou il ne part pas. Écrire « brouillon » à côté d'un canal de chat
    // laisse quelqu'un attendre un envoi qui ne partira jamais — et il ne
    // s'en apercevra qu'en constatant que le client n'a rien reçu.
    pattern: /brouillon[^.]{0,40}(teams|slack|discord|messagerie d.équipe|chat)|(teams|slack)[^.]{0,20}brouillon/i,
    why:
      "Une messagerie d'équipe n'a pas de brouillon : un message y part immédiatement. " +
      'Le canal doit annoncer qu’il envoie tout de suite, pas promettre une relecture.',
  },
  {
    label: 'facture émise par Bellum',
    pattern:
      /(bellum|nous)\s+(émet|émettons|génère|générons)[^.]{0,20}(facture|factures)|issues?\s+(the\s+)?invoices?/i,
    why: 'Arbitrage du 02/08 : Bellum suit la marge et les échéances, l’émission reste à l’outil comptable.',
  },
  {
    label: 'garantie de résultat',
    pattern:
      /(garantit|garantie de|nous garantissons)[^.]{0,30}(résultat|rendez-vous|réponse|conversion)|guarantees?\s+(results?|meetings?|replies)/i,
    why: 'Aucun résultat commercial ne peut être garanti par un outil.',
  },
  {
    label: 'résultat commercial attribué au produit',
    // Le motif exige un RÉSULTAT COMMERCIAL avant l'attribution : un document
    // « généré par BellumAI » l'est réellement, et interdire la tournure entière
    // ferait échouer des libellés parfaitement vrais.
    pattern:
      /(rdv|rendez-vous|opportunit[ée]s?|deals?|contrats?|meetings?|revenue)\s+(g[ée]n[ée]r[ée]s?|obtenus?|remport[ée]s?)\s+par\s+(bellum|l'outil|le\s+produit)|(meetings?|deals?|opportunit(y|ies)|revenue)\s+(generated|won)\s+by\s+bellum/i,
    why: "Un rendez-vous se décroche par un commercial. Rien dans le produit ne peut prouver ce qui l'a déclenché, et se l'attribuer transforme un compteur d'activité en promesse invérifiable (recette finale §16 — le ROI comme vanity metric). Un DOCUMENT généré par BellumAI, lui, l'est bien : le motif exige un résultat commercial.",
  },
  {
    label: 'workflow arbitraire depuis le copilote',
    pattern: /(n'importe quel|tout)\s+workflow|any\s+workflow/i,
    why: 'Le copilote ne peut lancer que les workflows du catalogue versionné, pas un workflow arbitraire.',
  },
  {
    label: 'objectif atteint automatiquement',
    // #2052.19 — aucune promesse de résultat automatique sur un objectif
    // déclaré. Le questionnaire ENREGISTRE un objectif (rendez-vous, comptes,
    // CA…) ; il ne garantit pas son atteinte. C'est l'interdit des
    // PROBABILITÉS (doctrine `c26_probabilite`, refusée six fois) appliqué au
    // même endroit : une projection présentée comme acquise ferait la même
    // promesse invérifiable qu'une chance de closing.
    //
    // Le motif exige NOUS/TU + un verbe d'ATTEINTE + UN OBJET nommé
    // (objectif, cible, rdv, comptes, CA, mission…) : « tu atteindras 20 RDV »
    // est visé, « atteins ton objectif en cliquant ici » (un bouton, pas une
    // promesse de résultat) ne l'est pas.
    pattern:
      /\b(tu|vous)\s+(atteindra|atteindras|atteindrez|feras|ferez|obtiendras|obtiendrez|décrocheras|décrocherez|signeras|signerez)\b[^.?!]{0,40}\b(objectifs?|cibles?|rdv|rendez-vous|comptes?|missions?|chiffre d'affaires|ca\b)|you\s+will\s+(achieve|reach|hit|meet|get)\s+(your\s+)?(goals?|targets?|objectives?|quota)/i,
    why:
      '#2052.19 — le questionnaire ENREGISTRE un objectif déclaré (rendez-vous, comptes, CA…), il ne garantit pas ' +
      'son atteinte. Aucun résultat commercial ne peut être garanti par un outil (même doctrine que « garantie de ' +
      'résultat » ci-dessus, appliquée spécifiquement aux objectifs).',
  },
  {
    label: 'délai de réponse du support',
    // #1960.14 — décision de Louis du 13/09/2026 : « On répond sous 24 h
    // ouvrées » est retiré. Aucun engagement de délai n'existe derrière la
    // boîte de support, et Laura a déjà l'interdit dans son prompt
    // (`apps/ia/app/prompts/laura_support.py`) : l'écran ne peut pas promettre
    // ce que la voix du produit s'interdit.
    //
    // Le motif exige NOUS (on / nous / we / our team) + le verbe de RÉPONSE +
    // un délai — chiffré, ou vague (« dans les plus brefs délais »). Un délai
    // qui n'est pas celui de notre réponse (« relance sous 3 jours s'il ne
    // répond pas », « délai de paiement sous 65 jours ») n'est pas visé.
    pattern:
      /\b(on|nous)\s+(te\s+|vous\s+|t'|vous\s+en\s+)?(répond\w*|revien\w*|recontact\w*)[^.?!]{0,40}(sous|en moins de|d'ici|dans les)\s+\d+\s*(h\b|heures?|jours?|min)|\b(on|nous)\s+(te\s+|vous\s+)?(répond\w*|revien\w*)[^.?!]{0,30}(dans les plus brefs délais|au plus vite|rapidement)|\b(we|our team)\s+(will\s+|'ll\s+)?(reply|respond|get back)[^.?!]{0,40}(within\s+\d+|in under\s+\d+|as soon as possible|shortly|quickly)/i,
    why:
      'Aucun délai de réponse du support n’est engagé (décision de Louis du 13/09/2026). Un délai écrit ' +
      'à l’écran devient une attente — et un reproche le jour où il n’est pas tenu. On dit qu’on revient ' +
      'vers la personne, sans délai.',
  },
]

/**
 * Les marqueurs de NÉGATION. Sans eux, la garde attraperait ses propres alliés :
 * « aucun envoi automatique » et « pas un organigramme officiel » sont exactement
 * les phrases qu'on veut voir dans le produit, et un test qui les refuse pousse à
 * les supprimer — c'est-à-dire à retirer la seule mention honnête de la limite.
 *
 * On regarde la fenêtre qui PRÉCÈDE le motif : en français comme en anglais, la
 * négation d'une promesse se place avant elle.
 */
const NEGATIONS = /\b(aucun|aucune|jamais|sans|ni|pas)\b|\b(no|not|never|without)\b/i

/** Taille de la fenêtre examinée avant le motif. Assez pour « — aucun », trop
 *  courte pour capter une négation qui portait sur une autre proposition. */
const NEGATION_WINDOW = 28

/** Le motif est-il ASSERTÉ, ou nié ? */
function isClaimed(text: string, pattern: RegExp): boolean {
  // `matchAll` exige le drapeau global : on reconstruit le motif plutôt que
  // d'imposer `g` à chaque entrée de la table (source d'oublis silencieux).
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)
  for (const match of text.matchAll(global)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - NEGATION_WINDOW), match.index ?? 0)
    if (!NEGATIONS.test(before.trimEnd())) return true
  }
  return false
}

describe('aucune promesse que le code ne tient pas (p79)', () => {
  it('lit bien tous les libellés — sinon le test ne prouve rien', () => {
    // Un aplatissement cassé rendrait le test vert sans rien vérifier : c'est le
    // mode de défaillance le plus insidieux d'une garde comme celle-ci.
    expect(ALL_STRINGS.size).toBeGreaterThan(2000)
    expect([...ALL_STRINGS.keys()].some(key => key.startsWith('fr.'))).toBe(true)
    expect([...ALL_STRINGS.keys()].some(key => key.startsWith('en.'))).toBe(true)
  })

  it.each(FORBIDDEN)('ne promet pas : $label', ({ pattern, why, allowedUnder }) => {
    const offenders = [...ALL_STRINGS.entries()]
      .filter(([key]) => !allowedUnder?.test(key))
      .filter(([, text]) => isClaimed(text, pattern))
      .map(([key, text]) => `${key} → « ${text.slice(0, 140)} »`)

    expect(offenders, `\n${why}\n\nLibellés fautifs :\n${offenders.join('\n')}\n`).toEqual([])
  })

  it('laisse passer une NÉGATION de la promesse — c’est la phrase qu’on veut', () => {
    // « Jamais d'envoi automatique » est la mention honnête de la limite : un
    // test qui la refuse pousse à la supprimer.
    const sendPattern = FORBIDDEN.find(entry => entry.label === 'envoi automatique')?.pattern as RegExp
    expect(isClaimed('Jamais d’envoi automatique — tu déclenches chaque email.', sendPattern)).toBe(false)
    expect(isClaimed('Aucun envoi automatique.', sendPattern)).toBe(false)
    expect(isClaimed('No automatic sending.', sendPattern)).toBe(false)
    // …et attrape bien l'affirmation.
    expect(isClaimed('Tes relances partent en envoi automatique.', sendPattern)).toBe(true)
  })

  it('attrape une probabilité NUE, et laisse passer une part mesurée', () => {
    const naked = FORBIDDEN.find(entry => entry.label.startsWith('probabilité NUE'))?.pattern as RegExp
    const outside = FORBIDDEN.find(entry => entry.label.startsWith('probabilité de signature hors'))
    const probability = new RegExp(`${naked.source}|${(outside?.pattern as RegExp).source}`, 'i')
    expect(isClaimed('78 % de chances de signer ce compte.', naked)).toBe(true)
    expect(isClaimed('Probabilité de closing : élevée.', probability)).toBe(true)
    expect(isClaimed('Chance of winning this deal.', probability)).toBe(true)
    // #4016 L1 (11/10/2026) — la formulation est permise dans le SEUL bloc
    // calibré, et nulle part ailleurs ; un chiffre en dur n'a aucun bloc permis.
    expect(ALL_STRINGS.has('fr.projects.probability.title')).toBe(true)
    expect(outside?.allowedUnder?.test('fr.projects.probability.title')).toBe(true)
    expect(outside?.allowedUnder?.test('fr.dashboard.kpi.closing')).toBe(false)
    expect(FORBIDDEN.find(entry => entry.label.startsWith('probabilité NUE'))?.allowedUnder).toBeUndefined()
    // Une PART mesurée n'est pas une probabilité : « 40 % des comptes suivis »
    // se compte, et l'interdire viderait la moitié des écrans de pilotage.
    expect(isClaimed('40 % des comptes suivis n’ont plus de prochaine action.', probability)).toBe(false)
    expect(isClaimed('Taux de réponse : 12 %.', probability)).toBe(false)
    // Et la NÉGATION reste dicible — c'est la phrase honnête.
    expect(isClaimed('Bellum n’affiche aucune probabilité de signature.', probability)).toBe(false)
  })

  // #2052.19 — la garde de l'objectif automatique sait dire NON, et n'attrape
  // pas une phrase voisine légitime (le bouton d'action, la négation).
  it('attrape une promesse d’atteinte automatique d’objectif, et laisse passer les phrases voisines', () => {
    const automatic = FORBIDDEN.find(entry => entry.label === 'objectif atteint automatiquement')?.pattern as RegExp
    // OUI — la promesse visée, en français comme en anglais.
    expect(isClaimed('Tu atteindras ton objectif de 20 RDV ce mois-ci.', automatic)).toBe(true)
    expect(isClaimed('Vous atteindrez vos comptes cibles avant la fin du trimestre.', automatic)).toBe(true)
    expect(isClaimed('You will achieve your targets this quarter.', automatic)).toBe(true)
    // NON — déclarer un objectif n'est pas promettre qu'il sera tenu.
    expect(isClaimed('Déclare ton objectif de rendez-vous pour ce mois.', automatic)).toBe(false)
    expect(isClaimed('Ton objectif : 3 nouveaux comptes ce mois-ci.', automatic)).toBe(false)
    // NON — la négation reste dicible, c'est la phrase honnête.
    expect(isClaimed('Bellum ne garantit jamais que tu atteindras ton objectif.', automatic)).toBe(false)
  })

  // #1960.14 — la garde du délai de support sait dire NON, et n'attrape pas les
  // délais qui ne sont pas celui de NOTRE réponse.
  it('attrape un délai de réponse du support, et laisse passer les délais voisins', () => {
    const delay = FORBIDDEN.find(entry => entry.label === 'délai de réponse du support')?.pattern as RegExp
    // NON — la phrase retirée, ses variantes, et la promesse vague.
    expect(isClaimed('Une question, un bug, ou une suggestion ? On répond sous 24 h ouvrées.', delay)).toBe(true)
    expect(isClaimed('A question, a bug or a suggestion? We reply within 24 business hours.', delay)).toBe(true)
    expect(isClaimed('Nous vous répondrons dans les plus brefs délais.', delay)).toBe(true)
    expect(isClaimed('Our team will get back to you shortly.', delay)).toBe(true)
    // Témoins — des délais qui ne sont pas celui de notre réponse.
    expect(isClaimed('Relance le contact sous 3 jours s’il ne répond pas.', delay)).toBe(false)
    expect(isClaimed('Délai de paiement sous 65 jours.', delay)).toBe(false)
    expect(isClaimed('Chaque séquence se met en pause dès que la personne répond.', delay)).toBe(false)
    expect(isClaimed('An external meeting takes place within 24 hours.', delay)).toBe(false)
    // La phrase neutre qu'on veut : revenir vers la personne, sans délai.
    expect(isClaimed('Écris-nous : on revient vers toi.', delay)).toBe(false)
    expect(isClaimed("Write to us and we'll get back to you.", delay)).toBe(false)
  })

  it('dit toujours POURQUOI une formulation est refusée', () => {
    // Sans la raison, un futur contributeur contournera le motif au lieu de
    // corriger la promesse.
    for (const entry of FORBIDDEN) {
      expect(entry.why.length).toBeGreaterThan(30)
    }
  })
})
