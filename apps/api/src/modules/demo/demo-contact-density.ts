import { creditCostOf, type DecisionRole } from '@bellum/contracts'

/**
 * La DENSITÉ des dossiers de démonstration (DEMO-02, audit terrain du 17/08).
 *
 * Le jeu montrait une vingtaine de contacts par compte et AUCUN joignable : le
 * clic « Enrichir » répondait « rien trouvé », par respect d'une règle posée le
 * 10/08 — aucune donnée inventée sur une société réelle. Conséquence en réunion :
 * un prospect voyait Bellum détecter des sièges de décision, puis s'arrêter
 * juste avant ce qu'il est venu voir, c'est-à-dire quelqu'un à qui écrire.
 *
 * **Arbitrage Louis du 17/08 : on densifie les cinq comptes réels.** Ce module
 * porte cette décision, et les garde-fous qui la rendent tenable.
 *
 * Ce qui change, et ce qui ne change PAS :
 *
 *  - les personnes NOMMÉES issues du registre (mandataires sociaux) restent
 *    SANS coordonnée. Elles existent, elles sont identifiables, et leur coller
 *    une adresse fabriquée sur un lien public serait la seule version vraiment
 *    fautive de cette densification. Elles ne bougent pas d'une ligne ;
 *  - les contacts joignables ajoutés ici sont des personnes SIMULÉES. Inventer
 *    une personne est moins grave qu'inventer une donnée SUR une personne : rien
 *    n'est attribué à quelqu'un qui existe ;
 *  - leurs adresses sont en `.example`, domaine réservé par la RFC 2606 et donc
 *    jamais attribuable ni routable : un message parti par erreur ne peut
 *    atteindre personne ;
 *  - leurs numéros sont dans la plage `06 39 98 xx xx`, réservée par l'ARCEP à
 *    la fiction (audiovisuel, formation) : composer l'un d'eux ne fait sonner
 *    aucun poste ;
 *  - aucune URL de profil. Une adresse LinkedIn désigne un compte qui existe ;
 *    il n'y a pas d'équivalent `.example` d'un réseau social.
 *
 * Le seed pose `source: 'demo'` sur toutes ces lignes — la provenance dit donc
 * elle-même que ce n'est pas une donnée collectée.
 */

/**
 * #3970 — le parcours d'une personne SIMULÉE. `started_days_ago` est résolu en
 * `start_date` AU SEED (`resolveDemoEmployment`), jamais écrit en dur : la
 * salle garde des arrivées « récentes » quel que soit le jour de la réunion.
 */
export type DemoApolloEnrichment = {
  employment_history: {
    organization_name: string
    current: boolean
    title?: string
    started_days_ago?: number
    /** #4465.2 — la fin du poste, relative au semis ; absent = aucune date de fin inventée. */
    ended_days_ago?: number
  }[]
}

/** #3970 — `started_days_ago` → `start_date` (AAAA-MM-JJ), relatif à `nowMs`. */
export function resolveDemoEmployment(enrichment: DemoApolloEnrichment | undefined, nowMs: number) {
  if (!enrichment) return null
  return {
    employment_history: enrichment.employment_history.map(({ started_days_ago, ended_days_ago, ...entry }) => ({
      ...entry,
      ...(started_days_ago === undefined
        ? {}
        : { start_date: new Date(nowMs - started_days_ago * 86_400_000).toISOString().slice(0, 10) }),
      ...(ended_days_ago === undefined
        ? {}
        : { end_date: new Date(nowMs - ended_days_ago * 86_400_000).toISOString().slice(0, 10) }),
    })),
  }
}

/** Le domaine `.example` de chaque compte — jamais le domaine réel. */
const SIMULATED_DOMAIN: Readonly<Record<string, string>> = {
  'Société Générale': 'sg-groupe.example',
  SNCF: 'sncf-groupe.example',
  Kiabi: 'kiabi-groupe.example',
}

/**
 * Le rôle de décision, du libellé métier vers la valeur que la BASE accepte.
 *
 * La table ci-dessous a été écrite en français — « prescripteur », « acheteur »,
 * « utilisateur » — parce que c'est ainsi qu'un commercial nomme ces rôles. Mais
 * `contacts.decision_role` porte une contrainte `CHECK` sur l'énumération
 * CANONIQUE (`decisionRoleSchema`), et aucun de ces mots n'en fait partie.
 *
 * Résultat en production : l'INSERT des contacts de démonstration violait
 * `contacts_decision_role_check`, la création de session rendait 500, et **le
 * lien de démonstration ne s'ouvrait plus du tout**. Un libellé d'affichage
 * s'était retrouvé dans une colonne contrainte — la faute que ce dépôt a déjà
 * payée sur `account_vocabulary.kind`.
 *
 * La traduction se fait donc ICI, au seul endroit où la ligne devient une
 * écriture. Le type est l'énumération du contrat : un libellé nouveau ne
 * compilera pas tant qu'on ne lui aura pas choisi sa valeur canonique.
 */
const CANONICAL_DECISION_ROLE = {
  /** Celui qui utilisera la solution au quotidien. */
  utilisateur: 'user',
  /** Celui qui prescrit sans décider — l'énumération l'appelle `influencer`. */
  prescripteur: 'influencer',
  influenceur: 'influencer',
  /** La porte achats. */
  acheteur: 'procurement',
  /** Celui qui tient le budget. */
  decideur: 'economic',
} as const satisfies Record<string, DecisionRole>

type DensityRoleLabel = keyof typeof CANONICAL_DECISION_ROLE

