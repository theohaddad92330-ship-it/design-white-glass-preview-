import { z } from 'zod'

/**
 * Le vivier de consultants DÉCLARÉ à l'onboarding — lot #2046.
 *
 * Le questionnaire ne demandait rien de ce que l'ESN a DÉJÀ : ni la taille de
 * son vivier, ni sa fraîcheur, ni son état d'avancement. Sans ça l'audit parle
 * dans le vide — il peut dire ce qui MANQUE, jamais ce qui est EXPLOITABLE.
 *
 * ⚠️ Ce bloc est un SNAPSHOT AGRÉGÉ déclaré par l'ESN au questionnaire, distinct
 * de la table `consultants` (le vivier RÉEL, fiche par fiche, `ConsultantEntity`)
 * qui porte déjà `mobility_zones`, `consent_given_at`, `availability_checked_at`
 * pour CHAQUE profil. Les deux ne se substituent pas : une ESN qui commence son
 * onboarding n'a pas encore saisi cinquante fiches, et l'audit a besoin d'un
 * ordre de grandeur avant que la table `consultants` existe pour elle.
 *
 * Toutes les colonnes sont des BANDES DE VALEUR, jamais un nombre exact — la
 * règle que ce registre applique partout : personne ne connaît son chiffre
 * exact, et un champ qui exige l'exactitude se remplit au hasard.
 *
 * `.nullable().optional()` comme le reste du profil progressif : une clé
 * ABSENTE d'un ancien payload reste assignable à `EsnAnswers`, une question
 * jamais posée ne devient jamais une valeur devinée (« non mesuré n'est
 * jamais 0 »).
 */
export const VIVIER_COUNT_BAND_CHOICES = ['0', '1-5', '6-15', '16-30', '31-80', '81-200', '200+'] as const

/**
 * #2046.11 → .14 — quatre états au CONTRAT, pas quatre libellés d'écran :
 * définis UNE fois ici, réutilisés par les quatre questions du questionnaire
 * (`vivier-etats.ts`) pour que leur libellé ne diverge jamais entre le
 * contrat et l'écran.
 *
 * ⚠️ #2046.14 — un CV n'est pas une candidature prête. Les confondre, c'est
 * promettre au client un consultant qu'on n'a pas : « intéressé » dit qu'une
 * personne a un CV et une disponibilité déclarée quelque part, jamais qu'elle
 * a accepté une mission ; « présentable » seul dit que le dossier peut partir
 * chez un client aujourd'hui.
 */
export const TALENT_POOL_STATES = [
  {
    key: 'interested',
    labelFr: 'Intéressé',
    descriptionFr: 'A un CV et une disponibilité déclarée quelque part — pas encore qualifié.',
  },
  { key: 'available', labelFr: 'Disponible', descriptionFr: 'Qualifié ET disponible immédiatement ou à court terme.' },
  {
    key: 'secured',
    labelFr: 'Sécurisé',
    descriptionFr: "A confirmé par écrit son engagement — l'accord de principe est posé.",
  },
  {
    key: 'presentable',
    labelFr: 'Présentable',
    descriptionFr:
      "Le dossier est prêt : réécrit, vérifié, envoyable à un client sans retouche. Un CV n'est pas une candidature prête.",
  },
] as const

export const VIVIER_ANSWER_FIELDS = {
  // #2046.1 — funnel : combien de profils sont IDENTIFIÉS (CV reçu, contact
  // établi), avant toute qualification.
  talent_pool_identified_band: z.string().nullable().optional(),
  // #2046.2 — combien, parmi eux, sont QUALIFIÉS (dossier vérifié, prêt à être
  // évalué pour une mission).
  talent_pool_qualified_band: z.string().nullable().optional(),
  // #2046.3 — combien sont DISPONIBLES maintenant. Distinct d'`available_consultants_band`
  // (bande QUALITATIVE d'impression globale d'intercontrat, lue par
  // `sales_context.py::_bench_band`) : celui-ci est le troisième barreau d'un
  // funnel CHIFFRÉ à trois étages, pas une impression.
  talent_pool_available_band: z.string().nullable().optional(),
  // #2046.4 — la disponibilité déclarée est-elle FRAÎCHE ? Porte la primitive
  // `Provenance` (source + date) en bande de RÉCENCE plutôt qu'une date exacte
  // (même raison que le reste du bloc : personne ne sait la date au jour près).
  // Source = déclaration de l'ESN au questionnaire ; date = cette bande.
  talent_pool_availability_recency_band: z.string().nullable().optional(),
  // #2046.5 — le TJM du VIVIER, jamais celui du questionnaire de vente
  // (`avg_tjm`, Temps 2) qui est le TJM VENDU. Deux champs distincts : le
  // premier dit combien coûte le consultant, le second combien il rapporte.
  talent_pool_avg_tjm_band: z.string().nullable().optional(),
  // #2046.6 — mobilité DÉCLARÉE en agrégat (l'onboarding ne pose pas encore
  // les 50 fiches de `consultants.mobility_zones`).
  talent_pool_mobility_band: z.string().nullable().optional(),
  // #2046.7 — RGPD : donnée de PERSONNE agrégée, jamais un critère qui classe
  // qui que ce soit (c58, GA-06) — cette colonne ne compte QUE combien de
  // profils ont un consentement, elle n'entre dans AUCUN prompt qui note une
  // personne. Archivage : `esn_profiles` est versionné (nouvelle ligne à
  // chaque sauvegarde, l'ancienne bascule `is_current = false`) — une
  // correction ne supprime jamais l'ancienne déclaration, elle en pose une
  // nouvelle avec sa propre date, exactement la règle « on archive, on ne
  // supprime pas ».
  talent_pool_consent_status: z.enum(['tous', 'partiel', 'aucun', 'ne_sait_pas']).nullable().optional().catch(null),
  // #2046.8 — combien de profils identifiés sont AUSSI en process ailleurs
  // (chez un concurrent, une autre ESN) — dit si le vivier va se dégrader vite.
  talent_pool_other_processes_band: z.string().nullable().optional(),
  // #2046.9 — l'engagement RÉEL : combien seraient VRAIMENT engageables
  // aujourd'hui, au-delà du déclaratif d'intérêt.
  talent_pool_engagement_reality_band: z.string().nullable().optional(),
  // #2046.10 — à quelle fréquence l'ESN revalide ces déclarations. Se lit à
  // côté de `AVAILABILITY_REVALIDATION_DAYS` (`consultants/matching/pushable.ts`),
  // le seuil déjà tenu par la routine `TalentRoutinesService.availabilityToReconfirm` —
  // même vocabulaire, pour que le produit ne dise pas deux choses différentes
  // de la fraîcheur d'une disponibilité.
  talent_pool_revalidation_frequency: z
    .enum(['hebdomadaire', 'mensuelle', 'trimestrielle', 'jamais'])
    .nullable()
    .optional()
    .catch(null),
  // #2046.11 → .14 — les quatre états de `TALENT_POOL_STATES`, un funnel
  // CHIFFRÉ distinct des trois premières bandes : celles-ci comptent large
  // (identifié/qualifié/disponible), celles-là comptent la PROGRESSION précise
  // vers un dossier envoyable — voir le commentaire de `TALENT_POOL_STATES`.
  talent_pool_state_interested_band: z.string().nullable().optional(),
  talent_pool_state_available_band: z.string().nullable().optional(),
  talent_pool_state_secured_band: z.string().nullable().optional(),
  // #2046.14 — un CV n'est pas une candidature prête.
  talent_pool_state_presentable_band: z.string().nullable().optional(),
}
