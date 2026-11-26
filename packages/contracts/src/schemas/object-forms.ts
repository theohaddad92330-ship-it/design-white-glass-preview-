import { z } from 'zod'

/**
 * Les sept formes d'un objet métier, et la matrice 17 × 7 — Tome 7, §5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `T7.md:508-566` porte la table de placement centrale du produit : elle dit
 * qu'un besoin a une carte de découverte et qu'un positionnement n'a pas de
 * page. Cent dix-neuf cellules, déjà arbitrées. Aucun des trackers censés
 * clore ce tome ne la nomme — `ARCHIVE-01.md:55` la relève comme le trou n°8,
 * et `ARCHIVE-01.md:149` la range dans les « blocs comptés pour un » : des
 * ensembles qui disparaissent sans être comptés, ni en livré, ni en refusé, ni
 * en parqué.
 *
 * C'est le même défaut de forme que `interaction-laws.ts` répare pour les §7,
 * §25 et §28 : **les trackers reprennent les LOIS et jettent les TABLEAUX qui
 * les appliquent.** La loi 3 est déjà dans `interaction-laws.ts` (« un objet
 * métier apparaît partout où il est pertinent, mais jamais sous la même
 * forme ») ; la table qui dit SOUS QUELLES FORMES n'était nulle part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE REGISTRE FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il DÉCRIT, comme `flow-registry`, `doctrine-registry` et `interaction-laws`.
 * Il n'exécute rien et ne rend aucun écran.
 *
 * Il tient DEUX axes que rien n'autorise à fondre :
 *  · `spec` — ce que la source demande, recopié verbatim de `T7.md:526-545`.
 *    Il ne se discute pas ici : c'est la source.
 *  · `measured` — ce que `apps/web` rend RÉELLEMENT, à une date, avec les
 *    fichiers qui le prouvent.
 *
 * Les fondre reproduirait l'erreur que `doctrine-registry` nomme déjà pour
 * `codeState` / `enforcement` : une forme demandée n'est pas une forme livrée,
 * et une forme livrée n'est pas une forme atteignable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ NON MESURÉ N'EST PAS ABSENT — C'EST L'INVARIANT MAISON, APPLIQUÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * ONZE des dix-sept objets n'ont PAS été mesurés le 29/08/2026 — six l'ont été
 * (compte, contact, projet, besoin, talent, mission). Le `measured` des onze
 * autres vaut `null`, et `null` ne veut pas dire « absent » : il veut dire que
 * personne n'a regardé. Écrire `absent` pour ces onze donnerait un registre qui
 * a l'air complet et qui ment — c'est « non mesuré affiché zéro » transposé à
 * un inventaire. GA-74 compte les non-mesurés et exige qu'il en reste,
 * précisément pour que ce fichier ne puisse pas devenir tout vert par omission.
 *
 * Sur les six objets mesurés, 29 cellules sont DEMANDÉES (`●`) : 16 livrées,
 * 9 partielles, 4 absentes (recalculé le 09/09/2026 — #1800 a retiré `/favorites`,
 * seul appelant de la mention F1 d'un contact, et fait passer cette cellule de
 * livrée à absente). Ces nombres sont recalculés par GA-74 à chaque
 * exécution — un total écrit à la main dans un registre est un total faux dans
 * trois semaines, et celui-ci l'était déjà à sa première rédaction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA SOURCE SE CONTREDIT — TROIS OBJETS ANNONCÉS, SEPT DANS LA TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `T7.md:547-552` (§5.2) titre « Les trois objets qui n'ont pas de dossier » et
 * nomme **positionnement, relevé d'activité, preuve**, avec leur raison : « ils
 * n'existent que par rapport à autre chose ».
 *
 * La table de §5.1, elle, marque `—` en F6 pour **sept** objets : les trois
 * nommés, plus **REX, signal, action préparée et intervention**. Vérifié
 * mécaniquement le 29/08/2026 en extrayant la 8ᵉ colonne de `T7.md:528-545`.
 *
 * Ce n'est pas une coquille de lecture : c'est la source qui compte trois là où
 * sa propre table en marque sept. `ARCHIVE-01.md:55` recopie « les 3 objets
 * sans dossier » sans relever l'écart. Les deux chiffres sont donc écrits ici,
 * et `noDossierReason` distingue les trois qui portent une raison ÉCRITE des
 * quatre qui n'ont qu'une case. Un registre qui aplatirait les deux en un seul
 * nombre referait le défaut que `ARCHIVE-01` reproche aux trackers.
 */

/**
 * Les sept formes — `T7.md:512-520`, verbatim.
 *
 * L'ordre est celui de la source et il porte du sens : la densité croît de F1
 * à F6, F7 sort du produit. GA-08 : on n'insère jamais au milieu.
 */