/** Une ligne de la table compacte : ce qui distingue un contact d'un autre. */
type DensityRow = {
  /** Prénom + nom d'une personne SIMULÉE (voir l'en-tête). */
  name: string
  title: string
  /** Entité/filiale, telle que le dossier la nomme. */
  entity: string
  family: string
  decisionRole: DensityRoleLabel
  priority: number
  score: number
  seniority: string
  /** `false` = siège détecté sans coordonnée (l'état d'un compte froid). */
  reachable: boolean
  /**
   * #2297.51 — les coordonnées enrichies de cette personne ont été ARCHIVÉES
   * par la rétention il y a N jours (trois ans sans activité). La fiche n'a
   * plus ni e-mail ni téléphone lisibles, et DIT pourquoi — jamais « jamais
   * cherché ». Réservé à des personnes SIMULÉES ; `reachable` reste `false`.
   */
  archivedEnrichmentDaysAgo?: number
  /**
   * #2296.23/.25/.26/.30/.33 (épopée #2964) — cette personne SIMULÉE a QUITTÉ
   * l'entreprise du dossier pour l'employeur nommé ici : `lifecycle_state`
   * bascule à `historique` (même état que produirait `employerMismatch` en
   * production, `contacts.service.ts`) et Apollo « connaît » son employeur
   * ACTUEL — c'est la seule façon de rendre visible en démonstration ce que
   * l'écran contact affiche déjà pour un contact `historique` (réseau
   * dormant / historique / source potentielle, ET l'employeur détecté
   * proposé). Réservé aux personnes SIMULÉES : un parcours professionnel est
   * un fait biographique, jamais inventé sur un dirigeant RÉEL des dossiers.
   */
  historicalNewEmployer?: string
  /**
   * #3871 (lot I02) — cette personne SIMULÉE a été ÉCARTÉE explicitement par le
   * commercial (`lifecycle_state: 'rejete'`, terminal PLUS FORT que `historique`).
   * Sans elle, la recette de « <contact> a quitté l'entreprise » ne pouvait pas
   * montrer le refus d'écraser un écartement (`propose_contact_departure`,
   * « déjà écarté ») : aucune fiche `rejete` n'existait en salle.
   */
  rejectedByUser?: true
  /**
   * #3970 (lot P07) — cette personne SIMULÉE a REJOINT le compte il y a N jours
   * à son intitulé : son parcours (`apollo_enrichment.employment_history`)
   * porte le poste COURANT chez le compte, daté RELATIVEMENT au seed (figée,
   * la date vieillirait et sortirait de la fenêtre de 6 mois). Lu par
   * `recentHires` (section « Recrutements récents » de la veille, et Laura).
   * Réservé aux personnes SIMULÉES : une date d'arrivée est un fait
   * biographique, jamais inventé sur un dirigeant RÉEL des dossiers.
   */
  recentHireDaysAgo?: number
  /**
   * #2297.33/.39 — cette personne SIMULÉE porte un numéro qui a perdu sa
   * FORME (`looksLikePhoneNumber`, `@bellum/contracts` — le statut « invalid »
   * lu par `ContactKeyInfo.tsx`). Réservé à une personne SIMULÉE, comme
   * `archivedEnrichmentDaysAgo` : la forme d'un numéro se dégrade (collecte
   * tolérante, export partiel), jamais son existence même sur un dirigeant
   * RÉEL — on ne LUI invente aucune coordonnée, malformée ou non.
   */
  invalidPhone?: boolean
  /**
   * #3698 — résultat PARTIEL d'enrichissement : l'e-mail est trouvé et gardé, le
   * téléphone reste absent (jamais un numéro inventé, jamais « Échec »).
   * Personne SIMULÉE ; `reachable` reste `true` (l'e-mail est un canal ouvert).
   */
  emailOnly?: boolean
  /**
   * #2297.26 reste (30/09/2026) — cette personne SIMULÉE est sous DÉLAI DE
   * PROTECTION : un enrichissement a déjà été tenté il y a `N` jours, sans
   * rien trouver de neuf (`enrichmentCooldown`, `@bellum/contracts`). Réservé
   * à un SIÈGE (`reachable: false`) : c'est justement parce que rien n'a été
   * trouvé que le délai existe — une fiche déjà joignable n'aurait rien à
   * protéger.
   */
  recentlyEnrichedNoResultDaysAgo?: number
  /**
   * #4106.4 — la CASCADE se voit : la 1re source n'a rien rendu, la 2e a répondu. Les coordonnées de cette
   * personne SIMULÉE sont « trouvées » avec `sources_queried: 2` (un nombre, jamais un nom de fournisseur).
   * Réservé à une personne `reachable`.
   */
  cascadeSecondSource?: true
  /**
   * #4107.4 — l'e-mail de cette personne SIMULÉE a été DEVINÉ (pattern de domaine) puis VÉRIFIÉ par SMTP :
   * il porte l'état « vérifié » (`email_verified`). Un seul contact, jamais un lot.
   */
  smtpVerifiedEmail?: true
}

/**
 * `Prénom Nom` → `p.nom@domaine.example`, en retirant les accents.
 *
 * Les accents sautent parce qu'une adresse professionnelle française n'en porte
 * pratiquement jamais : garder « josé.pérez@ » produirait une adresse qui a
 * l'air fausse pour une raison qui n'a rien à voir avec la démonstration.
 */
function simulatedEmail(name: string, domain: string): string {
  const [first = '', ...rest] = name.split(/\s+/)
  const slug = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z]/g, '')
      .toLowerCase()
  return `${slug(first).slice(0, 1)}.${slug(rest.join(''))}@${domain}`
}

/**
 * Un numéro de la plage de fiction, dérivé du nom.
 *
 * Dérivé et non tiré au sort : une démonstration rejouée devant un client doit
 * afficher exactement la même fiche que la veille.
 */
function simulatedPhone(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 10000
  const digits = String(hash).padStart(4, '0')
  return `+33 6 39 98 ${digits.slice(0, 2)} ${digits.slice(2)}`
}

