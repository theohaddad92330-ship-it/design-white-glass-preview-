import { z } from 'zod'
import {
  CLOSED_STAGES,
  INTAKE_STAGES,
  isPipelineStage,
  PROJECT_STAGES,
  projectRowSchema,
  type Btmmp,
  type ProjectStage,
} from './project.js'

/**
 * L'ontologie « fait → projet → opportunité → action → résultat »
 * (addendum final p42-46).
 *
 * L'écran Besoins empilait cinq mots pour la même chose : besoin, signal,
 * chantier IT, projet, opportunité. La même donnée apparaissait dans plusieurs
 * onglets sans qu'aucune progression ne soit lisible, et surtout le mot
 * « besoin » désignait aussi bien un recrutement repéré sur une page carrière
 * qu'une demande explicitement formulée par un client. Ce n'est pas un problème
 * de vocabulaire : c'est un problème de PREUVE. Les deux ne s'actionnent pas
 * pareil, et les confondre fait écrire à un DSI qu'on a « noté son besoin »
 * quand il n'a rien demandé.
 *
 * Ce module fige les définitions et, surtout, ce que chaque niveau EXIGE pour
 * exister. La règle qui porte tout le reste :
 *
 *     « Le mot besoin est réservé à une demande explicitement confirmée. Une
 *       actualité ou un recrutement ne prouve pas à lui seul un besoin ouvert. »
 *
 * Rien ici ne remplace le modèle existant : `projectStageSchema` reste
 * la colonne en base. On ajoute le VOCABULAIRE de restitution et les gardes qui
 * empêchent de sauter un niveau — une migration d'enum aurait déplacé le risque
 * sur des données réelles sans rien régler du fond.
 */

// ── Les six objets (p43) ─────────────────────────────────────────────────────

export const evidenceLevelSchema = z.enum([
  /** Un événement daté et sourcé. Nomination, recrutement, appel d'offres, résultat financier. */
  'fact',
  /** Une interprétation qui relie PLUSIEURS faits. Jamais un seul. */
  'detected_project',
  /** Une demande que quelqu'un a explicitement formulée. Le geste est observé,
   *  jamais son auteur — voir {@link EVIDENCE_REQUIREMENTS}. */
  'confirmed_demand',
  /** Projet ou demande + fit ESN + périmètre + décideurs + prochaine action. */
  'opportunity',
])
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>

/**
 * Ce que chaque niveau exige pour être revendiqué. Ce n'est pas de la
 * documentation : {@link meetsEvidenceLevel} l'applique, et c'est ce qui
 * empêche un compteur de « besoins » d'être gonflé par des signaux.
 */