export const OBJECT_FORM_KEYS = [
  'f1_mention',
  'f2_liste',
  'f3_kanban',
  'f4_decouverte',
  'f5_panneau',
  'f6_dossier',
  'f7_export',
] as const
export const objectFormKeySchema = z.enum(OBJECT_FORM_KEYS)
export type ObjectFormKey = (typeof OBJECT_FORM_KEYS)[number]

export const objectFormSchema = z.object({
  key: objectFormKeySchema,
  /** Le nom court, celui qu'on emploie en revue de maquette. */
  label: z.string().min(1),
  /** La question à laquelle cette forme répond — c'est elle qui la distingue
   *  des six autres. Deux formes qui répondent à la même question sont la même
   *  forme, et l'une des deux est en trop (loi 4 du tome 7). */
  question: z.string().min(1),
  /** Ce qu'elle montre. `T7.md` la nomme « densité ». */
  density: z.string().min(1),
  /** Combien d'actions elle porte. */
  actions: z.string().min(1),
})
export type ObjectForm = z.infer<typeof objectFormSchema>

export const OBJECT_FORMS: readonly ObjectForm[] = [
  {
    key: 'f1_mention',
    label: 'Mention',
    question: 'de quoi parle-t-on ?',
    density: 'nom + 1 attribut',
    actions: 'ouvrir',
  },
  {
    key: 'f2_liste',
    label: 'Ligne de liste',
    question: 'lequel choisir ?',
    density: '6 à 16 colonnes',
    actions: '2 à 3',
  },
  {
    key: 'f3_kanban',
    label: 'Carte de kanban',
    question: 'où en est-il ?',
    density: '4 à 6 attributs + 1 alerte',
    actions: 'glisser',
  },
  {
    key: 'f4_decouverte',
    label: 'Carte de découverte',
    question: 'pourquoi lui ?',
    density: 'verdict + preuves + accès',
    actions: '3',
  },
  {
    key: 'f5_panneau',
    label: 'Panneau latéral',
    question: "dis-m'en plus sans que je parte",
    density: '8 à 12 attributs + onglets réduits',
    actions: '4 à 6',
  },
  {
    key: 'f6_dossier',
    label: 'Dossier complet',
    question: 'je travaille dessus',
    density: 'tout, en onglets',
    actions: 'toutes',
  },
  {
    key: 'f7_export',
    label: 'Export',
    question: "je le montre à quelqu'un",
    density: 'figé, daté, sourcé',
    actions: 'aucune',
  },
]

/**
 * Les trois symboles de la matrice — `T7.md:524`.
 *
 * `never` n'est PAS « pas encore ». C'est un refus : une carte de kanban pour
 * un compte n'a pas de sens, parce qu'un compte n'a pas d'étape à faire
 * glisser. Confondre `never` et `absent` transformerait un arbitrage en dette.
 */
export const FORM_PRESENCE_VALUES = ['required', 'optional', 'never'] as const
export const formPresenceSchema = z.enum(FORM_PRESENCE_VALUES)
export type FormPresence = (typeof FORM_PRESENCE_VALUES)[number]

/** Le symbole de la source, pour relire la table sans la retraduire. */
export const FORM_PRESENCE_SYMBOL: Record<FormPresence, string> = {
  required: '●',
  optional: '○',
  never: '—',
}

/**
 * L'état MESURÉ d'une forme dans `apps/web`, à une date.
 *
 * `orphan` est un état à part entière, et c'est le plus utile des quatre :
 * c'est le défaut n°1 de ce dépôt — du code juste, calculé, testé, que
 * personne n'appelle. Une forme dont le composant existe mais qu'aucun écran
 * ne rend n'est PAS livrée, et la ranger dans `delivered` ferait exactement le
 * mensonge que ce registre existe pour empêcher.
 */
export const MEASURED_FORM_STATES = ['delivered', 'partial', 'orphan', 'absent'] as const
export const measuredFormStateSchema = z.enum(MEASURED_FORM_STATES)
export type MeasuredFormState = (typeof MEASURED_FORM_STATES)[number]

export const measuredFormSchema = z.object({
  state: measuredFormStateSchema,
  /** Les fichiers qui le prouvent, en chemins relatifs à la racine du dépôt.
   *  GA-74 les ouvre : un porteur renommé fait échouer la CI, ce qui est le
   *  seul moment où l'on peut encore réagir. Vide quand `absent`. */
  holders: z.array(z.string().min(1)),
  /** L'écran qui RIT la forme. C'est la question qui compte : une forme sans
   *  appelant n'existe pas. `null` seulement quand `absent` ou `orphan`. */
  renderedBy: z.string().min(1).nullable(),
  /** Ce qu'on a vu, en une phrase. Toujours exigé — un état sans phrase se
   *  relit comme un verdict, et un verdict ne se vérifie pas. */
  note: z.string().min(1),
})
export type MeasuredForm = z.infer<typeof measuredFormSchema>

export const businessObjectKeySchema = z.string().min(1)