/**
 * #2297.33/.39 — le même numéro de fiction, qui a perdu sa forme : les deux
 * derniers chiffres redevenus des lettres, comme une redaction partielle de
 * collecte (l'exemple même cité par `contact-enrichment.ts` : « ID-20250814 »,
 * « ext 4512 »). `looksLikePhoneNumber` le rejette (une lettre suffit), la
 * plage `06 39 98` de fiction reste intacte sur le reste des chiffres.
 */
function simulatedInvalidPhone(name: string): string {
  return simulatedPhone(name).replace(/\d{2}$/, 'XX')
}

/** La forme que `demo-dataset` attend, coordonnées comprises. */
type DensifiedContact = {
  full_name: string
  photo_url: null
  title: string
  entity: string
  family: string
  decision_role: DecisionRole
  priority: number
  email: string | null
  phone: string | null
  profile_summary: string
  why_contact: string
  email_message: { subject: string; body: string } | null
  linkedin_message: string | null
  contact_score: number
  seniority: string
  lifecycle_state: string
  key_points: string[]
  /** #2296.30/.33 — voir {@link DensityRow.historicalNewEmployer} ; #3970 — {@link DensityRow.recentHireDaysAgo}. */
  apollo_enrichment?: DemoApolloEnrichment
  /**
   * #3716 — colonnes d'un import SANS champ d'accueil, sous leur intitulé
   * d'origine (`contacts.extra`). Réservé aux interlocuteurs FICTIFS : le
   * détail « Parcours et informations complémentaires » ne doit jamais s'ouvrir
   * en démo sur un contenu inventé pour une personne réelle. Absent = `{}`.
   */
  extra?: Record<string, string>
  /**
   * #2120.68 / #2120.70 — provenance par champ (confiance, coût). `null` sur
   * un siège sans coordonnée (`reachable: false`) : rien n'a été obtenu, donc
   * rien n'est mesuré — jamais une confiance basse ni un coût à 0 (GA-18/19).
   * `phone_confidence` n'existe pas ici : aucun signal fiable n'équivaut à
   * `email_status` pour un numéro, en démo comme en réel — non mesurée.
   */
  email_confidence: 'medium' | null
  email_cost_credits: number | null
  phone_cost_credits: number | null
  /** #4178.1 — nature SEEDÉE du numéro simulé ; absente = le seed écrit « inconnue ». */
  phone_nature?: 'professional_declared' | 'unknown'
  /** #2297.51 — voir {@link DensityRow.archivedEnrichmentDaysAgo}. */
  enrichment_archived_days_ago?: number
  enrichment_archive?: { email: string; phone: string }
  /** #2297.26 reste — voir {@link DensityRow.recentlyEnrichedNoResultDaysAgo}. */
  recently_enriched_no_result_days_ago?: number
  /** #4106.4 — voir {@link DensityRow.cascadeSecondSource}. */
  enrichment_cascade_sources?: 2
  /** #4107.4 — voir {@link DensityRow.smtpVerifiedEmail}. */
  email_verified?: true
}

/**
 * Transforme une ligne compacte en contact complet.
 *
 * `lifecycle_state` suit la coordonnée et non l'inverse : un contact joignable
 * est `actionnable`, un siège sans coordonnée reste `detecte`. C'est ce qui fait
 * que les compteurs « détectés / qualifiés / prêts à contacter » de l'écran
 * disent la vérité au lieu d'être trois façons de compter la même liste.
 */