export const EVIDENCE_REQUIREMENTS: Record<EvidenceLevel, { fr: string; en: string }> = {
  fact: {
    fr: 'Un événement daté ET sourcé.',
    en: 'A dated AND sourced event.',
  },
  /**
   * ⚠️ CORRIGÉ LE 28/08/2026 — décision de Louis (D27). Ne pas « restaurer »
   * l'exigence d'avant sans relire ce qui suit.
   *
   * CE QU'IL DEMANDAIT :
   *     « Au moins deux faits datés qui convergent — un signal isolé ne fait
   *       pas un projet. »
   *
   * POURQUOI IL A CHANGÉ. Le jour où ce barème a enfin été BRANCHÉ, un lot a
   * mesuré l'espace des états au lieu de le supposer : sur les 2 048 formes
   * possibles d'une ligne au stade `detected`, ZÉRO le franchissait. Et c'était
   * STRUCTUREL, pas accidentel — une ligne `opportunities` ne porte QU'UN fait
   * daté (le sien), et rien dans la table ne rattache un second fait convergent
   * au même projet. Le barème exigeait donc une donnée que le produit ne
   * collecte pas. L'écran annonçait pendant ce temps « 383 projets détectés à
   * reprendre » : une population dont AUCUN membre ne satisfaisait notre propre
   * définition d'un projet détecté.
   *
   * L'arbitrage : **un barème qui exige ce que le produit ne collecte pas est
   * faux, pas la donnée.** On le rend atteignable — sans le vider.
   *
   * POURQUOI CES EXIGENCES-LÀ. « Un fait daté + une source identifiée » était la
   * piste ; la mesure l'a écartée, parce que c'est MOT POUR MOT la définition du
   * niveau `fact` juste au-dessus. Deux barreaux identiques ne sont pas une
   * échelle : ç'aurait été abaisser le seuil jusqu'à ce que ça passe, pas écrire
   * une définition.
   *
   * Ce que la table porte VRAIMENT en plus du fait, c'est la LECTURE qui en fait
   * un chantier : l'offre ou le domaine que ce fait appelle (`offer`,
   * `primary_domain_code`), le périmètre (`amount_cents`, `expected_close_on`,
   * BTMMP budget/timing), le décideur (BTMMP management), la prochaine action
   * (BTMMP nextStep). « Détecté » veut dire exactement ça : on a LU un projet
   * dans un événement. Un événement que rien ne rattache à un travail qu'on
   * pourrait faire reste ce qu'il est — un fait — et le manque
   * `unattached_fact` dit en un mot ce qui le promouvrait.
   *
   * La règle d'origine est CONSERVÉE comme chemin alternatif : deux faits qui
   * convergent, ou une parole, valent toujours. Rien ne perd son niveau.
   */
  detected_project: {
    fr: 'Un fait daté et sourcé, plus au moins un élément qui le rattache à un chantier : une offre ou un domaine, un périmètre, un décideur, ou une prochaine action. Une demande exprimée, ou deux faits datés qui convergent, valent aussi.',
    en: 'A dated and sourced fact, plus at least one element tying it to a piece of work: an offer or a domain, a perimeter, a decision maker, or a next action. An expressed demand, or two converging dated facts, also qualify.',
  },
  /**
   * ⚠️ RÉÉCRIT le 28/08/2026 (D50 · 26/08). Ne pas restaurer l'ancienne.
   *
   * ANCIENNE : « Une demande explicitement exprimée par un contact, le CRM ou
   *             l’utilisateur. »
   * NOUVELLE : voir ci-dessous.
   *
   * POURQUOI : l'ancienne annonçait TROIS provenances ; le code ne peut en
   * observer qu'UNE. Sur une ligne `opportunities`, le seul témoin d'une parole
   * est `isPipelineStage(row.stage)` — quelqu'un a porté la ligne dans une
   * colonne du pipe à la main. Ni « contact » ni « CRM » ne sont portés nulle
   * part sur la ligne : rien ne les distingue, ni l'un de l'autre, ni de
   * l'utilisateur. Le barème promettait donc deux choses que la donnée ne peut
   * pas dire.
   *
   * Ce n'est pas le VERDICT qui était faux — il ne change pas d'un pouce — c'est
   * l'exigence AFFICHÉE, celle qu'un commercial lit à côté d'une ligne pour
   * savoir quoi faire. Elle nomme désormais ce qui est observé (le geste) et ce
   * qui ne l'est pas (son auteur), au lieu d'énumérer trois canaux comme si le
   * produit savait les reconnaître.
   *
   * Ce qui N'A PAS été fait, et pourquoi : abaisser l'exigence jusqu'à ce que
   * les trois provenances « passent » aurait été inventer deux témoins. Et
   * porter la provenance sur la ligne demande une colonne, donc une migration —
   * une autre décision, qui n'est pas celle-ci.
   */
  confirmed_demand: {
    fr: 'Une demande que quelqu’un a explicitement formulée. Ce qui est observé est le GESTE — la ligne portée à la main dans le pipe — jamais son auteur : contact, CRM ou vous, rien ne les distingue.',
    en: 'A demand somebody explicitly voiced. What is observed is the GESTURE — the row carried by hand into the pipeline — never its author: contact, CRM or you, nothing tells them apart.',
  },
  /**
   * ⚠️ RÉÉCRIT le 28/08/2026 (D50 · 26/08). Ne pas restaurer l'ancienne.
   *
   * ANCIENNE : « Un projet ou une demande, un fit avec l’offre, un périmètre,
   *             des décideurs et une prochaine action. »
   * NOUVELLE : voir ci-dessous.
   *
   * POURQUOI : « un projet OU une demande » annonçait DEUX portes. La première —
   * le faisceau, `datedFacts >= 2` — est structurellement morte au niveau d'une
   * ligne : une ligne `opportunities` ne porte QU'UN fait, le sien, et rien dans
   * la table ne rattache un second fait daté au même projet. Un barème qui garde
   * une porte que rien ne peut franchir finit par être contourné.
   *
   * Et le pire n'était pas la porte morte, c'était le MANQUE qu'elle faisait
   * nommer. Une ligne intégralement qualifiée hors du pipe — offre, périmètre,
   * décideur, prochaine action, tout renseigné à la main — s'entendait répondre
   * « un seul fait daté, il en faut au moins deux qui convergent ». Le commercial
   * partait chercher un second article de presse ; ce qu'il lui fallait, c'était
   * un client qui demande. Le manque nommé est désormais `not_expressed`.
   *
   * ⚠️ Ce qui change AUSSI, et qui est le fond : le faisceau ne fonde plus une
   * opportunité, même complet. Cinq faits qui convergent, parfaitement
   * cartographiés, mais que personne n'a demandés, plafonnent à
   * `detected_project`. C'est la règle fondatrice du module appliquée jusqu'au
   * dernier niveau — « le mot besoin est réservé à une demande explicitement
   * confirmée » — et c'est ce qui empêche d'écrire à un DSI qu'on a « noté son
   * besoin » quand il n'a rien dit. Plus EXIGEANT, donc, pas moins.
   *
   * Réachabilité mesurée par énumération (256 formes d'une ligne) : 8 avant,
   * 8 après. La porte qui fonctionnait est restée ; c'est celle qui n'existait
   * pas qui a disparu de l'énoncé.
   *
   * Ce qui N'A PAS été fait, et pourquoi : rendre le faisceau atteignable
   * demanderait de rattacher plusieurs faits datés à une même ligne — une
   * colonne, donc une migration, et une autre décision. Abaisser l'exigence à
   * « les quatre éléments suffisent » aurait fait d'une fiche bien remplie une
   * opportunité : c'est exactement le barème abaissé jusqu'à ce que ça passe.
   *
   * NB : « des décideurs » est devenu « un décideur » — `hasDecisionMaker` en
   * vérifie UN. L'énoncé décrit maintenant ce que le code fait.
   */
  opportunity: {
    fr: 'Une demande confirmée, plus les quatre éléments qui la rendent traitable : un fit avec l’offre, un périmètre, un décideur et une prochaine action. Un faisceau de faits, même complet, ne remplace pas la demande.',
    en: 'A confirmed demand, plus the four things that make it actionable: a fit with the offer, a perimeter, a decision maker and a next action. A bundle of facts, however complete, does not replace the demand.',
  },
}

/** Ce qu'on sait d'une entrée, pour décider du niveau qu'elle peut revendiquer. */
export const evidenceInputSchema = z.object({
  /** Faits datés ET sourcés qui la soutiennent. */
  datedFacts: z.number().int().min(0),
  /** Quelqu'un a-t-il explicitement formulé la demande ? */
  explicitlyExpressed: z.boolean(),
  /** L'offre de l'ESN correspond-elle ? */
  hasFit: z.boolean(),
  /** Le périmètre (entité, budget, échéance) est-il identifié ? */
  hasPerimeter: z.boolean(),
  /** Au moins un décideur identifié ? */
  hasDecisionMaker: z.boolean(),
  /** Une prochaine action concrète est-elle définie ? */
  hasNextAction: z.boolean(),
})
export type EvidenceInput = z.infer<typeof evidenceInputSchema>

/**
 * Du plus exigeant au moins exigeant.
 *
 * `confirmed_demand` avant `detected_project` : une parole vaut plus qu'un
 * faisceau, et toute demande exprimée satisfait aussi « projet détecté ».
 */
const DESCENDING_LEVELS: readonly EvidenceLevel[] = [
  'opportunity',
  'confirmed_demand',
  'detected_project',
  'fact',
] as const

/**
 * Le niveau le PLUS ÉLEVÉ qu'une entrée peut honnêtement revendiquer.
 *
 * On descend depuis le plus exigeant : c'est l'ordre qui garantit qu'on ne
 * qualifie jamais par excès. Une entrée qui coche tout sauf la prochaine action
 * n'est pas une opportunité — c'est un projet détecté, et le dire indique
 * exactement ce qu'il manque.
 */
export function highestEvidenceLevel(input: EvidenceInput): EvidenceLevel | null {
  // ⚠️ DÉRIVÉ de {@link missingForLevel}, jamais réécrit à la main. Cette
  // fonction portait sa propre cascade de `if` : deux écritures de la même
  // échelle, qui ont divergé à la première retouche (D27, 28/08 — la cascade
  // ignorait le chemin neuf de « projet détecté »). Une dérivation vit à un
  // seul endroit.
  for (const level of DESCENDING_LEVELS) {
    if (missingForLevel(input, level).length === 0) return level
  }
  return null
}