export const businessObjectFormsSchema = z.object({
  key: z.string().min(1),
  /** Le nom de l'objet dans la source, verbatim — c'est lui qu'on cite. */
  label: z.string().min(1),
  /** `T7.md:528-545`, une ligne de la table. Les sept formes, toujours. */
  spec: z.record(objectFormKeySchema, formPresenceSchema),
  /** Ce que `apps/web` rend, mesuré le 29/08/2026. `null` = NON MESURÉ, ce qui
   *  n'est pas « absent » : personne n'a regardé. */
  measured: z.partialRecord(objectFormKeySchema, measuredFormSchema).nullable(),
  /** Pourquoi cet objet n'a pas de dossier, quand §5.2 le dit. `null` quand la
   *  table marque `—` en F6 sans que §5.2 le justifie — la contradiction du
   *  docblock, rendue lisible entrée par entrée. */
  noDossierReason: z.string().min(1).nullable(),
})
export type BusinessObjectForms = z.infer<typeof businessObjectFormsSchema>

/** Raccourci de lecture : une ligne de la table, dans l'ordre des sept formes. */
function row(
  f1: FormPresence,
  f2: FormPresence,
  f3: FormPresence,
  f4: FormPresence,
  f5: FormPresence,
  f6: FormPresence,
  f7: FormPresence,
): Record<ObjectFormKey, FormPresence> {
  return {
    f1_mention: f1,
    f2_liste: f2,
    f3_kanban: f3,
    f4_decouverte: f4,
    f5_panneau: f5,
    f6_dossier: f6,
    f7_export: f7,
  }
}

const REQ: FormPresence = 'required'
const OPT: FormPresence = 'optional'
const NEV: FormPresence = 'never'

/** Raccourci de mesure — `delivered` exige toujours un porteur ET un écran. */
function seen(
  state: MeasuredFormState,
  note: string,
  holders: string[] = [],
  renderedBy: string | null = null,
): MeasuredForm {
  return { state, holders, renderedBy, note }
}

/** Une forme que la table refuse ET que le produit ne rend pas : rien à dire de plus. */
function correctlyAbsent(note: string): MeasuredForm {
  return { state: 'absent', holders: [], renderedBy: null, note }
}

/**
 * La raison de §5.2, une seule fois : elle vaut pour les trois objets nommés,
 * et la répéter mot pour mot trois fois la ferait diverger au premier
 * remaniement (un réglage vit à un seul endroit).
 */
const NO_DOSSIER_REASON =
  "T7.md:550 — il n'existe que par rapport à autre chose. Un positionnement est un lien entre un talent et un besoin ; lui donner une page à lui invite à le travailler pour lui-même, ce qui n'a pas de sens. Test de §5.2 : un objet sans action propre qui dure plus de trente secondes n'a pas besoin de dossier."

