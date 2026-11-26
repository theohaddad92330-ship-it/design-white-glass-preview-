import { z } from 'zod'
// #2271.19 — la carte timeline RÉUTILISE la nature d'événement déjà déclarée
// par `GET /accounts/:id/timeline` (GA-26 : un réglage vit à un seul endroit),
// au lieu d'écrire une seconde énumération qui pourrait diverger de la première.
import { TIMELINE_EVENT_KINDS } from './account-timeline.js'
import type { ReplyBadgeCode } from './reply-badges.js'
// #4421.15 — les personnes hors espace révélables au clic : le contrat vit avec son geste.
import { outsidePersonRevealCardSchema } from './outside-person-reveal.js'

/**
 * #1914 — LES FORMES D'UNE RÉPONSE DE LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ne pas afficher toutes les réponses comme un simple bloc de texte. » Un
 * classement de comptes, une comparaison, un brief de rendez-vous sortaient en
 * paragraphes et en puces : `StructuredReply` ne savait encadrer qu'une forme
 * (Objectif / Angle d'accroche / Cas d'usage), et le moteur markdown du chat ne
 * rend aucun tableau.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CANAL : LE TEXTE DE LA RÉPONSE, PAS UN CHAMP DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `StructuredReply` reçoit ses données par le TEXTE de la réponse — c'est lui
 * qu'il analyse, lui que l'écran persiste (`chat_messages.content`), lui que le
 * service IA garde dans sa mémoire de fil. Un bloc voyage donc DANS ce texte,
 * entre deux clôtures :
 *
 *     ```bellum-block
 *     {"type":"verdict", …}
 *     ```
 *
 * Un champ de réponse séparé aurait été un second canal : une migration pour le
 * persister, une seconde écriture pour chaque surface, et un fil relu qui
 * perdrait ses cartes le jour où l'une des deux écritures manque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE CONTRAT REFUSE PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 *  - AUCUNE PROBABILITÉ : aucun champ numérique de score ni de chance n'existe,
 *    une clé non déclarée DISPARAÎT (mode strip), et un texte qui en porte une
 *    rend le bloc invalide (`mentionsProbability`).
 *  - UN CLASSEMENT N'EST JAMAIS NU : `axes` est obligatoire, et ce qui n'a pas pu
 *    être évalué a sa place NOMMÉE (`not_evaluated`).
 *  - « NON MESURÉ » N'EST PAS 0 : une cellule de comparaison inconnue vaut `null`,
 *    et une chaîne vide redevient `null` — jamais une valeur de remplissage.
 *  - UN LIEN RESTE DANS L'APPLICATION : un chemin qui commence par un seul `/`,
 *    sans `..`. L'écran refait la vérification contre les routes RÉELLES
 *    (`appRouteTarget`, GA-277) — ce contrat ne connaît pas le routeur.
 *  - UN CHAMP OPTIONNEL ABSENT RESTE ABSENT : `null` redevient `undefined`.
 *
 * ⚠️ Miroir pydantic : `apps/ia/app/models/reply_blocks.py`. Les deux lisent le
 * MÊME jeu `reply-blocks.fixtures.json` et doivent le traverser à l'identique.
 */

export const REPLY_BLOCK_FENCE = 'bellum-block'

export const REPLY_BLOCK_TYPES = [
  'verdict',
  'account_ranking',
  'contact_list',
  'comparison',
  'action_plan',
  'consultant_shortlist',
  'meeting_brief',
  // #3340 (LAU-FINAL-250) — le brief provisoire d'un consultant décrit PAR
  // MORCEAUX (jamais un CV joint) : ses douze champs devaient déjà être
  // NOMMÉS par le prompt (`_BLOCK_CONSULTANT_BRIEF`), mais rien ne forçait
  // leur présence dans la RÉPONSE — recette prod du 30/09 : seuls quatre
  // champs sur douze ressortaient à l'écran. Cette carte les rend tous,
  // comme `axes` sur un classement : ce qui n'est pas su reste ABSENT
  // (jamais deviné), et `unknowns` reste le seul champ obligatoire — un
  // score n'est jamais nu (GA-18/19).
  'consultant_brief',
  'missing_data',
  // #2271.16/.19/.20 — les trois sorties qu'une conversation ne rendait pas
  // encore : la fiche d'UN compte, l'historique daté d'UN compte, et un jeu de
  // lignes prêt à devenir un fichier. Les trois RÉUTILISENT une donnée déjà
  // calculée ailleurs (le briefing de compte, `GET /accounts/:id/timeline`, une
  // liste déjà produite par un autre outil) — aucune n'introduit de calcul neuf.
  'account_card',
  'timeline',
  'file_export',
  // #2429.1 / #2429.13 — l'approche commerciale (Objectif / Angle d'accroche /
  // Cas d'usage) ne dépend plus d'un titre markdown exact : elle a sa carte.
  'approach',
  // #3392 / #3428 (reste, recette prod 30/09) — le sprint 10 dont 3, chacun
  // avec pourquoi maintenant / porte d'entrée / premier mouvement. Même
  // défaut que `consultant_brief` (#3340) : la prose du prompt ne forçait la
  // présence d'aucun des trois champs.
  'account_volume_sprint',
  // #213.2 (#3207, épopée #3228) — le contrat de comptage à quinze champs
  // (`apps/ia/app/services/count_contract.py`) copié EXACTEMENT dans une carte :
  // avant cette carte, il ne voyageait que jusqu'au modèle, qui pouvait le citer
  // en texte libre (« 41 contacts ») sans jamais nommer ce qui manque (dédup ?
  // résolution d'identité ? seuil de confidentialité franchi ?). `raw_count` est
  // le seul champ garanti ; tout le reste absent dit « non mesuré », jamais 0.
  'count_contract',
  // #3758.2 (BEL-LAU-1001) — la cartographie de comptes d'un périmètre, en
  // groupes nommés : avant cette carte, « donne-moi la cartographie de
  // Montpellier » ressortait en pavé de texte (aucune carte ne portait un
  // PÉRIMÈTRE et ce qu'il ne couvre pas). Miroir de `reply_blocks.py`.
  // #3762 (BEL-LAU-1005) — le gabarit canonique d'une CARTOGRAPHIE de comptes :
  // en-tête, cadrage, synthèse, grille de cartes homogènes, blocs secondaires,
  // bloc d'action. Jamais une liste de puces.
  'account_map',
  // #3758 (BEL-LAU-1001, reste du lot J14) — le compte rendu de rendez-vous
  // déjà ENREGISTRÉ (`notes.meeting_recap_snapshot`, posé par
  // `MeetingNotesService` au moment de l'approbation, jamais recalculé) :
  // décisions, actions (prochaines étapes) et relance, telles qu'elles ont
  // été dérivées CE jour-là. `as_of` est la date d'ENREGISTREMENT, pas celle
  // de la réponse — jamais le texte libre du modèle.
  'post_meeting_summary',
  // #2985 (lot E07 08/10) — la revue de compte MANAGER sur UN compte NOMMÉ :
  // avant cette carte, « prépare-moi un point manager sur X » sortait en
  // paragraphe (recette 07/10, lot R22). Bâtie du SEUL résultat de
  // `get_account_manager_review` (`known_shape_gate.py`), jamais du texte du
  // modèle — même famille de traitement que `post_meeting_summary`.
  'manager_review',
] as const