// ── Ce qui MANQUE, nommé ─────────────────────────────────────────────────

/**
 * Les manques possibles, NOMMÉS.
 *
 * Un `false` nu ne permet pas de DIRE ce qui manque : l'écran Projets annonçait
 * « 383 projets détectés à reprendre » sans qu'aucun code ne puisse écrire ce
 * qui, dans les 383, n'était pas un projet. Ce sont des CRITÈRES, jamais un
 * pourcentage : « il manque un second fait daté » se vérifie, « 40 % de chances »
 * ne se vérifie pas et n'a rien à faire ici.
 *
 * ⚠️ Liste ORDONNÉE et APPEND-ONLY (GA-08) : une valeur ne disparaît jamais et
 * ne s'insère jamais au milieu — elle s'ajoute à la fin.
 */
export const EVIDENCE_GAPS = [
  'no_dated_fact',
  'single_dated_fact',
  'not_expressed',
  'no_fit',
  'no_perimeter',
  'no_decision_maker',
  'no_next_action',
  /**
   * Ajouté le 28/08/2026 (D27), À LA FIN. Le manque d'un fait daté et sourcé
   * que RIEN ne rattache à un chantier — ni offre ou domaine, ni périmètre, ni
   * décideur, ni prochaine action. C'est ce qui reste de « un signal isolé ne
   * fait pas un projet » une fois l'exigence rendue atteignable.
   */
  'unattached_fact',
] as const
export const evidenceGapSchema = z.enum(EVIDENCE_GAPS)
export type EvidenceGap = z.infer<typeof evidenceGapSchema>

/** Le libellé de chaque manque, FR et EN. C'est ce qui s'affiche à côté d'une
 *  ligne pour dire pourquoi elle ne revendique pas plus. */
export const EVIDENCE_GAP_LABELS: Record<EvidenceGap, { fr: string; en: string }> = {
  no_dated_fact: {
    fr: 'Aucun fait daté et sourcé.',
    en: 'No dated and sourced fact.',
  },
  // ⚠️ PLUS ÉMIS depuis le 28/08/2026, et la clé reste néanmoins au contrat.
  // Elle était produite par le socle commun de « projet détecté » et
  // « opportunité » ; D27 · 26/08 a donné au premier ses propres manques
  // (`unattached_fact`), D50 · 26/08 a fondé le second sur la DEMANDE
  // (`not_expressed`). Aucun des deux ne la produit plus. On ne la retire pas :
  // un consommateur a pu la recevoir et la stocker, et un libellé qui
  // disparaît laisse un code nu à l'écran. On ne la rebranche pas non plus —
  // si elle réapparaît, c'est qu'un des deux barèmes a été défait.
  single_dated_fact: {
    fr: 'Un seul fait daté — il en faut au moins deux qui convergent.',
    en: 'A single dated fact — at least two converging ones are required.',
  },
  not_expressed: {
    fr: 'Personne ne l’a formulé — ni un contact, ni le CRM, ni vous.',
    en: 'Nobody expressed it — not a contact, not the CRM, not you.',
  },
  no_fit: {
    fr: 'Aucune correspondance avec l’offre.',
    en: 'No match with the offer.',
  },
  no_perimeter: {
    fr: 'Périmètre non identifié (entité, budget, échéance).',
    en: 'Perimeter not identified (entity, budget, deadline).',
  },
  no_decision_maker: {
    fr: 'Aucun décideur identifié.',
    en: 'No decision maker identified.',
  },
  no_next_action: {
    fr: 'Aucune prochaine action définie.',
    en: 'No next action defined.',
  },
  unattached_fact: {
    fr: 'Un fait daté, mais rien ne le rattache à un chantier — ni offre ou domaine, ni périmètre, ni décideur, ni prochaine action.',
    en: 'A dated fact, but nothing ties it to a piece of work — no offer or domain, no perimeter, no decision maker, no next action.',
  },
}

/** Le verdict d'un niveau : satisfait ou non, l'exigence, et ce qui manque. */
export type EvidenceVerdict = {
  met: boolean
  /** L'exigence du barème, mot pour mot — jamais réécrite ici. */
  requirement: { fr: string; en: string }
  /** Vide quand le niveau est satisfait. Jamais un chiffre, toujours des noms. */
  missing: EvidenceGap[]
}

/**
 * Ce qui RATTACHE un fait à un chantier : le fait a été LU comme un projet.
 *
 * C'est le troisième chemin vers « projet détecté », ouvert le 28/08/2026 (D27)
 * parce que le faisceau de deux faits n'est pas atteignable depuis une ligne
 * `opportunities` — elle n'en porte qu'un. Aucun de ces quatre éléments n'est
 * deviné : chacun se lit dans une colonne que quelqu'un (l'analyse ou le
 * commercial) a écrite.
 *
 * Un seul suffit, et c'est délibéré : en exiger deux redemanderait au produit
 * une donnée qu'il ne collecte pas systématiquement, ce qui est exactement le
 * défaut qu'on corrige. Ce qui garde le mot « détecté » honnête est qu'il en
 * faut AU MOINS un — un événement nu reste un fait.
 */
function hasAttachment(input: EvidenceInput): boolean {
  return input.hasFit || input.hasPerimeter || input.hasDecisionMaker || input.hasNextAction
}

/**
 * Ce qui manque à cette entrée pour revendiquer ce niveau.
 *
 * ⚠️ La liste vide vaut EXACTEMENT l'ancien booléen de {@link meetsEvidenceLevel} :
 * l'ordre des niveaux appliqué au plus haut niveau revendicable. Le test
 * « satisfait reste exactement l'ancien booléen » le rejoue sur toute la matrice
 * d'entrées — gagner une liste de manques ne doit rien changer à QUI passe.
 */
