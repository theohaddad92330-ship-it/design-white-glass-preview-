import { z } from 'zod'

/**
 * La bibliothèque de contenu approuvé — emails, scripts d'appel, réponses aux
 * objections, pitchs (#3441, #3442, #3444, #3445, lot C20 du 30/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FERME, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Louis a demandé, dans quatre retours bêta successifs, d'importer des
 * gabarits d'email, des scripts téléphoniques, des réponses aux objections et
 * des pitchs QU'IL A ÉCRITS — « ils ne doivent pas être recréés librement »
 * pour les emails, une règle d'usage équivalente pour chaque autre catégorie.
 *
 * Ce n'est PAS le même geste que `method-delta.ts` (`METHOD_REFUSALS` y
 * refuse justement « des gabarits de message recopiés mot pour mot » comme
 * RÈGLE DE MÉTHODE universelle — un exemple externe élevé au rang
 * d'instruction que le modèle suivrait toujours). Ici, le texte est un
 * CONTENU consultable et citable tel quel, à la demande, jamais une
 * instruction de comportement : Laura le retrouve par `searchContentLibrary`
 * quand la conversation le justifie, vérifie les conditions attachées à
 * CETTE entrée avant de le citer, et le complète — jamais l'inverse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI EN CODE, PAS EN BASE
 * ─────────────────────────────────────────────────────────────────────────
 * Même arbitrage que `method-corpus.ts` / `objection_library.json` côté
 * Python : ce contenu est une DISCIPLINE éditoriale versionnée par le
 * dépôt, pas un fait par compte — il ne porte ni `workspace_id` ni
 * `user_id`, donc hors du périmètre RGPD/démo qui gouverne les tables
 * (`demo-coverage.ts`). Un réglage vit à un seul endroit (GA-26) : CE
 * fichier, mirroré verbatim côté Python par
 * `apps/ia/app/knowledge/content_library.py` (le service IA ne peut pas
 * importer `packages/contracts` à l'exécution — même frontière que
 * `method-delta.ts` — donc une copie, gardée par
 * `content-library.parity.test.ts`, jamais un import).
 */

export const CONTENT_LIBRARY_KINDS = ['email_template', 'call_script', 'objection_response', 'pitch'] as const
export const contentLibraryKindSchema = z.enum(CONTENT_LIBRARY_KINDS)
export type ContentLibraryKind = z.infer<typeof contentLibraryKindSchema>

export const contentLibraryEntrySchema = z.object({
  id: z.string().min(1),
  kind: contentLibraryKindSchema,
  title: z.string().min(1),
  /** L'issue bêta d'origine (ex. `#3441`) — jamais affichée au commercial, sert la traçabilité. */
  sourceIssue: z.string().min(1),
  /** Le libellé du modèle/variante/exemple tel que Louis l'a nommé dans son retour. */
  sourceLabel: z.string().min(1),
  /** Objet d'email — présent seulement pour `email_template`. */
  subject: z.string().min(1).optional(),
  /** Le texte VERBATIM, `{{placeholder}}` compris — jamais paraphrasé. */
  body: z.string().min(1),
  /** Les conditions d'usage écrites par Louis pour CETTE entrée — Laura les vérifie avant de citer le texte. */
  conditions: z.array(z.string().min(1)).readonly(),
})
export type ContentLibraryEntry = z.infer<typeof contentLibraryEntrySchema>

/**
 * Les 26 entrées importées, VERBATIM, depuis #3441 (3 emails), #3442
 * (2 scripts d'appel), #3444 (15 objections approuvées) et #3445 (1 structure
 * canonique + 5 pitchs d'exemple). Ordre : celui des quatre retours bêta.
 */