/**
 * Une probabilité, dite en toutes lettres. Refusée six fois comme doctrine
 * (`c26_probabilite`) : une carte l'afficherait avec l'autorité d'un chiffre
 * calculé. « Par chance » ou « une chance de rencontrer » ne sont pas visés.
 * ⚠️ Même motif, mot pour mot, dans `apps/ia/app/models/reply_blocks.py`.
 */
const PROBABILITY_WORDING =
  /probabilit|likelihood|chances?\s+de\s+(?:signer|signature|closing|conclure|gagner|succès|réussir|réussite|remporter)|\bwin\s+rate\b/i

export function mentionsProbability(text: string): boolean {
  return PROBABILITY_WORDING.test(text)
}

const line = (max: number) => z.string().trim().min(1).max(max)

/** Un optionnel : `null` redevient absent, jamais une valeur. */
const opt = <T extends z.ZodType>(schema: T) =>
  // `.optional()` APRÈS le `.transform()` : en zod 4, avant, la clé deviendrait obligatoire dans le type inféré.
  schema
    .nullable()
    .transform(value => value ?? undefined)
    .optional()

const lines = (maxItems: number, maxLength = 400) => z.array(line(maxLength)).max(maxItems)

/** Un chemin DE L'APPLICATION : un seul `/` en tête, aucun espace, aucun `..`. */
const appPath = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?![/\\])\S*$/)
  .refine(path => !path.includes('..'))

/** « 2026 », « 2026-07 » ou « 2026-07-03 » — une date qu'on peut relire. */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/)

/** Un horodatage RÉEL d'événement (#2271.19) — jamais une date devinée : un
 *  événement sans date lisible n'entre pas dans la timeline. */
const isoDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/)

/** Un nom de fichier (#2271.20) — jamais un chemin : aucun `/`, aucun `..`. */
const fileName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^/\\]+$/)
  .refine(name => !name.includes('..'))

const actionSchema = z.object({ label: line(120), href: opt(appPath) })

/**
 * #3776.5 (lot K05, 07/10) — LA NATURE DE LA CITATION, PAS SEULEMENT SON LIBELLÉ.
 *
 * Le lot J32 (#3776) laissait « reste » : « preuve / interprétation / action
 * distinguables […] une observation historique ne devient ni signal actuel ».
 * `proof` = un fait vérifié par un outil (registre, CRM, document) ; `history`
 * = un fait daté, passé — jamais relu comme actuel sans cette date ;
 * `interpretation` = une lecture du modèle à partir de signaux ambigus,
 * jamais une preuve indépendante.
 *
 * `.optional()`, comme `level` plus bas : un champ AJOUTÉ, que le prompt ne
 * remplit pas encore sur toutes les cartes — absent = non qualifié, jamais
 * deviné. ⚠️ Miroir pydantic : `CardSource` (`apps/ia/app/models/reply_blocks.py`).
 */
export const REPLY_SOURCE_BASIS_VALUES = ['proof', 'interpretation', 'history'] as const
export type ReplySourceBasis = (typeof REPLY_SOURCE_BASIS_VALUES)[number]

/**
 * Théo B l1-laura — le LIEN de la source : la page de l'éditeur de l'information (offre, article, communiqué),
 * en https, rendu par l'outil qui l'a lue. Absent = pas de lien, jamais un lien deviné.
 * ⚠️ Miroir pydantic : `_web_url` (`apps/ia/app/models/reply_blocks.py`).
 */
const webUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https:\/\/[^\s/$.?#][^\s]*$/i)

const sourceSchema = z.object({
  label: line(80),
  as_of: opt(isoDate),
  basis: opt(z.enum(REPLY_SOURCE_BASIS_VALUES)),
  url: opt(webUrl),
})

// #3395.1 (recette prod 30/09/2026) — la personne utile MAINTENANT sur ce
// verdict : jamais un contact deviné, seulement celui qu'un outil a
// réellement rendu (même discipline que `href` partout ailleurs dans ce
// contrat — un identifiant réel ou pas de lien du tout).
const verdictContactSchema = z.object({ name: line(120), role: opt(line(120)), href: opt(appPath) })

const verdictBlock = z.object({
  type: z.literal('verdict'),
  conclusion: line(300),
  reasons: lines(6).min(1),
  limits: opt(lines(6)),
  // #3395.1 — LA ROUTE RECOMMANDÉE : le chemin d'approche en une phrase,
  // distincte de `conclusion` (le verdict tranché) et de `next_action` (le
  // prochain GESTE) — « par quel périmètre entrer et dans quel ordre »,
  // jamais un chemin d'application (`appPath`) : c'est une phrase, pas un lien.
  route: opt(line(300)),
  contact: opt(verdictContactSchema),
  next_action: opt(actionSchema),
})

/** #3764 — les niveaux d'un compte classé : un sous-ensemble des badges de `reply-badges.ts`. */
const RANKED_ACCOUNT_LEVELS = ['priority', 'to_watch', 'to_qualify'] as const satisfies readonly ReplyBadgeCode[]

const accountRankingBlock = z.object({
  type: z.literal('account_ranking'),
  title: opt(line(120)),
  /** #3769 — l'identifiant STABLE de la carte : même `card_id` dans un fil = même carte, la dernière remplace la précédente. */
  card_id: opt(line(60)),
  /** Les critères qui ORDONNENT la liste. Sans eux, un rang est un score nu. */
  axes: lines(6, 80).min(1),
  items: z
    .array(
      z.object({
        name: line(120),
        href: opt(appPath),
        // #1914.13 — aucun `website` : le logo d'un compte vient de sa fiche
        // ENREGISTRÉE (`href` vers `/accounts/<uuid>`), jamais d'un domaine écrit
        // par le modèle. Une clé `website` glissée dans une carte disparaît (strip).
        verdict: opt(line(300)),
        why: lines(5).min(1),
        why_now: opt(line(400)),
        limits: opt(lines(5)),
        // #3247.r40 — 400 (était 80) : une phrase de manque ne se tronque pas.
        not_evaluated: opt(lines(6)),
        action: opt(actionSchema),
        source: opt(sourceSchema),
        // #3764 (lot L1 07/10) — le NIVEAU du compte, trois badges du vocabulaire
        // fermé (`reply-badges.ts`), dérivé par le serveur de la catégorie rendue
        // par l'outil (`known_shape_gate.py`), jamais deviné. Absent = aucun badge.
        level: opt(z.enum(RANKED_ACCOUNT_LEVELS)),
        // #3816.2 (lot C4 07/10) — les SUITES de la conversation depuis CE compte (lancer
        // l'analyse, voir les contacts, préparer le message) : cliquer envoie `ask` à Laura,
        // qui enchaîne le maillon suivant sans qu'on ressaisisse le profil. Jamais un envoi :
        // Laura prépare, le commercial envoie. Posées par le SERVEUR (`known_shape_gate`).
        follow_ups: opt(
          z
            // #4397 (N1) — `talent_id` : l'identifiant du consultant du vivier en MÉTADONNÉE. Le texte `ask`
            // n'en porte jamais (un UUID brut s'affichait dans la bulle de l'utilisateur).
            .array(z.object({ label: line(120), ask: line(400), talent_id: opt(z.string().guid()) }))
            .min(1)
            // #4421.3 — un bouton « Préparer le mail » par contact à joindre (dix au plus, comme l'outil).
            .max(10),
        ),
        // #3704.2 — recette prod 06/10 : la distinction « déjà dans ton espace »
        // vs « nouvelle cible » était calculée (`already_in_workspace`,
        // `chat_tools.py`) mais aucune carte ne la portait jusqu'à l'écran — un
        // calcul juste, testé, que personne n'appelait. Absent = l'appartenance
        // au portefeuille n'a pas pu être vérifiée pour cette ligne (jamais
        // deviné « nouvelle cible » par défaut).
        already_in_workspace: opt(z.boolean()),
        // #4432.3 — le palier de zone d'un compte élargi (« à 38 km de Toulouse »), posé par le serveur.
        zone_label: opt(line(80)),
        // #4642 — les offres relevées qui ont fait sortir CE compte (intitulé + date, tels que la ligne les
        // affiche) : elles voyagent avec le nom quand le compte part en analyse, pour passer en tête du dossier.
        offers: opt(z.array(z.object({ title: line(160), date: opt(isoDate) })).max(10)),
        // #4421.15 — les personnes trouvées HORS de l'espace, révélables au clic (« Obtenir l'e-mail »), posées
        // par le SERVEUR (`known_shape_gate`) depuis la sortie de l'outil, jamais par le modèle.
        reveal: opt(outsidePersonRevealCardSchema),
      }),
    )
    .min(1)
    .max(20),
  not_evaluated: opt(lines(6)),
  /** #4432.3 — la zone de la recherche (libellés), posée par le serveur : elle VOYAGE avec le nom
   *  quand un compte de la carte part en analyse et devient le périmètre du dossier. */
  search_zone: opt(
    z.object({
      city: opt(line(120)),
      departments: opt(lines(20, 60)),
      regions: opt(lines(18, 60)),
    }),
  ),
  /** #4642 — la demande dont la carte « Comptes où placer X » est la réponse : la fiche du talent, ses compétences
   *  et la zone lue, posées par le SERVEUR. Elles voyagent avec le lot d'analyses (cadrage visible et modifiable)
   *  et PRIORISENT le dossier ; la zone, ici, est un libellé — jamais le périmètre (#4432 est un autre lot). */
  talent_context: opt(
    z.object({
      talent_id: opt(z.string().guid()),
      /** #4642 — le nom de la fiche, pour que le dossier lancé depuis la carte nomme le consultant. */
      talent_name: opt(line(120)),
      skills: opt(lines(20, 60)),
      zone: opt(line(120)),
    }),
  ),
})

const CONTACT_FOLLOW_UP_KINDS = ['sent', 'prepared'] as const

const followUpSchema = z.object({
  kind: z.enum(CONTACT_FOLLOW_UP_KINDS),
  channel: opt(line(40)),
  as_of: isoDate,
})

const contactListBlock = z.object({
  type: z.literal('contact_list'),
  title: opt(line(120)),
  items: z
    .array(
      z.object({
        name: line(120),
        role: opt(line(160)),
        company: opt(line(120)),
        href: opt(appPath),
        // #4610.7 — la fiche du COMPTE cité sur la ligne, posée par le serveur depuis l'`account_id` de l'outil.
        company_href: opt(appPath),
        // r3a (recette prod 07/10) : coordonnées en clair sur la carte.
        email: opt(line(160)),
        phone: opt(line(80)),
        reason: opt(line(400)),
        source: opt(sourceSchema),
        // #3894 — relance dans contact_list (Louis 16/10) : le DERNIER geste de relance connu pour cette
        // personne, lu dans l'historique d'envoi (`outreach_messages`), jamais calculé ici. `sent` = un message
        // enregistré « envoyé/délivré » (jamais une preuve de réception) ; `prepared` = un brouillon préparé, pas
        // envoyé. Absent = rien de connu : aucune ligne à l'écran, jamais « 0 » ni « jamais relancé ».
        follow_up: opt(followUpSchema),
      }),
    )
    .min(1)
    .max(30),
  missing: opt(lines(6)),
  // #AM.32 — « Voir dans l'organigramme » : le compte et le périmètre demandés (cyber chez EDF). L'écran ouvre la
  // vue Focale existante de l'onglet Organigramme, déjà filtrée sur la famille que ce périmètre désigne.
  org_view: opt(z.object({ account_id: line(64), perimeter: opt(line(120)) })),
})

const comparisonBlock = z.object({
  type: z.literal('comparison'),
  title: opt(line(120)),
  /** Les sujets comparés, côte à côte. */
  columns: lines(4, 80).min(2),
  rows: z
    .array(
      z.object({
        label: line(80),
        /** `null` = non mesuré. Une chaîne vide aussi : ce n'est jamais « 0 ». */
        cells: z.array(
          z
            .string()
            .trim()
            .max(200)
            .nullable()
            .transform(cell => (cell ? cell : null)),
        ),
      }),
    )
    .min(1)
    .max(12),
  note: opt(line(300)),
})

const actionPlanBlock = z.object({
  type: z.literal('action_plan'),
  title: opt(line(120)),
  objective: opt(line(300)),
  steps: z
    .array(
      z.object({
        label: line(200),
        detail: opt(line(400)),
        when: opt(line(80)),
        owner: opt(line(80)),
        href: opt(appPath),
      }),
    )
    .min(1)
    .max(10),
})

const consultantShortlistBlock = z.object({
  type: z.literal('consultant_shortlist'),
  title: opt(line(120)),
  need: opt(line(300)),
  items: z
    .array(
      z.object({
        name: line(120),
        headline: opt(line(160)),
        href: opt(appPath),
        fit: lines(5).min(1),
        gaps: opt(lines(5)),
        availability: opt(line(120)),
        source: opt(sourceSchema),
      }),
    )
    .min(1)
    .max(15),
  not_evaluated: opt(lines(6)),
})

const meetingBriefBlock = z.object({
  type: z.literal('meeting_brief'),
  title: opt(line(120)),
  account: opt(z.object({ name: line(120), href: opt(appPath) })),
  when: opt(line(80)),
  objective: line(300),
  /** #4424.4 — 3 à 5 phrases, offre de l'ESN × enjeu du compte. Absent sans profil d'offre. */
  pitch: opt(line(600)),
  attendees: opt(z.array(z.object({ name: line(120), role: opt(line(160)), href: opt(appPath) })).max(10)),
  talking_points: lines(8).min(1),
  questions: opt(lines(8)),
  risks: opt(lines(6)),
  unknowns: opt(lines(6)),
})

/**
 * #3340 — LE BRIEF PROVISOIRE D'UN CONSULTANT, DANS LA CONVERSATION.
 *
 * Les douze champs de l'issue, tous FACULTATIFS sauf `unknowns` : un
 * consultant décrit par morceaux n'a jamais ses douze champs au premier
 * message, et un champ tu ne s'invente pas (doctrine « jamais de donnée
 * fictive »). `unknowns` seul est obligatoire — la raison d'être de cette
 * carte est justement qu'elle est PROVISOIRE ; si plus rien n'y manquait,
 * ce ne serait plus un brief provisoire mais un profil complet, qui n'a pas
 * besoin de cette carte. Même règle que `axes` sur `account_ranking` : ce
 * qui n'a pas pu être évalué reste NOMMÉ, jamais silencieux.
 */
const consultantBriefBlock = z.object({
  type: z.literal('consultant_brief'),
  title: opt(line(120)),
  role: opt(line(160)),
  previous_roles: opt(lines(5, 160)),
  seniority: opt(line(120)),
  tech_focus: opt(line(160)),
  functional_focus: opt(line(160)),
  technologies: opt(lines(10, 80)),
  sectors: opt(lines(6, 80)),
  contract_type: opt(line(80)),
  availability: opt(line(120)),
  mobility: opt(line(160)),
  work_mode: opt(line(80)),
  rate_target: opt(line(120)),
  unknowns: lines(8).min(1),
})

const missingDataBlock = z.object({
  type: z.literal('missing_data'),
  title: opt(line(120)),
  /** Ce qui a ÉCHOUÉ pendant le tour — distinct de ce qui n'existe pas encore. */
  failed: opt(lines(6)),
  missing: z
    .array(z.object({ what: line(200), why: opt(line(400)), how: line(400), href: opt(appPath) }))
    .min(1)
    .max(8),
  still_possible: opt(lines(6)),
})

/**
 * #2271.16 — LA FICHE D'UN COMPTE, DANS LA CONVERSATION.
 *
 * Avant ce bloc, Laura ne pouvait que citer un lien markdown vers `/accounts/<id>` :
 * pour VOIR le compte, il fallait quitter le fil. `href` est donc OBLIGATOIRE ici
 * (contrairement à `account_ranking`, où un compte cité n'a pas toujours de fiche
 * ouverte) — une carte qui prétend être « la fiche » sans y mener ne tiendrait pas
 * sa promesse. Mêmes champs qu'un `RankedAccount`, sans les deux qui n'ont de sens
 * que dans un CLASSEMENT (`axes` au niveau du bloc, `why_now`) : cette carte montre
 * UN compte, elle ne le compare à aucun autre.
 */
const accountCardBlock = z.object({
  type: z.literal('account_card'),
  name: line(120),
  href: appPath,
  verdict: opt(line(300)),
  highlights: lines(6).min(1),
  limits: opt(lines(6)),
  not_evaluated: opt(lines(6, 80)),
  action: opt(actionSchema),
  source: opt(sourceSchema),
  // #AM.46 — les SUITES possibles depuis ce compte, sans ordre imposé : cliquer envoie `ask` à Laura. Posées par le
  // SERVEUR (`account_next_steps.py`), jamais écrites de mémoire par le modèle.
  follow_ups: opt(
    z
      .array(z.object({ label: line(120), ask: line(400) }))
      .min(1)
      .max(10),
  ),
})

/**
 * #2271.19 — L'HISTORIQUE D'UN COMPTE, DANS LA CONVERSATION.
 *
 * Réutilise EXACTEMENT ce que `GET /accounts/:id/timeline` rend déjà (§ garde
 * `AccountTimelineCard.tsx`, l'écran de fiche) : `label`/`detail` viennent des
 * TROIS tables que ce service fusionne (actions journalisées, mouvements
 * d'opportunité, exécutions de workflow) — JAMAIS le corps d'un message. Un
 * compte réellement sans historique rend `events: []`, et l'écran le DIT
 * distinctement (GA-18/19) plutôt que de masquer la carte.
 */
const timelineEventBlock = z.object({
  label: line(200),
  detail: opt(line(400)),
  at: isoDateTime,
  kind: z.enum(TIMELINE_EVENT_KINDS).optional(),
})

const timelineBlock = z.object({
  type: z.literal('timeline'),
  title: opt(line(120)),
  account: opt(z.object({ name: line(120), href: opt(appPath) })),
  events: z.array(timelineEventBlock).max(50),
})

/**
 * #2271.20 — UN FICHIER EXPORTABLE, PRÊT À TÉLÉCHARGER.
 *
 * Le copilote n'envoie jamais rien : cette carte ne porte AUCUNE destination
 * réseau, seulement des lignes déjà produites par un autre outil (comptes,
 * contacts…), reformées en colonnes. Le téléchargement est un geste local de
 * l'utilisateur (`downloadCSV`, `apps/web/src/lib/export-csv.ts`) — rien ne part
 * vers un service externe. Même règle de cellule que `comparison` : `null` =
 * non mesuré, jamais une valeur de remplissage.
 */
const fileExportBlock = z.object({
  type: z.literal('file_export'),
  title: opt(line(120)),
  filename: fileName,
  columns: lines(8, 80).min(1),
  rows: z
    .array(
      z.object({
        cells: z.array(
          z
            .string()
            .trim()
            .max(200)
            .nullable()
            .transform(cell => (cell ? cell : null)),
        ),
      }),
    )
    .min(1)
    .max(200),
  note: opt(line(300)),
})

/**
 * #2429.1 / #2429.13 — L'APPROCHE COMMERCIALE, EN CARTE.
 *
 * Jusqu'ici, la seule forme d'une approche (« comment aborder ce compte ») était
 * trois intitulés en gras que `StructuredReply` reconnaissait À LA LETTRE : un
 * modèle qui écrivait « Accroche » au lieu de « Angle d'accroche » rendait un
 * paragraphe. La structure tenait à la capacité du modèle à écrire un titre
 * exact — le NO-GO de #2429. Ici elle tient à des CHAMPS validés.
 *
 * `use_case` est FACULTATIF et c'est voulu : sans preuve concrète dans le
 * dossier, le modèle ne l'écrit pas (jamais inventée), et l'écran NOMME ce
 * manque (`noUseCase`) au lieu de masquer la section.
 */
const approachBlock = z.object({
  type: z.literal('approach'),
  title: opt(line(120)),
  objective: line(300),
  angle: line(400),
  use_case: opt(line(400)),
  next_action: opt(actionSchema),
})

/**
 * #3392 / #3428 — LE SPRINT EXÉCUTABLE, QUAND LE VOLUME DEMANDÉ DÉPASSE LA
 * CAPACITÉ RÉELLE.
 *
 * Recette prod du 30/09 (« la carte Découvrir n'a pas le filtre région AURA »,
 * « le sprint 10 dont 3 n'est pas produit ») : `_BLOCK_ACCOUNT_VOLUME_SPRINT`
 * demandait déjà en PROSE que Laura nomme, pour chacun des trois comptes
 * prioritaires, POURQUOI MAINTENANT / PAR QUELLE PORTE ENTRER / LE PREMIER
 * MOUVEMENT — rien ne forçait leur présence dans la réponse. Même défaut,
 * même correctif que `consultant_brief` (#3340) : une carte, pas une
 * promesse de prompt.
 *
 * `focus` est borné à 3 (le mot de l'issue : « dont 3 à travailler à fond »)
 * et chacun de ses trois champs est OBLIGATOIRE — sans porte d'entrée
 * VÉRIFIÉE, le compte n'a pas sa place dans le focus (doctrine « jamais de
 * donnée fictive » : une porte devinée est pire qu'une porte absente).
 * `sprint` reste la liste EXÉCUTABLE au sens large (dix comptes par exemple,
 * jamais un nombre fixe imposé — #3428, « tranché sans Louis ») ;
 * `full_list_count` est le compte de la mémoire de marché COMPLÈTE que la
 * recherche a réellement rendue, jamais recalculé ici (GA-26).
 */
const accountVolumeSprintBlock = z.object({
  type: z.literal('account_volume_sprint'),
  title: opt(line(120)),
  full_list_count: z.number().int().min(0),
  /**
   * #3428 — la liste COMPLÈTE est une sortie, pas un chiffre : le lien vers
   * Découvrir porte les critères de la recherche (copié tel quel du résultat de
   * l'outil, jamais composé par le modèle). Absent sans recherche exécutée.
   */
  full_list_href: opt(appPath),
  sprint: z
    .array(z.object({ name: line(120), href: opt(appPath) }))
    .min(1)
    .max(10),
  focus: z
    .array(
      z.object({
        name: line(120),
        href: opt(appPath),
        why_now: line(400),
        entry_point: line(300),
        first_move: line(400),
      }),
    )
    // Lot Q02 (30/09) — vide quand AUCUN compte n'a de porte d'entrée vérifiée :
    // l'écran le NOMME (miroir de `reply_blocks.py`), la carte ne tombe pas en puces.
    .max(3),
})

/**
 * #213.2 (#3207, épopée #3228) — LE CONTRAT DE COMPTAGE, EN CARTE.
 *
 * Miroir des quinze champs de `count_contract.py::CountContract` — cette carte
 * ne recalcule rien, elle copie ce qu'un outil de chat a déjà mesuré
 * (`search_market_memory`, `get_account_contacts`, `search_workspace_contacts`
 * portent déjà `count_contract` dans leur résultat). `current_or_historical` a
 * les deux mêmes valeurs que `count_contract.CURRENT_OR_HISTORICAL` — recopiées
 * ici comme `TIMELINE_EVENT_KINDS` l'est côté pydantic (ce miroir n'a pas le
 * service IA à l'exécution).
 */
const countContractBlock = z.object({
  type: z.literal('count_contract'),
  metric_name: line(160),
  object_type: line(80),
  unique_key: line(200),
  scope: line(80),
  entity_scope: line(200),
  period: opt(line(80)),
  current_or_historical: z.enum(['current', 'historical']),
  source_layers: lines(6, 80).min(1),
  raw_count: z.number().int().min(0),
  // « Non mesuré » n'est jamais 0 (doctrine) : absent tant qu'aucune couche ne
  // sait dédupliquer/résoudre, jamais recopié depuis `raw_count`.
  deduplicated_count: opt(z.number().int().min(0)),
  resolved_count: opt(z.number().int().min(0)),
  confidence: opt(z.number().int().min(0).max(100)),
  coverage: opt(line(160)),
  suppression_threshold: opt(z.number().int().min(0)),
  caveats: lines(6, 400),
})

const ACCOUNT_MAP_COMPLETENESS = ['complete', 'partial', 'sparse'] as const
const ACCOUNT_MAP_STATUSES = ['priority', 'to_qualify', 'watch', 'to_document'] as const
const ACCOUNT_MAP_CONTEXT_KINDS = ['territory', 'sector', 'size', 'filter'] as const

/**
 * #3758.2 (BEL-LAU-1001) — LA CARTOGRAPHIE DE COMPTES, EN CARTE.
 *
 * Retour bêta du 06/10 : « une cartographie de comptes ne sort plus en simple
 * texte libre ». `account_ranking` ordonne (il exige des axes) et
 * `account_volume_sprint` dimensionne ; aucune des deux ne dit « voici ce que
 * le périmètre contient, rangé par groupe, ET ce que cette lecture ne couvre
 * pas ». Une cartographie n'est pas un classement : ses groupes (un territoire,
 * un segment, une famille) n'ont pas d'ordre de mérite, donc aucun rang ni
 * score ici.
 *
 * `coverage` est OBLIGATOIRE : une cartographie n'est jamais présentée comme
 * complète sans le dire — elle écrit ce qu'elle couvre. `not_covered` nomme ce
 * qu'elle NE couvre PAS (« non mesuré » n'est jamais 0, une absence se dit) ;
 * non vide, la carte se lit « partielle » à l'écran. Un groupe sans compte
 * n'existe pas (une absence ne fait aucune ligne) : `min(1)` sur les deux niveaux.
 *
 * #3762 (BEL-LAU-1005) — LE GABARIT CANONIQUE D'UNE CARTOGRAPHIE DE COMPTES.
 *
 * « Ouvre mon périmètre à Montpellier et périphérie » produisait un paragraphe
 * et des puces. Une cartographie a UN squelette, forcé par ce contrat comme
 * `consultant_brief` (#3340) force ses douze champs : la prose d'un prompt ne
 * garantit la présence de rien.
 *
 *  1. EN-TÊTE — `title`, `completeness` (le badge), `context` (territoire,
 *     secteurs, taille, filtres : au moins un chip).
 *  2. CADRAGE — `framing` : d'où vient la sélection, ce qu'elle prouve, ce
 *     qu'elle NE prouve PAS. Les trois sont obligatoires : une sélection qui ne
 *     dit pas ce qu'elle ne prouve pas se lit comme un recensement.
 *  3. SYNTHÈSE — `summary` : comptes retenus, niveau de qualification, réserve.
 *  4. GRILLE — `accounts`, des cartes HOMOGÈNES : la raison (`proof`), la
 *     prudence (`caution`) et la prochaine action (`next_action`) sont
 *     obligatoires sur CHAQUE carte ; `href` (lien objet), `tags` et le
 *     statut sont ce que la source a réellement rendu.
 *  5. BLOCS SECONDAIRES — `memory`, `to_document`, `method_limit` : absents
 *     quand on n'a rien à dire, jamais remplis pour faire plein.
 *  6. ACTIONS — `actions` : à valider, ouvrir dans Découvrir, enrichir la
 *     recherche, sauvegarder/ignorer. Laura PRÉPARE, n'envoie rien.
 *
 * DOCTRINE. Le badge de complétude est un NIVEAU nommé (`complete`,
 * `partial`, `sparse`), jamais un pourcentage : un taux de couverture mesure ce
 * qu'on SAIT, jamais ce que le marché FAIT (GA-259). Aucune probabilité (le
 * contrat refuse le mot). Une sélection partielle reste une cartographie : une
 * carte seule suffit — zéro compte n'est PAS une cartographie, c'est
 * `missing_data`. `retained_count` peut dépasser `accounts.length` (la grille
 * montre un extrait borné) ; `summary` ne recalcule rien.
 *
 * INTÉGRATION 06/10 — UN SEUL SCHÉMA (union des champs #3758.2 + #3762). Deux
 * lectures du même concept : les GROUPES (`coverage` + `groups`, ce que le
 * périmètre contient rangé par groupe, `not_covered`) et la GRILLE canonique
 * (`completeness`, `context`, `framing`, `summary`, `accounts`). Une carte porte
 * au moins l'une des deux ; celle qu'elle porte est COMPLÈTE (ses champs
 * obligatoires le restent, tenu par `accountMapShapeIssues`).
 */
const accountMapBlock = z.object({
  type: z.literal('account_map'),
  title: opt(line(160)),
  // Lecture en groupes (#3758.2).
  coverage: opt(line(300)),
  groups: opt(
    z
      .array(
        z.object({
          label: line(120),
          items: z
            .array(z.object({ name: line(120), href: opt(appPath), detail: opt(line(200)) }))
            .min(1)
            .max(40),
        }),
      )
      .min(1)
      .max(8),
  ),
  not_covered: opt(lines(6, 300)),
  source: opt(sourceSchema),
  // Grille canonique (#3762).
  completeness: opt(z.object({ level: z.enum(ACCOUNT_MAP_COMPLETENESS), label: line(60) })),
  context: opt(
    z
      .array(z.object({ kind: z.enum(ACCOUNT_MAP_CONTEXT_KINDS), label: line(80) }))
      .min(1)
      .max(8),
  ),
  framing: opt(z.object({ origin: line(300), proves: line(300), not_proven: line(300) })),
  summary: opt(
    z.object({
      retained_count: z.number().int().min(1),
      qualification: line(200),
      main_reserve: opt(line(300)),
    }),
  ),
  accounts: opt(
    z
      .array(
        z.object({
          name: line(120),
          href: opt(appPath),
          status: z.object({ level: z.enum(ACCOUNT_MAP_STATUSES), label: line(40) }),
          proof: line(240),
          tags: opt(lines(5, 40)),
          caution: line(240),
          next_action: actionSchema,
        }),
      )
      .min(1)
      .max(12),
  ),
  memory: opt(lines(4)),
  to_document: opt(lines(6)),
  method_limit: opt(line(400)),
  actions: opt(
    z.object({
      validate: opt(actionSchema),
      discover: opt(actionSchema),
      enrich: opt(actionSchema),
      save: opt(actionSchema),
    }),
  ),
})

/**
 * Intégration 06/10 — `account_map` porte les GROUPES (#3758.2), la GRILLE
 * (#3762), ou les deux ; jamais aucun, et jamais une lecture à moitié remplie.
 */
function accountMapShapeIssues(block: z.output<typeof accountMapBlock>): string[] {
  const issues: string[] = []
  const hasGroups = block.groups !== undefined || block.coverage !== undefined
  const hasGrid = block.accounts !== undefined
  if (!hasGroups && !hasGrid)
    issues.push('une cartographie porte des groupes (coverage + groups) ou une grille (accounts)')
  if (hasGroups && (block.groups === undefined || block.coverage === undefined)) {
    issues.push('une cartographie en groupes écrit sa couverture (coverage) et ses groupes (groups)')
  }
  if (hasGrid) {
    const missing = (['title', 'completeness', 'context', 'framing', 'summary'] as const).filter(
      key => block[key] === undefined,
    )
    if (missing.length) issues.push(`une cartographie en grille porte son squelette complet : ${missing.join(', ')}`)
  }
  return issues
}

/**
 * #3758 (BEL-LAU-1001, reste du lot J14) — LE COMPTE RENDU ENREGISTRÉ.
 *
 * `as_of` est la date d'ENREGISTREMENT de la note (jamais celle de la
 * réponse) : l'écran la lit comme fraîcheur de ce qui fonde la carte, pas
 * comme une activité du jour. Les trois champs sont optionnels CHACUN, mais
 * au moins l'un des trois doit être présent (`superRefine` plus bas) — un
 * compte rendu enregistré SANS décision, SANS action et SANS relance n'a
 * rien à montrer, la carte n'existe pas pour rester vide.
 */
const postMeetingSummaryActionSchema = z.object({ what: line(300), owner: opt(line(120)), due: opt(line(120)) })
const postMeetingSummaryBlock = z.object({
  type: z.literal('post_meeting_summary'),
  title: opt(line(160)),
  as_of: isoDateTime,
  decisions: opt(lines(12, 300)),
  actions: opt(z.array(postMeetingSummaryActionSchema).max(12)),
  reminder: opt(z.object({ content: line(400), due_label: opt(line(120)) })),
})

/**
 * #2985 (lot E07 08/10) — LA REVUE DE COMPTE MANAGER, EN CARTE.
 *
 * Miroir exact des champs de `accountManagerReviewSchema`
 * (`account-manager-review.ts`) : aucun second calcul, cette carte ne fait
 * que les reformer en bloc `bellum-block`. Le verdict reste un STATUT fermé
 * avec ses raisons COMPTÉES (jamais une probabilité, `mentionsProbability`
 * s'applique à cette carte comme à toutes les autres) ; les axes non lus
 * sortent du verdict et sont NOMMÉS (`not_evaluated`, GA-18/19) ; une absence
 * (couverture non lue, aucun risque écrit) ne fait AUCUNE ligne plutôt qu'une
 * valeur de remplissage.
 */
const managerReviewReasonKinds = [
  'stalled_actions',
  'risks',
  'coverage_gaps',
  'decisions_pending',
  'arbitrations_pending',
] as const
const managerReviewAxes = ['coverage', 'plan', 'change_digest', 'signals'] as const

const managerReviewVerdict = z.object({
  status: z.enum(['attention', 'stable', 'not_evaluable']),
  reasons: z.array(z.object({ kind: z.enum(managerReviewReasonKinds), count: z.number().int().min(1) })).max(5),
  not_evaluated: z.array(z.enum(managerReviewAxes)).max(4),
})

const managerReviewAction = z.object({ label: line(200), target: opt(line(160)), owner: opt(line(120)) })
const managerReviewCompletedAction = managerReviewAction.extend({ completed_at: opt(isoDate) })
const managerReviewStalledAction = managerReviewAction.extend({ due_date: isoDate })
const managerReviewRisk = z.object({ project: line(160), risks: line(600) })
const managerReviewCoverage = z.object({
  gap_count: z.number().int().min(0),
  gaps: z.array(z.object({ label: line(120), reason: line(300) })).max(5),
})
const managerReviewFact = z.object({ label: line(200), date: opt(isoDate) })
const managerReviewArbitration = z.object({
  project: line(160),
  need: opt(line(160)),
  consultant: line(120),
  account_owner: line(120),
  resource_owner: line(120),
})
const managerReviewChangeSummary = z.object({
  compared_at: isoDate,
  changed_count: z.number().int().min(0),
  appeared_count: z.number().int().min(0),
  disappeared_count: z.number().int().min(0),
})

const managerReviewBlock = z.object({
  type: z.literal('manager_review'),
  account_name: line(160),
  href: appPath,
  verdict: managerReviewVerdict,
  change_digest: opt(managerReviewChangeSummary),
  actions_completed: z.array(managerReviewCompletedAction).max(10),
  actions_stalled: z.array(managerReviewStalledAction).max(10),
  risks: z.array(managerReviewRisk).max(10),
  coverage: opt(managerReviewCoverage),
  important_facts: z.array(managerReviewFact).max(10),
  decisions_requested: z.array(managerReviewAction).max(10),
  arbitrations_requested: z.array(managerReviewArbitration).max(10),
})

export const replyBlockSchema = z
  .discriminatedUnion('type', [
    verdictBlock,
    accountRankingBlock,
    contactListBlock,
    comparisonBlock,
    actionPlanBlock,
    consultantShortlistBlock,
    meetingBriefBlock,
    consultantBriefBlock,
    missingDataBlock,
    accountCardBlock,
    timelineBlock,
    fileExportBlock,
    approachBlock,
    accountVolumeSprintBlock,
    countContractBlock,
    accountMapBlock,
    postMeetingSummaryBlock,
    managerReviewBlock,
  ])
  .superRefine((block, ctx) => {
    if (block.type === 'comparison' || block.type === 'file_export') {
      const columnCount = block.columns.length
      block.rows.forEach((row, index) => {
        if (row.cells.length !== columnCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rows', index, 'cells'],
            message: 'une ligne porte une cellule par colonne',
          })
        }
      })
    }
    if (block.type === 'account_map') {
      for (const message of accountMapShapeIssues(block)) ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    }
    if (
      block.type === 'post_meeting_summary' &&
      block.decisions === undefined &&
      block.actions === undefined &&
      block.reminder === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'un compte rendu enregistré porte au moins une décision, une action ou une relance',
      })
    }
    if (replyBlockLeaves(block).some(mentionsProbability)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'aucune probabilité dans une carte (c26_probabilite)' })
    }
  })