function missingForLevel(input: EvidenceInput, level: EvidenceLevel): EvidenceGap[] {
  switch (level) {
    case 'fact':
      // Une parole vaut au moins un fait : elle est plus forte, pas moins.
      return input.datedFacts >= 1 || input.explicitlyExpressed ? [] : ['no_dated_fact']
    case 'detected_project': {
      // `confirmed_demand` et `detected_project` ne sont pas comparables : l'un
      // vient d'une parole, l'autre d'un faisceau. Une demande confirmée
      // satisfait donc aussi « projet détecté », mais pas l'inverse.
      //
      // Trois chemins depuis D27 (28/08/2026), et l'ordre dit la force de la
      // preuve : une parole, un faisceau de deux faits, ou UN fait daté qu'un
      // élément rattache à un chantier. Les deux premiers sont d'origine ; le
      // troisième existe parce qu'une ligne `opportunities` ne porte qu'un fait
      // — cf. le commentaire d'`EVIDENCE_REQUIREMENTS.detected_project`.
      if (input.explicitlyExpressed || input.datedFacts >= 2) return []
      // Sans fait daté, il n'y a rien à rattacher : le plancher tient, et le
      // mot du refus reste exact.
      if (input.datedFacts < 1) return ['no_dated_fact']
      return hasAttachment(input) ? [] : ['unattached_fact']
    }
    case 'confirmed_demand':
      // ⚠️ 28/08/2026 — l'exception « un dossier COMPLET bâti sur un faisceau
      // reste recevable » a été retirée. Elle n'existait que pour rester
      // cohérente avec l'ancienne règle d'`opportunity`, qui acceptait le même
      // faisceau ; elle contredisait frontalement la règle fondatrice du module
      // (« le mot besoin est réservé à une demande explicitement confirmée »),
      // et faisait qu'une fiche bien remplie valait une parole de client.
      // Ce qui manque tient en un mot, et il n'y en a qu'un : personne ne l'a dit.
      return input.explicitlyExpressed ? [] : ['not_expressed']
    case 'opportunity': {
      // La base est la DEMANDE, pas la convergence — d'où `not_expressed` et non
      // `convergenceGaps` : à une ligne intégralement qualifiée hors du pipe, il
      // ne manque pas un second fait daté, il manque un client qui demande.
      // (`convergenceGaps` reste la base de `detected_project`, qui est bien une
      // affaire de faisceau.)
      const gaps: EvidenceGap[] = input.explicitlyExpressed ? [] : ['not_expressed']
      if (!input.hasFit) gaps.push('no_fit')
      if (!input.hasPerimeter) gaps.push('no_perimeter')
      if (!input.hasDecisionMaker) gaps.push('no_decision_maker')
      if (!input.hasNextAction) gaps.push('no_next_action')
      return gaps
    }
  }
}

/**
 * Cette entrée peut-elle revendiquer ce niveau ? La garde anti-inflation.
 *
 * Rend le verdict COMPLET et non un booléen : un refus qu'on ne peut pas
 * expliquer est un refus qu'on finit par contourner.
 */
export function meetsEvidenceLevel(input: EvidenceInput, level: EvidenceLevel): EvidenceVerdict {
  const missing = missingForLevel(input, level)
  return { met: missing.length === 0, requirement: EVIDENCE_REQUIREMENTS[level], missing }
}

// ── Le barème appliqué à une VRAIE ligne de projet ────────────────────────

/**
 * Ce qu'il faut lire d'une ligne `opportunities` pour la juger. Un sous-ensemble
 * STRUCTUREL de `ProjectRow` : le contrat de la ligne n'a pas à connaître le
 * barème, et le barème n'a pas à connaître les vingt autres colonnes.
 */
export type ProjectEvidenceSource = {
  kind: string
  stage: ProjectStage
  source: string | null
  offer: string | null
  primary_domain_code?: string | null
  amount_cents?: number | null
  expected_close_on: string | null
  btmmp?: Btmmp | null
  first_detected_at: string
}

/** Ce qu'une ligne revendique, et ce qui lui manque pour être un PROJET. */
export const projectEvidenceSchema = z.object({
  /** Le niveau réellement atteint. `null` = rien de daté, rien d'exprimé — et
   *  ce n'est PAS « zéro », c'est « non mesuré ». */
  level: evidenceLevelSchema.nullable(),
  /** L'exigence du niveau atteint, FR et EN. `null` quand aucun n'est atteint. */
  requirement: z.object({ fr: z.string(), en: z.string() }).nullable(),
  /** Ce qui manque pour revendiquer « projet détecté » — la barre exacte que le
   *  compteur « N projets détectés » prétend franchir. Vide quand elle l'est. */
  missing: z.array(evidenceGapSchema),
})
export type ProjectEvidence = z.infer<typeof projectEvidenceSchema>

/** Une chaîne qui ne porte rien — ni absente, ni blanche. */
function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * `source` désigne-t-elle un TÉMOIN, ou répète-t-elle la nature de la ligne ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE (mesuré le 28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `ProjectsService.materialize` écrivait dans `source` le nom de sa propre VOIE
 * de code — `'pain'`, `'challenge'`, `'program'`, `'implication'`, et `'signal'`
 * en repli quand le signal n'avait justement AUCUNE source. Sur quatre voies sur
 * cinq, une ABSENCE de source passait donc pour une source, et la ligne
 * revendiquait « un événement daté ET sourcé » sur une tautologie : `source` ne
 * disait rien de plus que la colonne `kind` juste à côté.
 *
 * L'écriture est corrigée (`NULL` quand il n'y a pas de témoin). Mais
 * `materialize` est `ON CONFLICT DO NOTHING` : les lignes déjà en base ne
 * repasseront JAMAIS par l'écriture. Sans cette règle à la lecture, deux lignes
 * portant exactement la même preuve auraient deux niveaux différents selon leur
 * DATE de matérialisation — et le barème mesurerait notre historique de
 * déploiement, pas la preuve.
 *
 * On ARCHIVE, on ne supprime pas : la colonne garde ce qu'elle porte, aucune
 * migration ne l'efface. C'est sa LECTURE qui cesse de prendre une tautologie
 * pour un témoin, et la ligne redevient inconnue avec sa date
 * (`first_detected_at` est intacte).
 *
 * ⚠️ La règle est GÉNÉRALE, pas une liste de noms de voies à tenir à jour : une
 * liste se périme au premier `kind` ajouté, et `kind` est du texte libre sur le
 * fil. Ce qui se vérifie ici est qu'une source dise quelque chose de PLUS que la
 * nature. Le risque inverse — un vrai témoin qui s'appellerait exactement comme
 * la nature de la ligne — est un mot comme « signal » ou « pain » en guise de
 * nom de média : il n'en nommerait aucun.
 */
function isWitness(value: string | null | undefined, kind: string): boolean {
  if (typeof value !== 'string') return false
  const witness = value.trim()
  return witness.length > 0 && witness.toLowerCase() !== kind.trim().toLowerCase()
}