export const BUSINESS_OBJECT_FORMS: readonly BusinessObjectForms[] = [
  {
    key: 'compte',
    label: 'Compte',
    spec: row(REQ, REQ, NEV, REQ, REQ, REQ, REQ),
    measured: {
      f1_mention: seen(
        'partial',
        "Quinze mentions à la main dans quatorze fichiers au 29/08/2026, chacune avec son balisage — et aucune ne portait l'attribut que §5.3 assigne au compte. Trois passent désormais par `ObjectMention` ; les douze autres restent, dont plusieurs qui ne sont PAS des mentions (elles enveloppent une carte ou une ligne entière).",
        [
          'apps/web/src/components/primitives/ObjectMention.tsx',
          'apps/web/src/features/accounts/view/account-detail/components/LinkedAccountsCard.tsx',
        ],
        'apps/web/src/features/briefing/view/BriefingPage.tsx',
      ),
      f2_liste: seen(
        'delivered',
        'Neuf colonnes, dont « prochaine action » et « signal dominant » — les deux que §5.3 distingue de la carte de découverte.',
        [
          'apps/web/src/features/accounts/view/accounts-list/AccountTableRow.tsx',
          'apps/web/src/features/accounts/view/accounts-list/AccountsTable.tsx',
        ],
        'apps/web/src/routes/accounts/index.tsx',
      ),
      f3_kanban: correctlyAbsent(
        'La table dit `—`, et le produit ne le rend pas : conforme. Le tableau des sprints range bien des comptes en trois colonnes, mais on y déplace par BOUTON — le seul glisser-déposer du produit est celui des projets, ce que son propre en-tête écrit (« le seul kanban du produit est celui des PROJETS »).',
      ),
      f4_decouverte: seen(
        'delivered',
        'Verdict, qualification, score et signaux datés — la forme la plus complète du produit : la ligne compacte (#3597) porte le verdict, le score et le « pourquoi maintenant », son repliable le reste.',
        [
          'apps/web/src/features/discover/view/CandidateRow.tsx',
          'apps/web/src/features/discover/view/CandidateRowDetails.tsx',
        ],
        'apps/web/src/features/discover/view/Discover.tsx',
      ),
      f5_panneau: seen(
        'absent',
        "AUCUN panneau de compte : cliquer une ligne emmène sur la page entière. Les sept `Sheet` d'`features/accounts` portent des SOUS-objets (sources de veille, implications SI, provenance, positionnement concurrentiel…), jamais les attributs du compte. C'est la seule forme DEMANDÉE que le compte n'a pas.",
      ),
      f6_dossier: seen(
        'delivered',
        "Quatorze onglets déclarés, TREIZE rendus par défaut — le quatorzième (« couverture ») n'apparaît que s'il a une action à proposer. Le compte des treize de §5.3 tombe donc juste, ce qui n'était pas acquis.",
        [
          'apps/web/src/features/accounts/view/AccountDetail.tsx',
          'apps/web/src/features/accounts/view/account-detail/components/AccountDetailTabsBar.tsx',
        ],
        'apps/web/src/routes/accounts/$id.tsx',
      ),
      f7_export: seen(
        'delivered',
        'Quatre sorties : PDF daté et sourcé, page de partage datée avec expiration, CSV de découverte, livrables. Le seul objet du produit dont F7 est vraiment figé, daté ET sourcé.',
        ['apps/web/src/lib/account-pdf/AccountPdfDocument.tsx', 'apps/web/src/features/share/view/PublicSharePage.tsx'],
        'apps/web/src/features/accounts/view/account-detail/components/AccountDetailHero.tsx',
      ),
    },
    noDossierReason: null,
  },
  {
    key: 'entite_bu',
    label: 'Entité / BU',
    spec: row(REQ, REQ, NEV, OPT, REQ, OPT, REQ),
    measured: null,
    noDossierReason: null,
  },
  {
    key: 'contact',
    label: 'Contact',
    spec: row(REQ, REQ, NEV, NEV, REQ, REQ, OPT),
    measured: {
      f1_mention: seen(
        'absent',
        "#1800 (09/09/2026) — RÉGRESSION MESURÉE, PAS UN OUBLI. L'unique appel d'`ObjectMention` avec `kind=\"contact\"` du dépôt entier vivait sur `/favorites` (`FavoritesPage.tsx`) : c'était le SEUL écran qui mentionnait un contact via la primitive. Le retrait de la page (retour Louis, « supprime la notion de favori ») a retiré ce seul appelant avec elle — mesuré par `grep 'kind=\"contact\"'` sur `apps/web/src` après le lot : zéro occurrence hors tests. La mention d'un contact reste donc écrite à la main ailleurs (organigramme, pastilles), ce qui est exactement l'état que le lot du 29/08 avait corrigé. Dette RECONNUE, pas cachée : `missingRequiredForms()` la compte désormais.",
      ),
      f2_liste: seen(
        'delivered',
        'Onze colonnes, un vrai tableau — plus la ligne compacte du dossier de compte, qui est une seconde F2 assumée sur un autre écran.',
        ['apps/web/src/features/contacts/view/contacts-list/ContactTableRow.tsx'],
        'apps/web/src/routes/contacts/index.tsx',
      ),
      f3_kanban: correctlyAbsent(
        'La table dit `—` : conforme. Zéro occurrence de kanban ou de glisser-déposer sous `features/contacts`, contrôle positif fait sur les mêmes chemins (cinquante `export function` y répondent).',
      ),
      f4_decouverte: seen(
        'partial',
        "⚠️ La table dit `—`, et une carte « pourquoi ce contact » existe pourtant, dans l'onglet Contacts du dossier de compte (persona, priorité, `why_contact`). Ce n'est pas un défaut à réparer mais un écart à TRANCHER : soit la table se corrige, soit la carte devient une F5. Parqué, non décidé.",
        ['apps/web/src/features/accounts/view/account-detail/tabs/contacts/PriorityPathSection.tsx'],
        'apps/web/src/features/accounts/view/account-detail/components/AccountDetailTabContent.tsx',
      ),
      f5_panneau: seen(
        'absent',
        "Aucun panneau de contact : depuis le dossier de compte, cliquer un contact NAVIGUE (`navigate({ to: '/contacts/$id' })`), ce qui fait perdre le contexte du compte. C'est précisément ce que F5 existe pour éviter — « dis-m'en plus sans que je parte ».",
      ),
      f6_dossier: seen(
        'delivered',
        'Trois zones sous l’en-tête (informations, espace de travail, dossiers associés), sans onglet : #3687.',
        [
          'apps/web/src/features/contacts/view/contact-detail/ContactDetail.tsx',
          'apps/web/src/features/contacts/view/contact-detail/components/ContactFold.tsx',
        ],
        'apps/web/src/routes/contacts/$id.tsx',
      ),
      f7_export: seen(
        'partial',
        "La table dit `○`. Un export tableur existe et honore la sélection ; il n'est pas daté DANS le document, donc il n'est pas « figé, daté, sourcé » au sens de F7. Les contacts figurent en revanche, datés, dans le PDF du compte.",
        ['apps/web/src/features/google/components/ExportSheetButton.tsx'],
        'apps/web/src/features/contacts/view/ContactContent.tsx',
      ),
    },
    noDossierReason: null,
  },
  {
    key: 'projet',
    label: 'Projet',
    spec: row(REQ, REQ, REQ, NEV, REQ, OPT, OPT),
    measured: {
      f1_mention: seen(
        'absent',
        "Un projet est du TEXTE partout où il est cité — dans l'onglet Projets du compte, dans le dialogue des projets similaires, sur la page d'un besoin. Aucun n'est cliquable, et rien ne s'ouvrirait : le projet n'a pas de F6.",
      ),
      f2_liste: seen(
        'partial',
        "Sept colonnes, et seulement DANS le dossier de compte — lignes non cliquables. Sur `/projets` il n'y a pas de tableau du tout : la vue pipeline est un tableau kanban, la vue portefeuille est une liste de cartes par compte.",
        ['apps/web/src/features/accounts/view/account-detail/tabs/TabProjects.tsx'],
        'apps/web/src/features/accounts/view/account-detail/components/AccountDetailTabContent.tsx',
      ),
      f3_kanban: seen(
        'delivered',
        "Le SEUL vrai glisser-déposer du produit. Le dépôt de la carte ouvre un panneau qui recueille le motif de perte et les effets acceptés — le geste n'écrit pas tout seul.",
        ['apps/web/src/features/projects/view/PipelineBoard.tsx'],
        'apps/web/src/features/projects/view/ProjectsPage.tsx',
      ),
      f4_decouverte: seen(
        'partial',
        '⚠️ La table dit `—`, et le dialogue des projets similaires en tient lieu (verdict « le même besoin existe ici », preuve = les termes partagés). Même écart à trancher que pour le contact.',
        ['apps/web/src/features/projects/view/SimilarProjectsDialog.tsx'],
        'apps/web/src/features/projects/portfolio/view/NeedsAccountSheet.tsx',
      ),
      f5_panneau: seen(
        'delivered',
        'Neuf à dix blocs d’attributs : étape, montant, provenance, contexte, besoins, secteurs, positionnements, chronologie. Sans onglets — la densité de F5, exactement. #4194 — le tiroir propre aux projets est devenu le panneau latéral unique à 3 zones (propriétés, historique, objets liés), commun aux cinq types de fiche.',
        ['apps/web/src/features/records/RecordPanel.tsx'],
        'apps/web/src/features/projects/view/ProjectsPage.tsx',
      ),
      f6_dossier: seen(
        'delivered',
        "#2801 — la table disait `○` avant ce lot : « aucune route `projects/$id` n'existe ». Elle existe désormais : le dossier ouvre le PROJET lui-même (étape, montant, comité, besoins, historique), atteignable depuis le panneau latéral (`RecordPanel.tsx`, lien « Ouvrir la fiche complète », #4194).",
        ['apps/web/src/routes/projects/$id.tsx', 'apps/web/src/features/projects/view/ProjectDossierPage.tsx'],
        'apps/web/src/features/projects/view/ProjectDossierPage.tsx',
      ),
      f7_export: seen(
        'partial',
        "La table dit `○`. Ce qui existe POUSSE le projet vers un CRM tiers — une écriture chez quelqu'un d'autre, pas un artefact figé, daté et sourcé. Un 409 « aucun CRM connecté » devient une invitation, jamais un faux succès.",
        ['apps/web/src/features/projects/hooks/useExportProjectToCrm.ts'],
        'apps/web/src/features/projects/portfolio/view/NeedsAccountSheet.tsx',
      ),
    },
    noDossierReason: null,
  },
  {
    key: 'besoin',
    label: 'Besoin',
    // ⚠️ Le produit porte DEUX objets appelés « besoin » : le besoin OUVERT du
    // recruteur (table `project_needs`) et le besoin DÉTECTÉ, projeté depuis
    // l'analyse d'un compte. La mesure ci-dessous nomme lequel chaque fois —
    // les confondre ferait passer une forme livrée sur l'un pour une forme
    // livrée sur l'autre, et c'est le genre d'erreur qu'un inventaire ne
    // rattrape jamais.
    spec: row(REQ, REQ, REQ, REQ, REQ, OPT, OPT),
    measured: {
      f1_mention: seen(
        'partial',
        "Cliquable DANS sa propre liste (besoin ouvert), et nulle part ailleurs : dans le panneau d'un projet le besoin est un bloc titre + badges non cliquable, et ni la mission ni le compte ne le mentionnent.",
        ['apps/web/src/features/projects/open-needs/view/OpenNeedsTable.tsx'],
        'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx',
      ),
      f2_liste: seen(
        'delivered',
        'Dix-huit colonnes sur le besoin ouvert — la liste la plus dense du produit, au-dessus des « 6 à 16 » que le tome donne pour F2.',
        ['apps/web/src/features/projects/open-needs/view/OpenNeedsTable.tsx'],
        'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx',
      ),
      f3_kanban: seen(
        'partial',
        "Le tableau existe et se LIT ; il ne déplace rien, et son en-tête le dit explicitement. F3 répond à « où en est-il ? », ce qu'il fait — mais son action, « glisser », n'est pas là.",
        ['apps/web/src/features/projects/open-needs/view/NeedsKanban.tsx'],
        'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx',
      ),
      f4_decouverte: seen(
        'partial',
        "Le dialogue des projets similaires est la seule surface « pourquoi lui » d'un besoin, et il porte sa preuve — mais il répond à « où ce besoin existe-t-il aussi », pas à « pourquoi celui-ci mérite mon temps », et il n'est atteignable que depuis le besoin DÉTECTÉ.",
        ['apps/web/src/features/projects/view/SimilarProjectsDialog.tsx'],
        'apps/web/src/features/projects/portfolio/view/NeedsAccountSheet.tsx',
      ),
      f5_panneau: seen(
        'partial',
        "Livré pour le besoin DÉTECTÉ. Le besoin OUVERT n'a pas de panneau d'objet : les deux tiroirs de son écran portent les filtres et le classement des consultants, pas le besoin.",
        ['apps/web/src/features/projects/portfolio/view/NeedsAccountSheet.tsx'],
        'apps/web/src/features/projects/view/ProjectsPage.tsx',
      ),
      f6_dossier: seen(
        'partial',
        "La table ne demandait que `○` et le produit a livré une page entière — atteignable au clic, gardée par un test de joignabilité. Mais elle n'a AUCUN onglet : c'est une page plate. « Tout, en onglets » n'est donc qu'à moitié tenu.",
        ['apps/web/src/features/projects/open-needs/view/NeedDetailPage.tsx'],
        'apps/web/src/routes/projects/needs_.$needId.tsx',
      ),
      f7_export: seen(
        'absent',
        "La table dit `○`, et l'absence est ici un REFUS écrit deux fois dans le code (« aucun export », « la seule route d'export côté besoins POUSSE vers un CRM tiers »). Rien à réparer.",
      ),
    },
    noDossierReason: null,
  },
  {
    key: 'talent',
    label: 'Talent',
    spec: row(REQ, REQ, NEV, NEV, REQ, REQ, REQ),
    measured: {
      f1_mention: seen(
        'partial',
        "Cliquable dans le vivier et dans la liste des consultants. Ailleurs — positionnements, tableau des missions, panneau de mission, relevés d'activité — le nom du consultant est un `<Text>` mort.",
        ['apps/web/src/features/consultants/view/ConsultantsPage.tsx'],
        'apps/web/src/routes/consultants/index.tsx',
      ),
      f2_liste: seen(
        'partial',
        'Treize attributs, ce qui est la densité de F2 — mais rendus en cartes empilées et non en tableau : ni en-tête, ni tri, ni sélection de colonnes, là où `/contacts` a tout cela.',
        ['apps/web/src/features/consultants/view/ConsultantsPage.tsx'],
        'apps/web/src/routes/consultants/index.tsx',
      ),
      f3_kanban: correctlyAbsent(
        'La table dit `—` : conforme. Le seul tableau à colonnes qui MONTRE un talent porte des missions, et le talent y est une sous-ligne non cliquable.',
      ),
      f4_decouverte: seen(
        'partial',
        "⚠️ La table dit `—`, et c'est pourtant la MEILLEURE carte de découverte du produit : deux scores côte à côte, une preuve par compétence, les manques, les écarts datés, les questions à poser. Troisième écart du même genre — la table refuse F4 à trois objets qui l'ont.",
        ['apps/web/src/features/matching/view/MatchCard.tsx'],
        'apps/web/src/features/matching/view/MatchDrawer.tsx',
      ),
      f5_panneau: seen(
        'delivered',
        'Onze attributs pour un talent : rôle, compte, date de calcul, seuil, correspondance et ses axes, poussable, poids, exclusions, manques, questions.',
        ['apps/web/src/features/matching/view/MatchExplainSheet.tsx'],
        'apps/web/src/features/matching/view/MatchDrawer.tsx',
      ),
      f6_dossier: seen(
        'delivered',
        'Dix onglets, dont le consentement — le seul dossier du produit qui en porte un.',
        ['apps/web/src/features/consultants/view/detail/TalentDetailPage.tsx'],
        'apps/web/src/routes/consultants/$id.tsx',
      ),
      f7_export: seen(
        'delivered',
        "Le dossier de compétences : daté, versionné sans écrasement, avec sa règle d'anonymisation visible et les compétences retirées barrées AVEC leur raison. C'est l'exemple de F7 le plus abouti du produit.",
        ['apps/web/src/features/consultants/view/studio/CvStudioPanel.tsx'],
        'apps/web/src/features/consultants/view/detail/TalentDetailPage.tsx',
      ),
    },
    noDossierReason: null,
  },
  {
    key: 'positionnement',
    label: 'Positionnement',
    spec: row(REQ, REQ, REQ, NEV, REQ, NEV, NEV),
    measured: null,
    noDossierReason: NO_DOSSIER_REASON,
  },
  {
    key: 'mission',
    label: 'Mission',
    spec: row(REQ, REQ, REQ, NEV, REQ, REQ, OPT),
    measured: {
      f1_mention: seen(
        'delivered',
        "Débloquée le 30/08/2026 par la livraison de F6 (D200) — c'était la seule dépendance entre deux formes que la mesure ait trouvée : l'action d'une mention est « ouvrir », et il n'y avait rien à ouvrir. Les CINQ écrans où le libellé était du texte mort passent par `ObjectMention kind=\"mission\"` : le dossier de compte, les encaissements, les relevés d'activité, « Prêt à facturer » et les retours d'expérience. `MENTION_TARGETS` porte `/missions/$id`, à un seul endroit.",
        [
          'apps/web/src/components/primitives/ObjectMention.tsx',
          'apps/web/src/features/accounts/view/account-detail/tabs/TabMissions.tsx',
          'apps/web/src/features/missions/view/CollectionsPage.tsx',
          'apps/web/src/features/missions/view/TimesheetsPage.tsx',
          'apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx',
          'apps/web/src/features/pilotage/rex/view/RexScreen.tsx',
        ],
        'apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx',
      ),
      f2_liste: seen(
        'delivered',
        'Colonnes configurables, avec leur sélecteur. Le nom est un `<button>` qui ouvre le panneau latéral.',
        ['apps/web/src/features/missions/view/MissionsTable.tsx'],
        'apps/web/src/features/missions/view/MissionsPage.tsx',
      ),
      f3_kanban: seen(
        'absent',
        "RETIRÉ (#4359.3) : `/missions/board` n'est plus une route depuis #4359, et le composant `MissionBoardPage` — qui n'avait plus aucun appelant — a été supprimé. La table demande F3 pour la mission ; le produit ne la rend plus. Constat, pas décision : la rouvrir est un arbitrage de produit.",
      ),
      f4_decouverte: correctlyAbsent('La table dit `—` : conforme.'),
      f5_panneau: seen(
        'delivered',
        "La surface la plus riche de la mission, et de loin : un tiroir à CINQ onglets (synthèse, staffing, conditions, scores, historique) qui interroge quatre routes. Elle porte déjà tout ce qu'un dossier demanderait.",
        ['apps/web/src/features/missions/view/MissionDetailSheet.tsx'],
        'apps/web/src/features/missions/view/MissionsPage.tsx',
      ),
      f6_dossier: seen(
        'delivered',
        "LIVRÉ le 30/08/2026 (D200) — c'était le trou le plus net de la mesure, et le moins cher : le contenu existait en substance dans le tiroir F5, il ne manquait qu'une ROUTE. `/missions/$id` la pose ; les cinq onglets sont EXTRAITS du tiroir dans `MissionDetailTabs` et montés par les deux formes, qui restent distinctes (un tiroir se ferme et rend la liste, un dossier se garde). La lecture est `GET /delivery/missions?id=…`, la même que la liste — jamais une seconde route serveur, qui aurait fait diverger le dossier de sa propre liste. Deux gardes : `mission-dossier-is-reachable` (il s'atteint en cliquant) et `mission-shows-once` (les deux formes montent le même composant).",
        ['apps/web/src/features/missions/view/MissionDossierPage.tsx'],
        'apps/web/src/routes/missions/$id.tsx',
      ),
      f7_export: seen(
        'partial',
        "La table dit `○`. Ce qui existe est un CSV de facturation borné au MOIS, une ligne par mission × mois — figé, daté, sourcé, mais ce n'est pas l'export d'UNE mission. Aucun PDF, aucun lien de partage : la page de partage du produit ne connaît que les comptes.",
        ['apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx'],
        'apps/web/src/features/missions/view/MissionsPage.tsx',
      ),
    },
    noDossierReason: null,
  },
  {
    key: 'releve_activite',
    label: "Relevé d'activité",
    spec: row(REQ, REQ, NEV, NEV, OPT, NEV, REQ),
    measured: null,
    noDossierReason: NO_DOSSIER_REASON,
  },
  {
    key: 'partenaire_esn',
    label: 'Partenaire ESN',
    spec: row(REQ, REQ, NEV, REQ, REQ, REQ, OPT),
    measured: null,
    noDossierReason: null,
  },
  {
    key: 'preuve',
    label: 'Preuve',
    spec: row(REQ, REQ, NEV, NEV, REQ, NEV, REQ),
    measured: null,
    noDossierReason: NO_DOSSIER_REASON,
  },
  {
    key: 'rex',
    label: 'REX',
    spec: row(REQ, REQ, NEV, NEV, REQ, NEV, NEV),
    measured: null,
    // §5.2 ne le nomme pas, alors que la table lui met `—` en F6. Écrit `null`
    // plutôt qu'inventé : le refus est peut-être le même, mais la source ne le
    // dit pas, et deviner la raison d'un arbitrage est ce qui le fait
    // re-proposer.
    noDossierReason: null,
  },
  {
    key: 'signal',
    label: 'Signal',
    spec: row(REQ, REQ, NEV, OPT, OPT, NEV, OPT),
    measured: null,
    noDossierReason: null,
  },
  {
    key: 'appel_offres',
    label: "Appel d'offres",
    spec: row(REQ, REQ, NEV, NEV, REQ, REQ, REQ),
    measured: null,
    noDossierReason: null,
  },
  {
    key: 'action_preparee',
    label: 'Action préparée',
    spec: row(REQ, REQ, REQ, NEV, REQ, NEV, NEV),
    measured: null,
    noDossierReason: null,
  },
  {
    key: 'intervention',
    label: 'Intervention',
    spec: row(NEV, REQ, NEV, NEV, OPT, NEV, NEV),
    measured: null,
    noDossierReason: null,
  },
  {
    key: 'territoire',
    label: 'Territoire',
    spec: row(OPT, NEV, NEV, REQ, NEV, REQ, REQ),
    measured: null,
    noDossierReason: null,
  },
]