export type ReplyBlock = z.output<typeof replyBlockSchema>

export type ReplySegment =
  | { kind: 'text'; text: string }
  | { kind: 'block'; block: ReplyBlock }
  /** Une clôture lue, un contenu refusé. `value` = le JSON lu, ou `null`. */
  | { kind: 'invalid'; value: unknown }
  /** Une clôture ouverte sans fermeture : le flux écrit encore, ou la réponse a été coupée. */
  | { kind: 'unterminated' }

const OPENING_FENCE = '```' + REPLY_BLOCK_FENCE
// #3758.9 (reste du lot J14, recette prod 08/10 — plan d'action BNP affiché en
// JSON brut) — TOLÉRANT au JSON collé à la clôture d'ouverture sur la MÊME
// ligne (le modèle écrit parfois « ```bellum-block {"type":... » sans saut de
// ligne) : la clôture est reconnue dès qu'elle COMMENCE la ligne, le reste de
// la ligne devient la première ligne du corps — un bloc valide ne se rend
// plus jamais en texte brut pour cette seule raison de mise en forme.
const OPENING_LINE = new RegExp('^[ \\t]*```' + REPLY_BLOCK_FENCE + '[ \\t]*(.*)$')
const CLOSING_LINE = /^[ \t]*```[ \t]*$/
const SAME_LINE_CLOSING = /^(.*)```[ \t]*$/