/**
 * Les natures qui sont des DÉDUCTIONS, pas des faits datés et sourcés.
 *
 * `implication` seule, et ce n'est pas une opinion : la matérialisation la
 * qualifie déjà en toutes lettres de « a deduction, not a sourced fact ».
 * Compter une déduction comme un fait, c'est exactement l'inflation que ce
 * module existe pour empêcher.
 *
 * ⚠️ Une liste de REFUS, jamais une liste d'autorisation. `kind` est du texte
 * libre sur le fil — le contrat le dit (« the UI maps the known values and
 * degrades gracefully on anything unexpected ») et la démonstration écrit
 * `besoin`, qui n'est dans aucune énumération. Un allowlist ferait tomber
 * toute nature inconnue à « aucun fait daté », c'est-à-dire ferait passer une
 * absence de VOCABULAIRE pour une absence de PREUVE.
 */
const DEDUCED_KINDS: readonly string[] = ['implication']

/**
 * Ce que la ligne apporte comme preuve, lu dans ses colonnes — rien de deviné.
 *
 * ⚠️ LIMITE CONNUE ET NOMMÉE : une ligne `opportunities` ne porte QU'UN fait
 * (le sien). Rien dans la table ne rattache un SECOND fait daté au même projet,
 * si bien que le chemin « faisceau » du barème n'est pas atteignable depuis une
 * ligne seule. C'est une absence de donnée, pas une absence de preuve : elle se
 * dit au lieu de se combler par un compte inventé — et c'est exactement pour
 * elle que « projet détecté » a gagné son troisième chemin le 28/08 (D27).
 * `datedFacts` ne vaut donc jamais plus de 1 ici, et ce n'est pas un bug.
 */
function projectEvidenceInput(row: ProjectEvidenceSource): EvidenceInput {
  const dated = !Number.isNaN(new Date(row.first_detected_at).getTime())
  return {
    // `isWitness` et non `filled` : une `source` qui recopie `kind` ne nomme
    // aucun témoin, et un fait sans témoin n'est pas « daté ET sourcé ».
    datedFacts: !DEDUCED_KINDS.includes(row.kind) && isWitness(row.source, row.kind) && dated ? 1 : 0,
    // Un projet dans une colonne du PIPE y a été mis à la main — le stade
    // `confirmed` s'appelle « Besoin exprimé » à l'écran. C'est un geste humain,
    // pas une déduction. `detected`/`potential` ne prouvent rien : « personne ne
    // les a encore regardés ».
    //
    // ⚠️ SOUS-ESTIME `lost` et `dormant`, et c'est délibéré : la ligne ne dit pas
    // PAR OÙ elle y est arrivée, et un projet peut être perdu ou endormi
    // directement depuis `detected` sans que personne n'ait jamais rien exprimé.
    // Les compter comme exprimés surestimerait ; les laisser dehors sous-estime
    // des projets clos, sur lesquels il n'y a plus rien à faire. Entre les deux
    // erreurs, on choisit celle qui ne fait pas écrire à un client qu'il a
    // demandé quelque chose.
    explicitlyExpressed: isPipelineStage(row.stage),
    hasFit: filled(row.offer) || filled(row.primary_domain_code),
    // ⚠️ `typeof … === 'number'`, et non `!== null` : `amount_cents` est
    // `number | null | undefined`, si bien qu'une source construite sans la clé
    // (déploiement décalé, appelant partiel) rendait `undefined !== null` VRAI —
    // donc « périmètre identifié » sur une ligne qui ne porte aucun montant. Une
    // absence lue comme une présence est la faute symétrique de « 0 » pour
    // « non mesuré », et depuis D27 elle suffirait à promouvoir la ligne seule.
    hasPerimeter:
      filled(row.btmmp?.budget) ||
      filled(row.btmmp?.timing) ||
      typeof row.amount_cents === 'number' ||
      filled(row.expected_close_on),
    hasDecisionMaker: filled(row.btmmp?.management),
    hasNextAction: filled(row.btmmp?.nextStep),
  }
}

/**
 * Le niveau qu'une ligne de projet peut honnêtement revendiquer, et ce qui lui
 * manque pour être comptée comme un projet détecté.
 *
 * Calculé À LA LECTURE, comme la décroissance de confiance juste en dessous :
 * un niveau écrit en dur en base empêcherait une qualification de le relever et
 * figerait l'erreur. Qualifier le BTMMP, déplacer le projet dans le pipe — et le
 * niveau monte au prochain affichage, sans backfill.
 */
export function projectEvidence(row: ProjectEvidenceSource): ProjectEvidence {
  const input = projectEvidenceInput(row)
  const level = highestEvidenceLevel(input)
  return {
    level,
    requirement: level === null ? null : EVIDENCE_REQUIREMENTS[level],
    missing: missingForLevel(input, 'detected_project'),
  }
}

/**
 * #2325.13 — LES MANQUES AU NIVEAU LE PLUS EXIGEANT (`opportunity`), pour un
 * lecteur qui a besoin d'une lecture de CONFIANCE / QUALITÉ DE DONNÉES plutôt
 * que du verdict « projet détecté ».
 *
 * `projectEvidence().missing` reste figé sur le niveau `detected_project`
 * (D27) : `isPipelineStage(row.stage)` suffit à lui seul à le vider, ce qui le
 * rend TRIVIALEMENT vide pour toute ligne déjà dans le pipe — inutile comme
 * lecture de complétude pour la priorisation du pipe (#2325, axe CONFIANCE).
 * Cette fonction RÉUTILISE `projectEvidenceInput` (GA-26 : aucun second calcul
 * des mêmes booléens fit/périmètre/décideur/prochaine action) et applique le
 * barème au niveau `opportunity`, le seul qui les exige tous.
 */
export function opportunityEvidenceGaps(row: ProjectEvidenceSource): EvidenceGap[] {
  return missingForLevel(projectEvidenceInput(row), 'opportunity')
}

// ── Les stades : RETIRÉS ici, portés par le projet lui-même ──────────────────