function toContact(row: DensityRow, company: string): DensifiedContact {
  const domain = SIMULATED_DOMAIN[company] ?? 'exemple.example'
  const reachable = row.reachable
  return {
    full_name: row.name,
    photo_url: null,
    title: row.title,
    entity: row.entity,
    family: row.family,
    decision_role: CANONICAL_DECISION_ROLE[row.decisionRole],
    priority: row.priority,
    email: reachable ? simulatedEmail(row.name, domain) : null,
    phone:
      reachable && !row.emailOnly
        ? row.invalidPhone
          ? simulatedInvalidPhone(row.name)
          : simulatedPhone(row.name)
        : null,
    profile_summary: reachable
      ? `Interlocuteur simulé pour la démonstration : ${row.title.toLowerCase()} chez ${row.entity}. Sur un espace réel, ce bloc porte le parcours résolu par l’enrichissement.`
      : `Siège de décision détecté par l’analyse ; la personne qui l’occupe n’est pas encore nommée. Sur un espace réel, l’enrichissement résout l’identité et les coordonnées.`,
    why_contact: reachable
      ? `Porte le sujet et dispose du budget associé — c’est l’interlocuteur qui peut dire oui à un cadrage.`
      : `Poste identifié comme partie prenante ; à nommer avant toute prise de contact.`,
    // Pas de message pré-écrit sur un siège sans personne : le produit lui-même
    // refuse de rédiger tant que l'identité n'est pas vérifiée, et la
    // démonstration montre cette règle plutôt que de la contourner.
    email_message: reachable
      ? {
          subject: `${row.entity} — ${row.title.toLowerCase()} : un cadrage de 30 minutes ?`,
          body: `Bonjour ${row.name.split(/\s+/)[0]},\n\nJe suis le sujet ${row.family.toLowerCase()} chez ${row.entity} depuis quelques semaines. Deux points reviennent chez des acteurs comparables : la charge d’exploitation et le délai de mise en production.\n\nSi c’est aussi votre sujet, je vous propose 30 minutes pour confronter votre situation à ce qu’on a vu ailleurs — sans engagement, et avec un compte rendu écrit de votre côté.\n\nBonne journée,`,
        }
      : null,
    linkedin_message: reachable
      ? `Bonjour ${row.name.split(/\s+/)[0]}, je suis vos sujets ${row.family.toLowerCase()} chez ${row.entity}. J’ai deux retours concrets d’acteurs comparables qui pourraient vous être utiles — je vous les envoie si ça vous intéresse.`
      : null,
    contact_score: row.score,
    seniority: row.seniority,
    lifecycle_state: reachable ? 'actionnable' : 'detecte',
    key_points: reachable
      ? [
          `Décide sur le périmètre ${row.family.toLowerCase()} de ${row.entity}.`,
          `Coordonnées résolues — prêt à contacter.`,
        ]
      : [`Siège rattaché au périmètre ${row.family.toLowerCase()} de ${row.entity}.`],
    // #2120.68 / #2120.70 — même règle que l'e-mail/le téléphone juste
    // au-dessus : un champ NEUF (`reachable`) porte sa confiance et son coût,
    // un siège sans coordonnée n'en porte aucun. `medium` reflète honnêtement
    // ce que ces adresses SONT dans la fiction : trouvées, jamais vérifiées
    // (une adresse `.example` ne délivre par construction jamais — même
    // raison que `email_verified: false` ailleurs dans ce module) — jamais
    // `high`, jamais deviné.
    email_confidence: reachable ? 'medium' : null,
    email_cost_credits: reachable ? creditCostOf('contact_enrichment') : null,
    phone_cost_credits: reachable ? creditCostOf('contact_enrichment') : null,
    // #4178.1 — la salle MONTRE les deux natures sans jamais déduire « pro » d'un
    // format : une ligne que le fournisseur simulé type « travail » (déclarée),
    // les autres sans métadonnée (« nature non vérifiée »). Alternance stable
    // par nom ; un numéro invalide reste « inconnue ».
    ...(reachable && !row.emailOnly && !row.invalidPhone && row.name.length % 2 === 0
      ? { phone_nature: 'professional_declared' as const }
      : {}),
    // #2297.51 — l'état d'une fiche que la rétention a archivée : la valeur est
    // dans l'archive (que rien ne relit), la fiche dit la date du geste.
    ...(row.archivedEnrichmentDaysAgo !== undefined
      ? {
          profile_summary: `Interlocuteur simulé pour la démonstration : ${row.title.toLowerCase()} chez ${row.entity}, enrichi puis resté sans activité pendant trois ans. Ses coordonnées ont été archivées par la rétention RGPD ; un nouvel enrichissement les chercherait à nouveau.`,
          key_points: [
            `Coordonnées archivées : trois ans sans contact ni activité tracée.`,
            `Un nouvel enrichissement repartirait de zéro — rien n’est ressorti de l’archive.`,
          ],
          enrichment_archived_days_ago: row.archivedEnrichmentDaysAgo,
          enrichment_archive: { email: simulatedEmail(row.name, domain), phone: simulatedPhone(row.name) },
        }
      : {}),
    // #3970 — arrivée RÉCENTE chez le compte, datée relativement au seed.
    ...(row.recentHireDaysAgo !== undefined
      ? {
          apollo_enrichment: {
            employment_history: [
              {
                organization_name: row.entity,
                title: row.title,
                current: true,
                started_days_ago: row.recentHireDaysAgo,
              },
              // #4465.1 — trois postes dont UN en cours : la fiche dit la fonction du poste marqué « Actuel »,
              // jamais celle de l'ancien poste.
              {
                organization_name: 'Ancien employeur (fiction de démonstration)',
                title: 'Responsable de projets',
                current: false,
                started_days_ago: row.recentHireDaysAgo + 900,
                ended_days_ago: row.recentHireDaysAgo + 10,
              },
              {
                organization_name: 'Premier employeur (fiction de démonstration)',
                title: 'Consultant',
                current: false,
                started_days_ago: row.recentHireDaysAgo + 2500,
                ended_days_ago: row.recentHireDaysAgo + 920,
              },
            ],
          },
        }
      : {}),
    // #2296.23/.25/.26/.30/.33 — a quitté l'entreprise du dossier pour
    // l'employeur nommé : `historique` (même état qu'`employerMismatch` en
    // production) + l'employeur ACTUEL qu'Apollo « connaît », lu par
    // `detectedNewEmployer` (web) pour PROPOSER la recherche.
    ...(row.historicalNewEmployer !== undefined
      ? {
          lifecycle_state: 'historique',
          profile_summary: `Interlocuteur simulé pour la démonstration : ${row.title.toLowerCase()}, a quitté ${row.entity}. Apollo situe son poste actuel chez ${row.historicalNewEmployer}.`,
          why_contact: `Ne travaille plus chez ${row.entity} — cette fiche reste utile comme réseau dormant, historique du compte et source d’information, jamais comme cible active du compte.`,
          key_points: [
            `A quitté ${row.entity} — ne compte plus dans le classement actif.`,
            `Apollo situe son poste actuel chez ${row.historicalNewEmployer}.`,
          ],
          apollo_enrichment: {
            employment_history: [
              { organization_name: row.historicalNewEmployer, current: true, started_days_ago: 170 },
              // #4465.2 — le poste chez le compte porte sa date de fin, relative au semis : la fiche et la ligne disent « parti ».
              {
                organization_name: company,
                title: row.title,
                current: false,
                started_days_ago: 1400,
                ended_days_ago: 180,
              },
            ],
          },
          // #3716 (parité démo) — deux colonnes d'un fichier importé sans champ
          // d'accueil : le détail « Parcours et informations complémentaires »
          // s'ouvre en démonstration sur un contenu fictif, intitulés d'origine.
          extra: { 'Code interne': 'DEMO-4821', 'Origine du fichier': 'Annuaire partenaires (exemple)' },
        }
      : {}),
    // #3871 — la fiche ÉCARTÉE à dessein par le commercial : `rejete`, jamais
    // écrasée par une déclaration de départ, et la salle le MONTRE.
    ...(row.rejectedByUser
      ? {
          lifecycle_state: 'rejete',
          profile_summary: `Interlocuteur simulé pour la démonstration : ${row.title.toLowerCase()} chez ${row.entity}, écarté à dessein par le commercial (hors cible pour cette offre).`,
          why_contact: `Écarté explicitement : cette fiche reste au dossier pour mémoire, elle ne compte plus dans le classement actif et n’est jamais réactivée sans un geste du commercial.`,
          key_points: [`Écarté par le commercial — hors cible, conservé pour mémoire.`],
        }
      : {}),
    // #2297.26 reste — le délai de protection : un enrichissement a déjà été
    // tenté récemment, sans rien trouver de neuf. `demoContactRow`
    // (`demo-seed.service.ts`) lit ce champ pour écrire `last_enrichment_at` /
    // `last_enrichment_result` / `last_enrichment_missing`, et c'est cette
    // trace — pas ce docblock — que `bulkEnrichmentExclusionReason`
    // (`on_cooldown`) relit à l'écran.
    // #4106.4 / #4107.4 — cascade à deux sources ; e-mail deviné puis vérifié.
    ...(row.cascadeSecondSource ? { enrichment_cascade_sources: 2 as const } : {}),
    ...(row.smtpVerifiedEmail && reachable ? { email_verified: true as const } : {}),
    ...(row.recentlyEnrichedNoResultDaysAgo !== undefined
      ? {
          profile_summary: `Siège de décision détecté par l’analyse ; un enrichissement a déjà été tenté il y a peu, sans rien trouver de neuf. Sur un espace réel, un nouvel essai n’est proposé qu’après le délai de protection.`,
          key_points: [
            `Siège rattaché au périmètre ${row.family.toLowerCase()} de ${row.entity}.`,
            `Enrichissement tenté récemment, sans résultat — sous délai de protection.`,
          ],
          recently_enriched_no_result_days_ago: row.recentlyEnrichedNoResultDaysAgo,
        }
      : {}),
  }
}