/**
 * Découpe une réponse en segments de texte et de blocs.
 *
 * ⚠️ Même algorithme que `split_reply_blocks` côté IA : une ligne d'ouverture
 * qui COMMENCE par la clôture (le reste de la ligne, s'il y en a un, ouvre le
 * corps), la première ligne de clôture qui suit (ou la même ligne, si la
 * clôture de fin s'y trouve aussi), et le JSON lu du premier `{` au dernier
 * `}` (règle du dépôt pour un JSON écrit par un modèle).
 */
export function splitReplyBlocks(text: string): ReplySegment[] {
  const source = (text ?? '').split('\n')
  const segments: ReplySegment[] = []
  let buffer: string[] = []
  const flushText = () => {
    const chunk = buffer.join('\n').trim()
    if (chunk) segments.push({ kind: 'text', text: chunk })
    buffer = []
  }

  let index = 0
  while (index < source.length) {
    const current = source[index] as string
    const opening = OPENING_LINE.exec(current)
    if (!opening) {
      buffer.push(current)
      index += 1
      continue
    }
    const trailing = opening[1] ?? ''
    const sameLineClosing = SAME_LINE_CLOSING.exec(trailing)
    if (sameLineClosing) {
      flushText()
      segments.push(readBlock(sameLineClosing[1] ?? ''))
      index += 1
      continue
    }
    let closing = index + 1
    while (closing < source.length && !CLOSING_LINE.test(source[closing] as string)) closing += 1
    flushText()
    if (closing >= source.length) {
      segments.push({ kind: 'unterminated' })
      return segments
    }
    segments.push(readBlock([trailing, ...source.slice(index + 1, closing)].join('\n')))
    index = closing + 1
  }

  // Une clôture en cours d'écriture (« ```bell ») : le flux n'a pas fini la
  // ligne. Sa syntaxe ne s'affiche jamais, même une fraction de seconde.
  const last = buffer[buffer.length - 1]?.trim() ?? ''
  if (last.length >= 4 && last.startsWith('```') && OPENING_FENCE.startsWith(last)) {
    buffer.pop()
    flushText()
    segments.push({ kind: 'unterminated' })
    return segments
  }
  flushText()
  return segments
}