/**
 * ⚠️ Les huit stades d'affichage (p46) ont disparu avec le pivot Projet (17/08).
 *
 * Ils n'existaient que parce que la colonne de cycle n'en portait que cinq, en
 * français, et qu'il manquait trois distinctions : « plausible » (une hypothèse
 * à tester), « dormant » (vivant mais sans mouvement) et la séparation
 * gagné/perdu. Le projet porte désormais ces distinctions dans SON cycle
 * ({@link PROJECT_STAGES}, neuf valeurs) : traduire n'a plus d'objet, et deux
 * vocabulaires d'étape sur le même objet sont exactement ce que le rapport §32
 * désigne comme la cause d'un reporting faux. Les lecteurs lisent `stage`.
 *
 * La correspondance, pour mémoire : signal→`detected`, plausible→`potential`,
 * qualified→`qualified`, confirmed→`confirmed`, active→`profiles_submitted` |
 * `negotiation`, dormant→`dormant`, won→`won`, lost→`lost`.
 */

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D37 (28/08/2026) — « UN PROJET ENCORE EN JEU » : LA DÉFINITION, ET SA VOISINE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Trois endroits portaient la même idée sans le même contenu :
 *
 *   1. `LIVE_STAGES` ici — les six non clos, intake compris, AUCUN consommateur ;
 *   2. le Pilotage — `stage NOT IN (INTAKE ∪ CLOSED)`, soit les quatre du milieu ;
 *   3. `ProjectsService.summarizeLearning` — trois stades écrits à la main
 *      (`confirmed`, `profiles_submitted`, `negotiation`).
 *
 * En les ouvrant, on a trouvé non pas une définition dupliquée mais DEUX
 * questions différentes, dont une seule avait un nom. Les nommer toutes les
 * deux, et faire dériver la seconde de la première, est ce qui empêche la
 * troisième de renaître.
 *
 *   • **« En jeu »** = *reste-t-il quelque chose à faire ?* → {@link LIVE_STAGES}
 *   • **« Pris en charge »** = *un HUMAIN l'a-t-il adopté ?* → {@link TRIAGED_STAGES}
 */

/**
 * Les stades où le projet est encore EN JEU — le complément EXACT de
 * `CLOSED_STAGES` : ni plus, ni moins.
 *
 * **L'INTAKE EST DEDANS, et c'est la décision.** `detected` et `potential`
 * portent des projets sur lesquels il reste tout à faire : ce sont précisément
 * ceux que l'écran Projets propose de trier. Les mettre hors « en jeu » ferait
 * dire à la définition qu'un travail que l'écran affiche n'existe pas. « En
 * jeu » ne dit rien de la QUALITÉ d'un projet ni de qui s'en occupe — il dit
 * seulement que l'affaire n'est pas refermée.
 *
 * ⚠️ Écrite EN TOUTES LETTRES, jamais dérivée de `PROJECT_STAGES` : le test
 * « aucune étape n'est oubliée des deux côtés » ne saurait plus dire NON si
 * cette liste se calculait. Une étape ajoutée demain doit obliger quelqu'un à
 * décider si elle est en jeu ou close — c'est tout l'objet de ce test.
 */

/**
 * ⚠️ ET UNE TROISIÈME QUESTION, dont l'écart avec « en jeu » est VOULU — D52 · 26/08.
 *
 * Cinq requêtes écrivaient leur liste de stades à la main, et deux d'entre
 * elles gardaient `dormant` DEDANS. Côte à côte on croit à une faute de frappe ;
 * ce n'en est pas une, et les unifier casserait l'une des deux EN SILENCE.
 *
 *  - {@link LIVE_STAGES} répond à « sur quoi reste-t-il à travailler ? ».
 *    `dormant` en est DEHORS : une mise en veille n'attend rien de personne, et
 *    la compter dans l'espéré gonflerait un montant que personne ne va chercher.
 *  - {@link UNDECIDED_STAGES} répond à « qu'est-ce dont l'issue n'est pas
 *    connue ? ». `dormant` en fait partie, et c'est tout le point : une routine
 *    de réveil existe PRÉCISÉMENT pour ce qui dort. L'exclure rendrait muet le
 *    seul mécanisme capable d'en sortir un projet — et ce serait invisible : la
 *    routine continuerait de tourner, simplement sans jamais rien remonter.
 *
 * Le seul écart est `dormant`. Les deux tiennent la même règle de fond : une
 * veille est une PAUSE, pas une issue, et la confondre avec `lost` fausse le
 * taux de transformation dans les deux sens.
 */
// #4338.1 — même ordre que PROJECT_STAGES (Besoin exprimé avant Qualifié).
export const LIVE_STAGES: readonly ProjectStage[] = [
  'detected',
  'potential',
  'confirmed',
  'qualified',
  'profiles_submitted',
  'negotiation',
] as const

/**
 * Les projets en jeu qu'un HUMAIN a PRIS EN CHARGE : « en jeu », moins l'intake.
 *
 * L'intake sort ICI, et pour une raison qui ne vaut qu'ici : à `detected` /
 * `potential`, c'est la MACHINE qui a produit la ligne, pas un commercial qui
 * l'a adoptée. Ce sous-ensemble sert de dénominateur à des taux dont le
 * numérateur est un geste humain (le BTMMP rempli, l'avancée dans le pipe) :
 * une analyse qui détecte quarante projets ferait chuter le taux toute seule,
 * c'est-à-dire punirait le pipeline de faire son travail.
 *
 * ⚠️ DÉRIVÉ, jamais retapé. C'est la moitié qui manquait : deux listes qui
 * « contiennent le même texte » sont exactement l'état d'où part toute
 * divergence. Ici, changer {@link LIVE_STAGES} change celle-ci, mécaniquement.
 */
export const TRIAGED_STAGES: readonly ProjectStage[] = LIVE_STAGES.filter(
  stage => !(INTAKE_STAGES as readonly string[]).includes(stage),
)

/**
 * Les stades clos SANS affaire — `CLOSED_STAGES` privé de `won`.
 *
 * `dormant` y est avec `lost`, et ce n'est pas dire qu'une mise en veille est un
 * échec : c'est dire qu'il n'y a plus rien à faire dessus aujourd'hui. La
 * distinction perdu / endormi reste portée par le stade lui-même, qui s'affiche.
 *
 * Existe pour que la boucle d'apprentissage PARTITIONNE ce qu'elle compte :
 * `won` + {@link TRIAGED_STAGES} + celui-ci = tout, sauf l'intake. Avant D37,
 * `qualified` n'était dans aucun des trois paniers.
 */
export const CLOSED_UNWON_STAGES: readonly ProjectStage[] = CLOSED_STAGES.filter(stage => stage !== 'won')

/**
 * Les projets dont l'ISSUE est connue — `CLOSED_STAGES` privé de `dormant`.
 *
 * Une mise en veille n'est pas une issue, c'est une pause : la compter comme
 * une perte ferait chuter le taux de conversion à chaque projet mis de côté.
 * Dénominateur du taux de conversion, et il CONTIENT son numérateur (`won`) —
 * ce que « les besoins ouverts » ne faisaient pas, si bien que le taux ne
 * pouvait jamais valoir 100 %.
 */