export const CONTENT_LIBRARY_ENTRIES: readonly ContentLibraryEntry[] = [
  {
    id: 'email-approche-initiale',
    kind: 'email_template',
    title: "Email d'approche initiale",
    sourceIssue: '#3441',
    sourceLabel: "Modèle 1 — email d'approche initiale",
    subject: 'Renfort {{Métier}} pour {{Projet ou challenge identifié}}',
    body: "Bonjour {{Prénom}},\n\nJe travaille actuellement avec plusieurs profils {{métier}} immédiatement disponibles, avec {{X}} années d'expérience sur {{technologie ou projet}}.\n\nSuite à ma veille sur votre entreprise, j'ai identifié que vous pourriez avoir des besoins sur ce périmètre.\n\nPuis-je vous partager rapidement un ou deux profils qui pourraient correspondre à vos enjeux actuels ?\n\n{{Signature}}",
    conditions: [
      'le projet ou challenge est vérifié',
      'les profils existent réellement',
      'leur disponibilité est fraîche',
      "les années d'expérience sont vraies",
      '8 à 10 lignes maximum pour le modèle structuré',
      'aucune fausse félicitation',
      'aucune actualité inventée',
      'aucune disponibilité inventée',
      'aucun profil fictif',
      'une seule demande',
      'objet précis',
      'pas de plaquette ou PDF dès le premier message sauf demande explicite',
      'si le contexte est insuffisant, le brouillon reste à compléter',
    ],
  },
  {
    id: 'email-suivi-apres-appel',
    kind: 'email_template',
    title: 'Email de suivi après appel',
    sourceIssue: '#3441',
    sourceLabel: 'Modèle 2 — email de suivi après appel',
    subject: 'Suite à notre échange — Profils {{Métier}}',
    body: 'Bonjour {{Prénom}},\n\nMerci pour notre échange de {{jour}}.\n\nComme promis, je vous transmets les profils des consultants que nous avons évoqués pour votre projet {{nom}}.\n\nLeur disponibilité est confirmée pour {{date}} et ils sont particulièrement intéressés par votre contexte.\n\nQuelles seraient vos disponibilités pour organiser un entretien cette semaine ?\n\n{{Signature}}',
    conditions: [
      'le projet ou challenge est vérifié',
      'les profils existent réellement',
      'leur disponibilité est fraîche',
      "les années d'expérience sont vraies",
      'aucune fausse félicitation',
      'aucune actualité inventée',
      'aucune disponibilité inventée',
      'aucun profil fictif',
      'une seule demande',
      'objet précis',
      'pas de plaquette ou PDF dès le premier message sauf demande explicite',
      'si le contexte est insuffisant, le brouillon reste à compléter',
    ],
  },
  {
    id: 'email-structure-personnalisee',
    kind: 'email_template',
    title: 'Email à structure personnalisée',
    sourceIssue: '#3441',
    sourceLabel: 'Modèle 3 — structure personnalisée',
    subject: '{{Prénom}}, une idée pour renforcer votre équipe {{domaine}}',
    body: "Bonjour {{Prénom}},\n\n{{Élément récent et vérifié sur l'entreprise ou le contact}}.\n\nNous aidons {{type d'entreprise comparable}} à {{résultat}} grâce à {{approche}}.\n\n{{Preuve vérifiée ou profil réel}}.\n\nSeriez-vous disponible pour un échange de 15 minutes {{créneau précis}} afin de voir si cet angle peut être pertinent pour votre équipe ?\n\n{{Signature}}",
    conditions: [
      'le projet ou challenge est vérifié',
      'les profils existent réellement',
      'leur disponibilité est fraîche',
      "les années d'expérience sont vraies",
      '8 à 10 lignes maximum pour le modèle structuré',
      'aucune fausse félicitation',
      'aucune actualité inventée',
      'aucune disponibilité inventée',
      'aucun profil fictif',
      'une seule demande',
      'objet précis',
      'pas de plaquette ou PDF dès le premier message sauf demande explicite',
      'si le contexte est insuffisant, le brouillon reste à compléter',
    ],
  },
  {
    id: 'script-appel-variante-a-contexte-partenaire',
    kind: 'call_script',
    title: "Script d'appel — variante avec contexte partenaire",
    sourceIssue: '#3442',
    sourceLabel: 'Variante A — avec contexte partenaire',
    body: "1. OUVERTURE\n\nBonjour {{Nom}}, c'est {{Prénom}} de {{Société}}.\n\nOn intervient déjà dans votre écosystème via {{Partenaire}}.\n\nEst-ce que je peux vous prendre 30 secondes pour vous expliquer ma démarche ?\n\nNous sommes {{référencés}}. Ma démarche n'est pas commerciale.\n\n2. CONTEXTE ET POSITIONNEMENT\n\nJe connais bien les sujets {{Domaine}} chez {{Compte ou groupe}}.\n\nNotamment {{Thème 1}}, {{Thème 2}} et les sujets {{Métier}} avec les équipes IT ou Data.\n\nOn évolue sur des sujets similaires avec des profils vraiment experts.\n\n3. QUESTIONS D'ENGAGEMENT\n\nVous avez déjà fixé votre roadmap sur les prochains mois ?\n\nDes projets qui demandent du renfort ou des profils à double compétence ?\n\nJe viens sur site le {{Jour}}. Un café serait l'idéal.\n\nUn besoin ouvert ou récurrent sur lequel me challenger ?\n\nPertinent que je me présente à votre manager ? C'est qui d'ailleurs ?\n\n4. CLÔTURE\n\nJe vous propose un créneau de principe pour {{Période}}.\n\nSouhaitez-vous que je partage les missions en cours par mail ?",
    conditions: [
      'le partenaire est réel',
      'son nom peut être cité',
      'le référencement est réel',
      'le périmètre est confirmé',
      "la relation n'interdit pas la prise de contact",
      'aucune mission similaire ne peut être citée sans preuve',
      'aucun référencement ne peut être suggéré',
      'aucun partenaire ne peut être inventé',
      "si l'utilisateur n'a aucune preuve, le script doit rester prudent",
      'chaque appel doit se terminer par une prochaine action concrète ou une sortie claire',
    ],
  },
  {
    id: 'script-appel-variante-b-pure-chasse',
    kind: 'call_script',
    title: "Script d'appel — variante pure chasse, sans contexte",
    sourceIssue: '#3442',
    sourceLabel: 'Variante B — pure chasse, sans contexte',
    body: "1. PRÉSENTATION ET ACCROCHE\n\nJe suis {{Prénom}} de {{Société}}.\n\nJ'imagine que je suis loin d'être le seul à vous solliciter.\n\n30 secondes pour vous expliquer le but de mon appel ?\n\n2. ARGUMENT D'AUTORITÉ\n\nJe vois les mêmes enjeux dans votre secteur : délais, contraintes, accélération.\n\nOn a mené des missions similaires dans des environnements comparables {{Secteur}}.\n\nL'objectif est juste de comprendre votre cadre, pas de vous vendre quelque chose.\n\n3. RETIRER LA VENTE\n\nL'idée n'est pas de savoir si vous achetez des prestations.\n\nC'est de comprendre vos sujets et comment vous sécurisez un renfort quand ça devient prioritaire.\n\n4. CADRE ACHAT ET ENGAGEMENT\n\nSi on doit travailler ensemble, c'est direct ou via achats, panel ou partenaires ?\n\nSur {{Année}}, vous avez une visibilité sur votre roadmap ? Des partenaires installés ?\n\n5. PROCHAINE ÉTAPE\n\nDonnez-moi un sujet récurrent ou un besoin type.\n\nJe vous envoie deux ou trois profils ciblés pour montrer le niveau, sans engagement.\n\nSi c'est hors sujet, on s'arrête.\n\nSinon : qui est le bon point d'entrée ?",
    conditions: [
      'aucune mission similaire ne peut être citée sans preuve',
      'aucun référencement ne peut être suggéré',
      'aucun partenaire ne peut être inventé',
      "si l'utilisateur n'a aucune preuve, le script doit rester prudent",
      'chaque appel doit se terminer par une prochaine action concrète ou une sortie claire',
    ],
  },
  {
    id: 'objection-pas-decideur',
    kind: 'objection_response',
    title: 'Je ne suis pas décideur.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: 'Je peux me permettre de vous demander qui gère ces sujets ? Mon objectif est de comprendre votre contexte, pas de vous vendre des profils.',
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-numero',
    kind: 'objection_response',
    title: 'Où avez-vous trouvé mon numéro ?',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Je veux être transparent sur la provenance. Le numéro vient de {{source réelle}}. Si vous le souhaitez, je vous explique comment demander son retrait. Avant de vous laisser, est-ce que vous m'accordez 30 secondes pour vous expliquer la raison de mon appel ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
      'la source citée doit être réelle',
    ],
  },
  {
    id: 'objection-referencement',
    kind: 'objection_response',
    title: 'Êtes-vous référencés ?',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: 'SI RÉFÉRENCEMENT PROUVÉ : Oui, nous sommes référencés sur {{périmètre}} depuis {{date ou contexte}}.\n\nSI NON RÉFÉRENCÉ : Non, pas sur ce périmètre à ma connaissance. Je préfère être clair. Mon objectif est justement de comprendre si une route directe, partenaire ou achat peut être pertinente.',
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
      "la branche « référencement prouvé » n'est utilisée que si le référencement est réel",
    ],
  },
  {
    id: 'objection-envoyez-moi-un-mail',
    kind: 'objection_response',
    title: 'Envoyez-moi un mail.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: 'Bien sûr. Pour éviter de vous envoyer une plaquette générique : quel est le sujet sur lequel vous avez le plus de difficulté à staffer ou à sécuriser ? Je vous envoie quelque chose qui répond à ce point précis.',
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-aucun-besoin',
    kind: 'objection_response',
    title: "On n'a aucun besoin.",
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: 'Uniquement sur cette période, ou le recours externe est limité de façon générale sur votre périmètre ?',
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-pas-de-consultants',
    kind: 'objection_response',
    title: 'On ne travaille pas avec des consultants.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "C'est une règle groupe ou une règle propre à votre périmètre ? Quelles sont les raisons principales ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-deja-des-partenaires',
    kind: 'objection_response',
    title: 'On a déjà des partenaires.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Très bien. Qu'est-ce qui fonctionne le mieux avec eux aujourd'hui, et qu'est-ce qui pourrait encore être amélioré ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-regles-achats',
    kind: 'objection_response',
    title: 'Il y a des règles achats.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Mon objectif n'est pas d'outrepasser le cadre. Est-ce que des retours d'expérience ou un cas comparable seraient plus utiles qu'une présentation commerciale ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-pas-le-temps',
    kind: 'objection_response',
    title: "Je n'ai pas le temps.",
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Je comprends. Deux minutes seulement : quel est aujourd'hui le sujet qui vous fait perdre le plus de temps sur votre périmètre ? Si je suis hors sujet, on s'arrête là.",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-gestion-interne',
    kind: 'objection_response',
    title: 'Nous gérons en interne.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "C'est une bonne chose. Vos clients ou équipes utilisent-ils parfois des renforts sur les compétences rares ou les pics d'activité, ou jamais ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-question-budget',
    kind: 'objection_response',
    title: "C'est une question de budget.",
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Qu'est-ce qui vous fait penser que notre approche serait hors budget : le TJM, la durée, ou le modèle de collaboration ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-autres-priorites',
    kind: 'objection_response',
    title: "Nous avons d'autres priorités.",
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Est-ce que le sujet que je vous présente pourrait accélérer l'une de ces priorités, ou il est complètement déconnecté de vos enjeux actuels ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-rappelez-plus-tard',
    kind: 'objection_response',
    title: 'Rappelez-moi plus tard.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: 'Avec plaisir. À quelle date précise le sujet aura plus de sens ? Je préfère noter une vraie échéance plutôt que vous relancer au hasard.',
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-mauvaises-experiences',
    kind: 'objection_response',
    title: 'On a eu de mauvaises expériences.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Qu'est-ce qui vous a le plus déçu : la qualité du profil, le suivi, la transparence ou le cadre commercial ?",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'objection-tjm-trop-eleve',
    kind: 'objection_response',
    title: 'Votre TJM est trop élevé.',
    sourceIssue: '#3444',
    sourceLabel: 'Objection approuvée',
    body: "Quel est votre budget cible et quel niveau d'expertise attendez-vous ? Je préfère vérifier si l'équation est réaliste plutôt que vous promettre un ajustement artificiel.",
    conditions: [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
    ],
  },
  {
    id: 'pitch-structure-canonique',
    kind: 'pitch',
    title: 'Structure canonique du pitch',
    sourceIssue: '#3445',
    sourceLabel: 'Structure canonique et détaillée',
    body: "STRUCTURE CANONIQUE\n\nOn aide {{type d'équipe}} à {{résultat}} via {{approche}}.\n\nPreuve : {{référence ou fait réel}}.\n\nProchaine étape : {{action simple}}.\n\nSTRUCTURE DÉTAILLÉE\n\n1. Problème.\n2. Solution.\n3. Bénéfice.\n4. Preuve.\n5. Prochaine étape.",
    conditions: [
      'aucun pitch ne doit prétendre être spécialiste de tout',
      'une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal',
      'aucune preuve inventée',
      'aucun résultat générique',
      'aucune référence fictive',
      'le pitch doit être résumé en moins de 20 secondes',
      'une version écrite et une version orale peuvent coexister',
      'la version orale reste naturelle, pas récitée mot pour mot',
    ],
  },
  {
    id: 'pitch-eti-industrielles',
    kind: 'pitch',
    title: 'ETI industrielles',
    sourceIssue: '#3445',
    sourceLabel: 'Exemple 1 — ETI industrielles',
    body: "Nous aidons les ETI industrielles d'Auvergne-Rhône-Alpes à renforcer leurs équipes Data et Cloud avec des consultants immédiatement opérationnels.\n\nNotre approche consiste à qualifier d'abord le périmètre, l'environnement technique et le résultat attendu, puis à présenter une shortlist réduite plutôt qu'un volume de CV.\n\nNous avons déjà accompagné {{référence vérifiée}} sur {{contexte réel}}.\n\nSi vous avez un sujet de renfort prévu dans les prochains mois, quinze minutes suffisent pour vérifier si notre vivier peut correspondre.",
    conditions: [
      'aucun pitch ne doit prétendre être spécialiste de tout',
      'une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal',
      'aucune preuve inventée',
      'aucun résultat générique',
      'aucune référence fictive',
      'le pitch doit être résumé en moins de 20 secondes',
      'une version écrite et une version orale peuvent coexister',
      'la version orale reste naturelle, pas récitée mot pour mot',
    ],
  },
  {
    id: 'pitch-direction-data-grand-compte',
    kind: 'pitch',
    title: 'Direction Data grand compte',
    sourceIssue: '#3445',
    sourceLabel: 'Exemple 2 — direction Data grand compte',
    body: "Nous aidons les directions Data à sécuriser leurs projets quand les équipes internes arrivent à saturation ou qu'une compétence rare bloque la roadmap.\n\nNous partons du projet, du périmètre et des contraintes internes avant de sélectionner les profils.\n\nLa preuve que nous utilisons ici est {{référence ou mission vérifiée}}.\n\nLa prochaine étape n'est pas une présentation complète : c'est de qualifier ensemble un besoin type ou une compétence difficile à mobiliser.",
    conditions: [
      'aucun pitch ne doit prétendre être spécialiste de tout',
      'une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal',
      'aucune preuve inventée',
      'aucun résultat générique',
      'aucune référence fictive',
      'le pitch doit être résumé en moins de 20 secondes',
      'une version écrite et une version orale peuvent coexister',
      'la version orale reste naturelle, pas récitée mot pour mot',
    ],
  },
  {
    id: 'pitch-pme-scale-up',
    kind: 'pitch',
    title: 'PME / scale-up',
    sourceIssue: '#3445',
    sourceLabel: 'Exemple 3 — PME / scale-up',
    body: "Nous aidons les équipes produit et techniques de PME en croissance à renforcer rapidement un projet sans alourdir leur processus de recrutement.\n\nNous mobilisons des consultants déjà qualifiés sur le contexte, le mode de travail et le niveau d'autonomie attendu.\n\nSur {{référence vérifiée}}, cette approche a permis {{résultat réel}}.\n\nJe vous propose simplement de prendre un besoin récent et de voir si nous serions capables d'y répondre proprement.",
    conditions: [
      'aucun pitch ne doit prétendre être spécialiste de tout',
      'une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal',
      'aucune preuve inventée',
      'aucun résultat générique',
      'aucune référence fictive',
      'le pitch doit être résumé en moins de 20 secondes',
      'une version écrite et une version orale peuvent coexister',
      'la version orale reste naturelle, pas récitée mot pour mot',
    ],
  },
  {
    id: 'pitch-rang-2',
    kind: 'pitch',
    title: 'Rang 2 (ESN déjà référencée)',
    sourceIssue: '#3445',
    sourceLabel: 'Exemple 4 — rang 2',
    body: "Nous aidons des ESN déjà référencées à couvrir les besoins qu'elles ne peuvent pas staffer seules, sans perturber leur relation avec le client final.\n\nLe cadre est défini dès le départ : propriété de la relation, marge, non-contournement et règles de renouvellement.\n\nNous pouvons commencer par un besoin précis et vérifier notre capacité à fournir un profil réellement complémentaire.",
    conditions: [
      'aucun pitch ne doit prétendre être spécialiste de tout',
      'une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal',
      'aucune preuve inventée',
      'aucun résultat générique',
      'aucune référence fictive',
      'le pitch doit être résumé en moins de 20 secondes',
      'une version écrite et une version orale peuvent coexister',
      'la version orale reste naturelle, pas récitée mot pour mot',
    ],
  },
  {
    id: 'pitch-talent-disponible',
    kind: 'pitch',
    title: 'Talent disponible',
    sourceIssue: '#3445',
    sourceLabel: 'Exemple 5 — talent disponible',
    body: "Nous accompagnons actuellement un consultant {{expertise}}, basé à {{ville}}, disponible à partir de {{date}}.\n\nSon intérêt ne réside pas uniquement dans sa stack : il a déjà travaillé dans {{contexte réel}} et sait {{preuve réelle}}.\n\nJe ne vous propose pas un CV générique. Je cherche à vérifier si ce type d'expérience répond à un problème actuel de votre équipe.",
    conditions: [
      'aucun pitch ne doit prétendre être spécialiste de tout',
      'une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal',
      'aucune preuve inventée',
      'aucun résultat générique',
      'aucune référence fictive',
      'le pitch doit être résumé en moins de 20 secondes',
      'une version écrite et une version orale peuvent coexister',
      'la version orale reste naturelle, pas récitée mot pour mot',
    ],
  },
]