function readBlock(body: string): ReplySegment {
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) return { kind: 'invalid', value: null }
  let value: unknown
  try {
    value = JSON.parse(body.slice(start, end + 1))
  } catch {
    return { kind: 'invalid', value: null }
  }
  const parsed = replyBlockSchema.safeParse(value)
  return parsed.success ? { kind: 'block', block: parsed.data } : { kind: 'invalid', value }
}

/** Les clés qui ne portent pas de texte à lire : la forme, et les liens. #3816.2 — et les SUITES
 *  (`follow_ups`) : des gestes qui envoient une phrase à Laura, pas un contenu à copier. */
/**
 * #4397 (N1) — l'objet qu'une SUITE cliquée désigne, envoyé AVEC le message (jamais dans son texte).
 * Le service IA le lit (`follow_up_ref`) ; absent = tour ordinaire.
 */
export const followUpRefSchema = z.object({ talentId: z.string().guid() })
export type FollowUpRef = z.infer<typeof followUpRefSchema>

const NON_TEXT_KEYS = new Set([
  'type',
  'href',
  // #4610.7 — le chemin de la fiche du compte cité : une destination, jamais un texte à lire.
  'company_href',
  'website',
  'level',
  'follow_ups',
  'talent_id',
  // #4642 — le contexte de la demande et les offres relevées : des données qui voyagent, déjà écrites dans `why`.
  'talent_context',
  'offers',
  'org_view',
  // #4421.15 — une référence opaque et un identifiant légal : jamais un texte à lire.
  'person_ref',
  'siren',
])