/* ------------------------------------------------------------------ */
/* Les tables compactes, un bloc par compte                            */
/* ------------------------------------------------------------------ */

/**
 * Les fonctions ajoutées par compte.
 *
 * Elles sont écrites à la main plutôt que combinées mécaniquement : un dossier
 * où l'on croise dix prénoms avec dix intitulés se repère au premier coup d'œil
 * (« Directeur Data 1 », « Directeur Data 2 ») et décrédibilise tout le reste.
 */
const DENSITY: Readonly<Record<string, DensityRow[]>> = {
  'Société Générale': [
    {
      name: 'Camille Aubert',
      title: 'Directrice de la transformation digitale',
      entity: 'Société Générale',
      family: 'Direction générale',
      decisionRole: 'decideur',
      priority: 1,
      score: 88,
      seniority: 'director',
      reachable: true,
    },
    {
      name: 'Nicolas Ferrand',
      title: 'Directeur des systèmes d’information',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'decideur',
      priority: 1,
      score: 92,
      seniority: 'director',
      reachable: true,
      recentHireDaysAgo: 40,
      cascadeSecondSource: true,
    },
    {
      name: 'Sophie Marchand',
      title: 'Responsable architecture applicative',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 78,
      seniority: 'manager',
      reachable: true,
    },
    // #2297.51 — la fiche dont la rétention a archivé les coordonnées : la
    // démonstration montre qu'une coordonnée archivée se DIT, elle ne disparaît
    // pas en silence.
    {
      name: 'Hervé Lacombe',
      title: 'Responsable des applications de marchés',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 61,
      seniority: 'manager',
      reachable: false,
      archivedEnrichmentDaysAgo: 40,
    },
    {
      name: 'Julien Peltier',
      title: 'Responsable data et analytique',
      entity: 'Société Générale',
      family: 'Data',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 81,
      seniority: 'manager',
      reachable: true,
      recentHireDaysAgo: 75,
    },
    // #3890.2 (ADD-SANOFI-04, retour bêta Sanofi 08/10/2026) — « un bon
    // interlocuteur situé au-delà de la première page peut remonter » n'avait
    // aucun cas à recetter : le compte Sanofi réel n'a aucune personne DSI
    // au-delà des cinq premiers du classement (recette prod 08/10). Ce contact
    // SIMULÉ reproduit le cas de l'incident UNEO (#2533/#2547) qui a motivé le
    // correctif : accessible, lié à la DSI (achats informatiques), mais classé
    // en position 6 sur un compte aussi dense que Société Générale — hors de
    // la première page (5) mais dans le chemin rendu par `rankForAccount`
    // (10, `RECOMMENDED_PATH_MAX`) — vérifié par
    // `demo-dsi-beyond-top5-coverage.spec.ts`, qui fait tourner le classement
    // RÉEL sur ce jeu de données.
    {
      name: 'Chloé Weber',
      title: 'Chargée des achats informatique',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'acheteur',
      priority: 4,
      score: 33,
      seniority: 'employee',
      reachable: true,
    },
    // #2296.23/.25/.26/.30/.33 — la fiche `historique` de la démonstration :
    // a quitté Société Générale, reste utile (réseau dormant / historique /
    // source potentielle) et propose la recherche chez son nouvel employeur.
    {
      name: 'Karim Fassi',
      title: 'Ancien responsable infrastructure cloud',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 40,
      seniority: 'manager',
      reachable: true,
      historicalNewEmployer: 'Capgemini',
    },
    // #3871 — la fiche `rejete` de la démonstration (voir {@link DensityRow.rejectedByUser}).
    {
      name: 'Hélène Marchetti',
      title: 'Responsable support applicatif',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 35,
      seniority: 'manager',
      reachable: true,
      rejectedByUser: true,
    },
    {
      name: 'Anne-Laure Vidal',
      title: 'Responsable cybersécurité',
      entity: 'Société Générale',
      family: 'Sécurité',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 76,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Mehdi Benali',
      title: 'Responsable achats IT',
      entity: 'Société Générale',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 2,
      score: 70,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Claire Fontaine',
      title: 'Responsable programme paiements',
      entity: 'Société Générale',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 64,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Thomas Reynaud',
      title: 'Chef de projet infrastructure',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 61,
      seniority: 'individual',
      reachable: true,
    },
    {
      name: 'Léa Bonnet',
      title: 'Product owner banque de détail',
      entity: 'Société Générale',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 58,
      seniority: 'individual',
      reachable: true,
    },
    {
      name: 'Olivier Chartier',
      title: 'Responsable conformité SI',
      entity: 'Société Générale',
      family: 'Conformité',
      decisionRole: 'influenceur',
      priority: 3,
      score: 57,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Sarah Lemoine',
      title: 'Responsable delivery digital',
      entity: 'Boursorama',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 74,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Pierre Vasseur',
      title: 'Directeur technique',
      entity: 'Boursorama',
      family: 'DSI',
      decisionRole: 'decideur',
      priority: 1,
      score: 85,
      seniority: 'director',
      reachable: true,
    },
    {
      name: 'Hélène Roussel',
      title: 'Responsable pilotage des ressources externes',
      entity: 'Société Générale',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 2,
      score: 69,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Marc Delaunay',
      title: 'Responsable plateforme cloud',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 79,
      seniority: 'manager',
      reachable: true,
      recentHireDaysAgo: 120,
    },
    {
      name: 'Inès Charpentier',
      title: 'Responsable qualité de données',
      entity: 'Société Générale',
      family: 'Data',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 55,
      seniority: 'individual',
      reachable: false,
    },
    {
      name: 'Antoine Mercier',
      title: 'Architecte sécurité',
      entity: 'Société Générale',
      family: 'Sécurité',
      decisionRole: 'influenceur',
      priority: 3,
      score: 52,
      seniority: 'individual',
      reachable: false,
    },
    {
      name: 'Nadia Sellami',
      title: 'Responsable run applicatif',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 50,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Guillaume Perret',
      title: 'Responsable innovation',
      entity: 'Société Générale',
      family: 'Direction générale',
      decisionRole: 'influenceur',
      priority: 3,
      score: 48,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Émilie Gauthier',
      title: 'Responsable transformation RH',
      entity: 'Société Générale',
      family: 'RH',
      decisionRole: 'influenceur',
      priority: 4,
      score: 42,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Romain Lacroix',
      title: 'Responsable infrastructures réseaux',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 45,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Valérie Nguyen',
      title: 'Responsable des risques opérationnels',
      entity: 'Société Générale',
      family: 'Conformité',
      decisionRole: 'influenceur',
      priority: 4,
      score: 40,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Damien Rocher',
      title: 'Responsable poste de travail',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 38,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Fanny Delorme',
      title: 'Responsable pilotage budgétaire SI',
      entity: 'Société Générale',
      family: 'Achats',
      decisionRole: 'influenceur',
      priority: 4,
      score: 44,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Sébastien Morel',
      title: 'Responsable applications marchés',
      entity: 'Société Générale',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 41,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Aurélie Baptiste',
      title: 'Responsable expérience client digitale',
      entity: 'Boursorama',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 53,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Kevin Ostermann',
      title: 'Lead SRE',
      entity: 'Boursorama',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 46,
      seniority: 'individual',
      reachable: false,
    },
    {
      name: 'Laurence Fabre',
      title: 'Responsable achats prestations intellectuelles',
      entity: 'Société Générale',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 3,
      score: 59,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Xavier Dumont',
      title: 'Responsable programme réglementaire',
      entity: 'Société Générale',
      family: 'Conformité',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 54,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Corinne Blanchard',
      title: 'Responsable pilotage de la production',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 36,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Étienne Gaudin',
      title: 'Responsable postes de marché',
      entity: 'Société Générale',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 35,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Myriam Tessier',
      title: 'Responsable données clients',
      entity: 'Société Générale',
      family: 'Data',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 51,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Jean-Baptiste Rousset',
      title: 'Responsable sécurité opérationnelle',
      entity: 'Société Générale',
      family: 'Sécurité',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 39,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Alicia Ndiaye',
      title: 'Responsable conduite du changement',
      entity: 'Société Générale',
      family: 'RH',
      decisionRole: 'influenceur',
      priority: 4,
      score: 34,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Patrick Lemaitre',
      title: 'Responsable exploitation mainframe',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 37,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Sophie Kervella',
      title: 'Responsable référentiels',
      entity: 'Société Générale',
      family: 'Data',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 33,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Rachid Amara',
      title: 'Responsable API et intégration',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 53,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Delphine Cazal',
      title: 'Responsable projets réglementaires',
      entity: 'Société Générale',
      family: 'Conformité',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 36,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Bertrand Noiret',
      title: 'Responsable achats cloud',
      entity: 'Société Générale',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 3,
      score: 52,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Céline Astier',
      title: 'Responsable relation métiers SI',
      entity: 'Boursorama',
      family: 'DSI',
      decisionRole: 'influenceur',
      priority: 4,
      score: 38,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Malik Bouzid',
      title: 'Responsable sécurité applicative',
      entity: 'Boursorama',
      family: 'Sécurité',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 56,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Éric Vannier',
      title: 'Responsable socle technique',
      entity: 'Boursorama',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 40,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Sonia Reynaud',
      title: 'Responsable pilotage de la donnée',
      entity: 'Boursorama',
      family: 'Data',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 55,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Julien Marot',
      title: 'Responsable support et service desk',
      entity: 'Société Générale',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 32,
      seniority: 'manager',
      reachable: false,
    },
  ],

  SNCF: [
    // #2297.33/.39 (re-semé le 01/10/2026, retrait de quatre comptes) — la seule
    // personne SIMULÉE au numéro qui a perdu sa FORME : montre le statut
    // « invalid » (`ContactKeyInfo.tsx`) en salle de démo.
    {
      name: 'Farah Guillet',
      title: 'Responsable expérience voyageur',
      entity: 'SNCF Voyageurs',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 60,
      seniority: 'manager',
      reachable: true,
      invalidPhone: true,
      // #4107.4 (recette D3 01/11) — l'e-mail deviné puis vérifié SMTP se voit sur une fiche SNCF (le compte que la
      // recette ouvre), plus chez Société Générale : toujours UN seul contact (garde `demo-contacts-badge-coverage`).
      smtpVerifiedEmail: true,
    },
    // #3698 — l'état « e-mail trouvé, pas de téléphone » en salle de démo.
    {
      name: 'Salomé Vidal',
      title: 'Responsable des achats informatiques',
      entity: 'SNCF Voyageurs',
      family: 'Achat',
      decisionRole: 'acheteur',
      priority: 3,
      score: 38,
      seniority: 'manager',
      reachable: true,
      emailOnly: true,
    },
    // #2297.26 reste (re-semé le 01/10/2026, retrait de quatre comptes) — le seul
    // contact de démonstration sous délai de protection : montre la ligne
    // « récemment enrichis » de l'aperçu de lot (`EnrichConfirmDialog.tsx`,
    // `on_cooldown`). Siège (`reachable: false`) : c'est parce que rien n'a été
    // trouvé que le délai existe.
    {
      name: 'Hugo Delannoy',
      title: 'Responsable support exploitation',
      entity: 'SNCF Voyageurs',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 42,
      seniority: 'manager',
      reachable: false,
      recentlyEnrichedNoResultDaysAgo: 5,
    },
    // #2297.18 (27/09/2026, re-semé le 01/10/2026) — L'HOMONYME DU JEU.
    //
    // UN seul contact suffit : l'ambiguïté vient, en réel, du FOURNISSEUR (il
    // rend plusieurs personnes pour un même nom dans la même société), jamais
    // de deux lignes en base — l'index unique
    // `idx_contacts_account_normalized_name` interdit deux contacts actifs au
    // même nom normalisé dans un compte. Cliquer « Enrichir » sur celui-ci
    // simule cet événement fournisseur (`isDemoAmbiguousProviderMatch`,
    // `demo-enrichment.ts`) : `last_enrichment_result: 'ambiguous'`, zéro
    // coordonnée écrite, zéro crédit débité.
    {
      name: 'Mathis Fontenelle',
      title: 'Responsable support technique',
      entity: 'SNCF Voyageurs',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 35,
      seniority: 'individual',
      reachable: false,
    },
    {
      name: 'Philippe Marchand',
      title: 'Directeur des systèmes d’information',
      entity: 'SNCF Voyageurs',
      family: 'DSI',
      decisionRole: 'decideur',
      priority: 1,
      score: 92,
      seniority: 'director',
      reachable: true,
      recentHireDaysAgo: 25,
    },
    {
      name: 'Isabelle Rouault',
      title: 'Directrice de la transformation numérique',
      entity: 'SNCF',
      family: 'Direction générale',
      decisionRole: 'decideur',
      priority: 1,
      score: 88,
      seniority: 'director',
      reachable: true,
    },
    {
      name: 'Karim Belhadj',
      title: 'Responsable cybersécurité industrielle',
      entity: 'SNCF Réseau',
      family: 'Sécurité',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 81,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Céline Lombard',
      title: 'Responsable données et supervision',
      entity: 'SNCF Réseau',
      family: 'Data',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 78,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Grégory Pinault',
      title: 'Responsable achats prestations informatiques',
      entity: 'SNCF',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 2,
      score: 72,
      seniority: 'manager',
      reachable: true,
      recentHireDaysAgo: 150,
    },
    {
      name: 'Amélie Costa',
      title: 'Responsable applications voyageurs',
      entity: 'SNCF Voyageurs',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 64,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Ludovic Serres',
      title: 'Responsable infrastructure et hébergement',
      entity: 'SNCF',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 76,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Farida Benkirane',
      title: 'Responsable programme signalisation',
      entity: 'SNCF Réseau',
      family: 'Métier',
      decisionRole: 'decideur',
      priority: 1,
      score: 83,
      seniority: 'director',
      reachable: true,
    },
    {
      name: 'Sylvain Coste',
      title: 'Responsable architecture d’entreprise',
      entity: 'SNCF',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 79,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Marion Teixeira',
      title: 'Responsable conformité et sûreté',
      entity: 'SNCF',
      family: 'Conformité',
      decisionRole: 'influenceur',
      priority: 3,
      score: 58,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Antoine Vaillant',
      title: 'Responsable maintenance prédictive',
      entity: 'SNCF Réseau',
      family: 'Data',
      decisionRole: 'prescripteur',
      priority: 2,
      score: 75,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Hélène Fabre',
      title: 'Responsable pilotage des marchés publics IT',
      entity: 'SNCF',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 2,
      score: 71,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Nicolas Barrault',
      title: 'Responsable exploitation applicative',
      entity: 'SNCF Voyageurs',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 3,
      score: 60,
      seniority: 'manager',
      reachable: true,
    },
    {
      name: 'Jeanne Cotte',
      title: 'Responsable expérience client digitale',
      entity: 'SNCF Voyageurs',
      family: 'Métier',
      decisionRole: 'influenceur',
      priority: 3,
      score: 57,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Olivier Mazet',
      title: 'Responsable réseaux et télécoms',
      entity: 'SNCF Réseau',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 45,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Sandrine Vidal',
      title: 'Responsable recrutement et compétences numériques',
      entity: 'SNCF',
      family: 'RH',
      decisionRole: 'influenceur',
      priority: 4,
      score: 41,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Édouard Prat',
      title: 'Architecte systèmes embarqués',
      entity: 'SNCF Voyageurs',
      family: 'Ingénierie',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 56,
      seniority: 'individual',
      reachable: false,
    },
    {
      name: 'Leïla Boukhari',
      title: 'Responsable qualité de données',
      entity: 'SNCF',
      family: 'Data',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 44,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Jérôme Lantier',
      title: 'Responsable poste de travail',
      entity: 'SNCF',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 39,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Christelle Nadaud',
      title: 'Responsable gouvernance des projets',
      entity: 'SNCF',
      family: 'Métier',
      decisionRole: 'influenceur',
      priority: 4,
      score: 42,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Paul Rivalin',
      title: 'Responsable observabilité et supervision',
      entity: 'SNCF Réseau',
      family: 'DSI',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 55,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Nadège Fontan',
      title: 'Responsable contrats et fournisseurs',
      entity: 'SNCF',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 3,
      score: 59,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Mickaël Perrier',
      title: 'Responsable tests et homologation',
      entity: 'SNCF Voyageurs',
      family: 'Ingénierie',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 40,
      seniority: 'individual',
      reachable: false,
    },
    {
      name: 'Aurore Delmas',
      title: 'Responsable innovation mobilité',
      entity: 'SNCF',
      family: 'Direction générale',
      decisionRole: 'influenceur',
      priority: 4,
      score: 43,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Stéphane Riou',
      title: 'Responsable sécurité des accès',
      entity: 'SNCF',
      family: 'Sécurité',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 54,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Virginie Alric',
      title: 'Responsable pilotage budgétaire',
      entity: 'SNCF',
      family: 'Achats',
      decisionRole: 'influenceur',
      priority: 4,
      score: 38,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Bruno Delattre',
      title: 'Responsable production informatique',
      entity: 'SNCF',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 37,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Sandra Piquet',
      title: 'Responsable référentiels horaires',
      entity: 'SNCF Voyageurs',
      family: 'Data',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 36,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Franck Morin',
      title: 'Responsable systèmes de billettique',
      entity: 'SNCF Voyageurs',
      family: 'Métier',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 58,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Nadia Cherfaoui',
      title: 'Responsable sécurité des systèmes industriels',
      entity: 'SNCF Réseau',
      family: 'Sécurité',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 57,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Laurent Beaufils',
      title: 'Responsable télécoms ferroviaires',
      entity: 'SNCF Réseau',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 38,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Émilie Vasseur',
      title: 'Responsable données de circulation',
      entity: 'SNCF Réseau',
      family: 'Data',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 56,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Pascal Nourrit',
      title: 'Responsable ateliers de maintenance',
      entity: 'SNCF Voyageurs',
      family: 'Métier',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 35,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Clara Bonnet',
      title: 'Responsable transformation des achats',
      entity: 'SNCF',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 3,
      score: 55,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Yves Chapuis',
      title: 'Responsable systèmes embarqués',
      entity: 'SNCF Voyageurs',
      family: 'Ingénierie',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 54,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Aïcha Benali',
      title: 'Responsable accessibilité numérique',
      entity: 'SNCF Voyageurs',
      family: 'Métier',
      decisionRole: 'influenceur',
      priority: 4,
      score: 32,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Didier Lorrain',
      title: 'Responsable poste de commande centralisé',
      entity: 'SNCF Réseau',
      family: 'Métier',
      decisionRole: 'decideur',
      priority: 2,
      score: 67,
      seniority: 'director',
      reachable: false,
    },
    {
      name: 'Sabine Rouault',
      title: 'Responsable pilotage de la donnée',
      entity: 'SNCF',
      family: 'Data',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 53,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Marc Espinasse',
      title: 'Responsable cybersécurité voyageurs',
      entity: 'SNCF Voyageurs',
      family: 'Sécurité',
      decisionRole: 'prescripteur',
      priority: 3,
      score: 52,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Julie Tanguy',
      title: 'Responsable relation fournisseurs IT',
      entity: 'SNCF',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 4,
      score: 34,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Hervé Lalanne',
      title: 'Responsable infrastructures de données',
      entity: 'SNCF',
      family: 'DSI',
      decisionRole: 'utilisateur',
      priority: 4,
      score: 39,
      seniority: 'manager',
      reachable: false,
    },
    {
      name: 'Nawel Saïdi',
      title: 'Responsable formation aux outils numériques',
      entity: 'SNCF',
      family: 'RH',
      decisionRole: 'influenceur',
      priority: 4,
      score: 31,
      seniority: 'manager',
      reachable: false,
    },
  ],
  // #4678-#4680 — Kiabi est le compte VERSÉ PAR UN FICHIER (`importedOrigin`) : ces deux personnes SIMULÉES sont
  // des contacts de provenance connue (`DEMO_IMPORTED_CONTACT_NAMES` → `contacts.source = 'import'`), pour que le
  // bloc « Connu », « Connus de l'équipe » et le « doublon probable » aient de quoi s'afficher. Le premier est un
  // DSI : même niveau (L2) et même famille (IT) que le DSI DÉDUIT du graphe (« Christophe Alie ») — le cas réel
  // d'un CISO connu en face d'un « Référent technique, déduit ». Le second est un acheteur : canal parallèle (L5),
  // donc épinglé en haut, hors de l'arbre. Aucune fusion n'est semée : on propose, l'humain tranche.
  Kiabi: [
    {
      name: 'Sofiane Marchetti',
      title: 'Directeur des systèmes d’information',
      entity: 'Kiabi',
      family: 'IT',
      decisionRole: 'decideur',
      priority: 1,
      score: 72,
      seniority: 'director',
      reachable: true,
    },
    {
      name: 'Hugo Lenormand',
      title: 'Responsable achats informatiques',
      entity: 'Kiabi',
      family: 'Achats',
      decisionRole: 'acheteur',
      priority: 3,
      score: 48,
      seniority: 'manager',
      reachable: true,
    },
  ],
}

/** Les contacts ajoutés à un dossier, ou `[]` si le compte n'est pas densifié. */
export function densifiedContactsFor(companyName: string): DensifiedContact[] {
  return (DENSITY[companyName] ?? []).map(row => toContact(row, companyName))
}

/** Les noms de compte densifiés — lus par les tests de couverture. */
export const DENSIFIED_COMPANIES = Object.keys(DENSITY)