/**
 * Le cas du compte — `T7.md:554-566` (§5.3), verbatim.
 *
 * C'est la démonstration de la loi 4 : cinq formes, cinq contenus, et **aucun
 * de ces cinq contenus n'est un sous-ensemble strict d'un autre**. La ligne
 * porte la prochaine action, que la carte de découverte n'a pas ; la carte
 * porte le « pourquoi pour toi », que la ligne n'a pas.
 *
 * Sans cette table, « montrer le même compte de la même façon partout » se lit
 * comme une consigne d'uniformité — l'exact contraire de ce que la source
 * demande.
 */
export const ACCOUNT_FORM_CONTENTS: readonly { form: ObjectFormKey; content: string }[] = [
  { form: 'f1_mention', content: 'nom + score' },
  {
    form: 'f2_liste',
    content:
      'nom, score, porte, propriétaire, dernier signal, dernière interaction, prochaine action, projets ouverts, fraîcheur, classe d’accès',
  },
  {
    form: 'f4_decouverte',
    content:
      'verdict, pourquoi maintenant, pourquoi pour toi, intérêt et adressabilité séparés, ce qui bloque, ce qui ouvre, entité recommandée',
  },
  { form: 'f5_panneau', content: 'résumé, 3 contacts prioritaires, 2 signaux récents, prochaine action, accès' },
  { form: 'f6_dossier', content: '13 onglets' },
]