/**
 * Les textes d'un bloc, dans leur ordre — le repli d'un bloc illisible.
 * Rien n'est inventé : seulement ce que le bloc écrivait déjà.
 */
export function replyBlockLeaves(value: unknown): string[] {
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      const trimmed = node.trim()
      if (trimmed) out.push(trimmed)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) if (!NON_TEXT_KEYS.has(key)) walk(child)
    }
  }
  walk(value)
  return out
}

/** Une ligne de tableau reconnue dans un bloc refusé — cellules déjà normalisées (`null` = non mesuré). */
export type InvalidBlockTableRow = { cells: (string | null)[] }

/** La forme d'un tableau reconnue dans un bloc refusé — pas un `ReplyBlock` validé. */
export type InvalidBlockTableShape = { title: string | null; columns: string[]; rows: InvalidBlockTableRow[] }

/**
 * #3864.6 / #3903.7 — recette prod 09/10 : un bloc `file_export` qui dépasse
 * une limite du contrat strict (plus de 8 colonnes, une cellule de plus de
 * 200 caractères…) échouait `replyBlockSchema.safeParse` et tombait dans
 * `replyBlockLeaves` — CHAQUE CELLULE devenait sa propre puce (0 `<table>`,
 * jusqu'à 156 `<li>`, une cellule par ligne). Les données restent pourtant un
 * TABLEAU : cette fonction reconnaît la forme `columns` / `rows[].cells` d'un
 * bloc refusé, SANS revalider ses limites numériques, pour que l'écran rende
 * un vrai tableau plutôt que de l'aplatir. Elle ne reconnaît QUE cette forme
 * précise (`type: 'file_export'`, colonnes et cellules en chaînes) — un bloc
 * refusé d'une autre forme continue de retomber sur `replyBlockLeaves`.
 */
export function invalidBlockTableShape(value: unknown): InvalidBlockTableShape | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  if (obj.type !== 'file_export') return null
  const rawColumns = obj.columns
  if (!Array.isArray(rawColumns) || rawColumns.length === 0 || !rawColumns.every(c => typeof c === 'string')) {
    return null
  }
  const rawRows = obj.rows
  if (!Array.isArray(rawRows) || rawRows.length === 0) return null
  const rows: InvalidBlockTableRow[] = []
  for (const row of rawRows) {
    // #3903 — une ligne écrite comme simple tableau de cellules reste une ligne.
    if (!row || typeof row !== 'object') return null
    const rawCells = Array.isArray(row) ? row : (row as Record<string, unknown>).cells
    if (!Array.isArray(rawCells)) return null
    const cells: (string | null)[] = []
    for (const cell of rawCells) {
      if (cell === null || cell === undefined) cells.push(null)
      else if (typeof cell === 'string') cells.push(cell.trim() ? cell.trim() : null)
      else if (typeof cell === 'number' || typeof cell === 'boolean') cells.push(String(cell))
      else return null
    }
    rows.push({ cells })
  }
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : null
  return { title, columns: rawColumns as string[], rows }
}