/**
 * Les `{{placeholder}}` déclarés dans un corps, dans l'ordre d'apparition,
 * sans doublon. Fonction PURE, dérivée du texte — jamais une seconde liste
 * maintenue à la main à côté de `body` (GA-26 : un réglage vit à un seul
 * endroit, y compris à l'intérieur d'une même entrée).
 */
export function extractContentLibraryVariables(body: string): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const match of body.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const name = match[1]?.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      ordered.push(name)
    }
  }
  return ordered
}

export type ContentLibrarySearch = {
  /** Filtre exact, seulement si le commercial ou Laura l'ont précisé — sans lui, toutes les catégories. */
  kind?: ContentLibraryKind
  /** Mots cherchés dans le titre ET le corps — sans lui, la bibliothèque entière (même règle que `search_proofs`). */
  query?: string
}

/**
 * La recherche PURE dans la bibliothèque — même discipline que
 * `selectApplicableMethodRules` (`method-corpus.ts`) : jamais tout injecter
 * sans filtre, jamais deviner un filtre que personne n'a précisé.
 *
 * #3442 (recette prod, 30/09/2026) — la requête est tokenisée : chaque MOT
 * doit être présent (ordre et ponctuation libres), jamais la phrase entière
 * comme sous-chaîne littérale. Miroir de `retrieve_content_library`
 * (`content_library.py`, même numéro de correction).
 */
export function searchContentLibrary(
  entries: readonly ContentLibraryEntry[],
  search: ContentLibrarySearch = {},
): readonly ContentLibraryEntry[] {
  const kindFiltered = search.kind ? entries.filter(entry => entry.kind === search.kind) : entries
  const query = search.query?.trim().toLowerCase()
  if (!query) return kindFiltered
  const words = query.match(/\w+/gu) ?? []
  if (words.length === 0) return kindFiltered
  return kindFiltered.filter(entry => {
    const haystack = `${entry.title} ${entry.body}`.toLowerCase()
    return words.every(word => haystack.includes(word))
  })
}