/** Les objets dont la TABLE refuse le dossier (F6 = `—`). Sept, pas trois. */
export function objectsWithoutDossier(): readonly BusinessObjectForms[] {
  return BUSINESS_OBJECT_FORMS.filter(object => object.spec.f6_dossier === 'never')
}

/** Ceux dont §5.2 ÉCRIT la raison. Trois. L'écart avec les sept est le sujet. */
export function objectsWithWrittenDossierRefusal(): readonly BusinessObjectForms[] {
  return BUSINESS_OBJECT_FORMS.filter(object => object.noDossierReason !== null)
}

/** Les objets que personne n'a mesurés. `null` n'est pas « absent ». */
export function unmeasuredObjects(): readonly BusinessObjectForms[] {
  return BUSINESS_OBJECT_FORMS.filter(object => object.measured === null)
}

/**
 * Les formes DEMANDÉES (`●`) qu'on a mesurées et qui ne sont pas livrées.
 *
 * C'est la seule liste du fichier qui soit un carnet de dettes. Elle est
 * calculée, jamais saisie : une liste saisie à la main diverge de la mesure au
 * premier écran livré.
 */
export function missingRequiredForms(): readonly { object: string; form: ObjectFormKey; state: MeasuredFormState }[] {
  const out: { object: string; form: ObjectFormKey; state: MeasuredFormState }[] = []
  for (const object of BUSINESS_OBJECT_FORMS) {
    if (object.measured === null) continue
    for (const form of OBJECT_FORM_KEYS) {
      if (object.spec[form] !== 'required') continue
      const measured = object.measured[form]
      if (measured === undefined) continue
      if (measured.state === 'delivered') continue
      out.push({ object: object.key, form, state: measured.state })
    }
  }
  return out
}