export const DECIDED_STAGES: readonly ProjectStage[] = CLOSED_STAGES.filter(stage => stage !== 'dormant')

/**
 * « Proche de signer » (#3904, décision Louis 09/10) — une opportunité au stade
 * PROPOSITION ou NÉGOCIATION. « Profils présentés » EST la proposition d'une
 * ESN, puis la négociation ; `won`/`lost` sont déjà clos. Un STADE déclaré,
 * jamais une probabilité. Écrite en toutes lettres : un sous-ensemble vit ICI,
 * jamais recopié dans un service (GA-57).
 */
export const NEAR_SIGNING_STAGES = ['profiles_submitted', 'negotiation'] as const satisfies readonly ProjectStage[]

/**
 * `<colonne> IN ('…','…')` — la SEULE fabrique de littéraux de stade en SQL.
 *
 * Les valeurs viennent d'énumérations du contrat, jamais d'une saisie : aucune
 * interpolation d'entrée utilisateur ne passe par ici. Ce qu'elle apporte n'est
 * pas l'échappement, c'est la TRAÇABILITÉ — une requête qui appelle cette
 * fonction NOMME la liste qu'elle applique, et la garde GA-57 peut lire ce nom.
 *
 * Une liste vide LÈVE : `IN ()` est refusé par Postgres, et le repli silencieux
 * (« aucune ligne ») ferait afficher un zéro là où la question n'a pas de sens.
 */
export function projectStageInSql(column: string, stages: readonly ProjectStage[]): string {
  return `${column} IN (${stageLiterals('projectStageInSql', column, stages)})`
}

/**
 * `<colonne> NOT IN ('…','…')` — le complément, pour les rares populations qui
 * se disent mieux par ce qu'elles EXCLUENT.
 *
 * Une seule aujourd'hui : « tout ce qu'un humain a touché » = tout sauf
 * l'intake. L'écrire à l'endroit (`IN` de six stades) aurait été une liste de
 * plus à tenir à jour, alors que la question posée est bien « hors intake ».
 */
export function projectStageNotInSql(column: string, stages: readonly ProjectStage[]): string {
  return `${column} NOT IN (${stageLiterals('projectStageNotInSql', column, stages)})`
}

function stageLiterals(fn: string, column: string, stages: readonly ProjectStage[]): string {
  if (stages.length === 0) {
    throw new Error(`${fn}(${column}) : liste de stades vide — \`IN ()\` n'est pas du SQL valide.`)
  }
  return stages.map(stage => `'${stage}'`).join(',')
}

/** Les stades dont l'ISSUE n'est pas connue — tout sauf `won` et `lost`.
 *  `dormant` en fait partie : une veille est une pause, pas une issue, et c'est
 *  exactement ce qu'une routine de relance doit pouvoir voir pour le réveiller.
 *  DÉRIVÉ de {@link LIVE_STAGES} : deux listes recopiées divergent. */
export const UNDECIDED_STAGES: readonly ProjectStage[] = [...LIVE_STAGES, 'dormant'] as const

// ── Décroissance de fraîcheur (p47 « Opportunity decay ») ────────────────────

/** Combien de jours un signal reste « frais ». Au-delà, il se déclasse. */
export const OPPORTUNITY_FRESH_DAYS = 30
/** Au-delà, le signal ne porte plus de « maintenant » : il devient du contexte. */
export const OPPORTUNITY_STALE_DAYS = 180

export const opportunityFreshnessSchema = z.enum(['fresh', 'ageing', 'stale'])
export type OpportunityFreshness = z.infer<typeof opportunityFreshnessSchema>

/**
 * La fraîcheur d'une opportunité, à partir de la date du dernier fait qui la
 * soutient.
 *
 * Le rapport insiste (p11) : « une donnée ancienne n'est pas un signal actuel ».
 * Sans décroissance, un recrutement de mars continue de faire remonter un compte
 * en septembre, et le commercial ouvre sa journée sur une urgence périmée.
 *
 * Une date absente rend `stale` — pas `fresh`. Un fait non daté ne prouve aucun
 * « maintenant », et le supposer récent est exactement l'erreur qu'on corrige.
 */
export function opportunityFreshness(
  lastFactAt: string | null | undefined,
  now: Date = new Date(),
): OpportunityFreshness {
  if (!lastFactAt) return 'stale'
  const at = new Date(lastFactAt).getTime()
  if (Number.isNaN(at)) return 'stale'
  const days = (now.getTime() - at) / 86_400_000
  if (days <= OPPORTUNITY_FRESH_DAYS) return 'fresh'
  if (days <= OPPORTUNITY_STALE_DAYS) return 'ageing'
  return 'stale'
}

/**
 * La confiance décroît avec l'âge — jamais l'inverse.
 *
 * On ne remonte JAMAIS une confiance sur la base du temps : seule une preuve
 * nouvelle le peut, et elle passe par une réanalyse. Une fonction qui pourrait
 * augmenter la confiance en vieillissant serait un générateur d'urgences.
 */
export function decayedConfidence(
  confidence: 'high' | 'medium' | 'low',
  freshness: OpportunityFreshness,
): 'high' | 'medium' | 'low' {
  if (freshness === 'fresh') return confidence
  if (freshness === 'ageing') return confidence === 'high' ? 'medium' : confidence === 'medium' ? 'low' : 'low'
  return 'low'
}

/**
 * #2119.2 — LA LIGNE DE PROJET **TELLE QUE L'API LA REND**, barème compris.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCHÉMA EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `ProjectsService` calculait déjà le niveau de preuve de chaque ligne
 * ({@link projectEvidence}), l'attachait à la réponse de `GET /projects` — et le
 * type qui le portait était **local au service** :
 *
 *     type ProjectReadRow = ProjectRow & { evidence: ProjectEvidence }   // privé
 *
 * Le champ traversait donc le fil à chaque appel, et aucun écran ne pouvait le
 * lire : `TabProjects` typait sa réponse `ProjectRow[]`, ce qui l'EFFAÇAIT à la
 * frontière. C'est le défaut n°1 du dépôt dans son sens symétrique — l'API
 * calcule, renvoie, et personne ne lit — et le commentaire du service le disait
 * déjà de lui-même : « un barème que personne n'appelle ne protège rien ».
 *
 * Le nommer AU CONTRAT est ce qui referme le chemin : un seul endroit dit ce que
 * la route rend, le service s'y conforme, le web le lit.
 *
 * ⚠️ AUCUNE MIGRATION, et c'est structurel : `evidence` est calculé **à la
 * lecture** (D27 · 28/08), jamais stocké. Aucune colonne ne bouge, aucune
 * contrainte SQL n'est touchée, aucun enum n'est modifié — ajouter un champ
 * dérivé à une réponse ne franchit aucune des portes GA-08 / GA-11 / GA-12.
 *
 * ⚠️ `evidence` est **optionnel**, pour la même raison que `has_mission` et
 * `next_action` le sont : le web se déploie en une minute, l'API en plusieurs.
 * Pendant la fenêtre, un écran neuf lit une réponse ancienne — et `undefined`
 * doit rester lisible comme « l'API n'a pas dit », jamais comme « aucun niveau ».
 * Un niveau ABSENT et un niveau `null` ne disent pas la même chose :
 *
 *   · `undefined`      — l'API ne l'a pas dit. L'écran se tait.
 *   · `{ level: null }` — l'API a répondu : rien de daté, rien d'exprimé. NON
 *                         MESURÉ, et surtout pas « zéro » (GA-18 / GA-19).
 */

/**
 * #2324.20/21/23 — LES TROIS GRANULARITÉS QUE L'ISSUE #2170 DEMANDAIT COMME
 * « STAGES ».
 *
 * Les CINQ `PIPELINE_STAGES` sont FIGÉES en nombre et en ordre (arbitrage
 * Louis, `project.ts`) : ce n'est donc PAS une sixième/septième/huitième
 * valeur de {@link PROJECT_STAGES}. C'est un AFFINAGE, dérivé du statut d'un
 * besoin déjà modélisé (`PROJECT_NEED_STATUSES`, `project.ts`) — la même
 * donnée que l'écran Besoins affiche déjà, jamais un second modèle (GA-26).
 *
 * ⚠️ #2170.3 (tranché sans Louis, 25-26/09/2026) — L'ÉPOPÉE #2949 DEMANDAIT UN
 * SIXIÈME STADE « Profils recherchés ». `.claude/notes/registre-2026-09-16-
 * projects.md:65` avait déjà mesuré le conflit : la doctrine `c56_etapes_du_pipe`
 * (28/08, `doctrine-registry.ts`) fige `PIPELINE_STAGES` — GA-08 refuse qu'un
 * enum en insère une au milieu — et cette doctrine est ANTÉRIEURE à la
 * décision du 17/09 sans l'avoir révisée. Le besoin réel (distinguer « profils
 * recherchés » à l'écran) a sa réponse doctrine-compatible ICI depuis le
 * 22/09 : un AFFINAGE affiché en badge sur la carte, jamais une étape de plus.
 * Ce lot câble enfin cet affinage jusqu'à `ProjectReadRow` (juste plus bas) —
 * il ne rouvre pas l'enum.
 *
 * ⚠️ Déplacées ici depuis `opportunity-pipeline-health.ts` (25-26/09/2026) :
 * `projectReadRowSchema`, juste plus bas, a besoin de ce vocabulaire pour
 * exposer l'affinage sur CHAQUE carte — et ce fichier-ci ne peut pas dépendre
 * d'`opportunity-pipeline-health.ts`, qui dépend déjà de lui (cycle).
 * `opportunity-pipeline-health.ts` les RÉ-EXPORTE désormais depuis ici, pour
 * qu'aucun import existant n'ait à changer.
 */
export const OPPORTUNITY_STAGE_DETAILS = [
  /** #2324.20 — « profils recherchés » : le besoin est qualifié, la recherche tourne. */
  'profiles_wanted',
  /** #2324.21 — « profils préparés » : une short-list existe, pas encore soumise. */
  'profiles_prepared',
  /** #2324.23 — « entretien » : le client a le profil, il l'évalue. */
  'interview',
] as const
export const opportunityStageDetailSchema = z.enum(OPPORTUNITY_STAGE_DETAILS)
export type OpportunityStageDetail = z.infer<typeof opportunityStageDetailSchema>

const PROFILES_WANTED_NEED_STATUSES = new Set(['to_qualify', 'qualified', 'to_match', 'matching'])

/**
 * `null` = aucun affinage : soit l'étape ne le porte pas (seules `confirmed` et
 * `profiles_submitted` — l'entre-deux où « profils recherchés/préparés/en
 * entretien » a un sens —, jamais `qualified`/`negotiation`/`won`/…), soit
 * aucun besoin n'est rattaché. Jamais une valeur devinée pour combler l'absence.
 *
 * ⚠️ #2942 — le statut de besoin STOCKÉ `interview` (#2152.9, `need-status.ts`)
 * lit aussi « entretien », au même titre que `client_review` : les deux disent
 * la même chose du point de vue de l'opportunité — le client a le profil, il
 * l'évalue —, `interview` l'affirmant simplement de façon plus précise. Le
 * statut `negotiation` (#2152.10), lui, N'A PAS d'affinage ici : aucune des
 * trois valeurs d'{@link OPPORTUNITY_STAGE_DETAILS} ne le nomme, et lui en
 * inventer une serait un affinage deviné plutôt que lu.
 */
export function opportunityStageDetail(
  stage: string,
  mostAdvancedNeedStatus: string | null | undefined,
): OpportunityStageDetail | null {
  if (stage !== 'confirmed' && stage !== 'profiles_submitted') return null
  if (!mostAdvancedNeedStatus) return null
  if (PROFILES_WANTED_NEED_STATUSES.has(mostAdvancedNeedStatus)) return 'profiles_wanted'
  if (mostAdvancedNeedStatus === 'shortlist_ready') return 'profiles_prepared'
  if (mostAdvancedNeedStatus === 'client_review' || mostAdvancedNeedStatus === 'interview') return 'interview'
  return null
}

export const projectReadRowSchema = projectRowSchema.extend({
  evidence: projectEvidenceSchema.optional(),
  /**
   * #2170.3 — l'affinage « profils recherchés/préparés/entretien », calculé À
   * LA LECTURE par `ProjectsService` (même patron que `evidence` juste
   * au-dessus) : AUCUNE migration, aucune colonne, aucun enum touché.
   * `undefined` = l'API ne l'a pas dit (déploiement en cours) ; `null` = l'API
   * a répondu qu'aucun affinage ne s'applique (étape hors `confirmed`/
   * `profiles_submitted`, ou aucun besoin rattaché) — jamais confondu.
   */
  stage_detail: opportunityStageDetailSchema.nullable().optional(),
})
export type ProjectReadRow = z.infer<typeof projectReadRowSchema>
