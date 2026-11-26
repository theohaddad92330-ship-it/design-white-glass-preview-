import type { ActionIntentType } from '@bellum/contracts'

/**
 * #2449.8-.15 — CE QUE LE NIVEAU « PRÉPARER » CRÉE, ET OÙ LE PRODUIT LE
 * RÉALISE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La porte (`copilot-action-gate.ts`) tient la RÈGLE : au niveau « préparer »,
 * seul ce qui atterrit dans BellumAI passe. Elle ne dit rien de ce que la règle
 * RECOUVRE. Or le rapport ne dit pas « préparer crée des choses internes » : il
 * en nomme HUIT, une par une — brouillon, plan, sélection, audience, tâche,
 * shortlist, export, diff CRM. Tant que ces huit noms ne pointent vers rien,
 * « le niveau 2 peut créer une shortlist interne » est une phrase invérifiable,
 * et elle le restera le jour où l'artefact déménagera.
 *
 * Chaque ligne nomme donc l'artefact RÉEL, et la garde
 * (`preparable-objects.spec.ts`) vérifie qu'il existe encore sur le disque.
 * C'est le minimum qu'on demande ailleurs dans ce dépôt : une garde doit
 * prouver qu'elle lit quelque chose, et savoir dire NON.
 *
 * ⚠️ Cette table ne CRÉE rien et n'AUTORISE rien : elle documente et se fait
 * vérifier. L'autorisation vit à un seul endroit, la porte (GA-26).
 *
 * ⚠️ `intentType` n'est renseigné que pour les préparations qu'un intent du
 * routeur réalise vraiment. Les autres sont des objets de base, créés par leur
 * propre chemin ; leur mettre un intent inventé ferait croire que la porte les
 * couvre alors qu'elle ne les voit pas passer.
 */
export type PreparableObject = {
  /** Le point du registre que cette ligne referme. */
  point: string
  /** Le fichier, relatif à `apps/api/src`, où le produit le réalise. */
  realizedBy: string
  /** Pourquoi c'est bien une préparation INTERNE, et pas autre chose. */
  why: string
  /** L'intent du routeur qui le crée, quand il en existe un. */
  intentType?: ActionIntentType
}

export const PREPARABLE_OBJECTS: Readonly<Record<string, PreparableObject>> = {
  // #2449.8 — un brouillon interne : généré chez nous, jamais déposé ailleurs.
  internal_draft: {
    point: '2449.8',
    realizedBy: 'modules/action-router/card-effect-ports.ts',
    why: "`generate_message` produit un brouillon CHEZ NOUS et ne l'envoie pas ; c'est `create_mail_draft` qui le dépose dans une boîte, et celui-là est de site `connected_system`, donc refusé au niveau « préparer ». La frontière entre les deux est exactement celle que #2449.4 trace.",
    intentType: 'generate_message',
  },
  // #2449.9 — un plan interne : le plan d'action d'un compte.
  internal_plan: {
    point: '2449.9',
    realizedBy: 'database/entities/action-plan.entity.ts',
    why: "Le plan d'action d'un compte vit dans nos tables (`action_plans`, `action_plan_items`) : rien n'en sort tant que personne ne clique. C'est la préparation la plus littérale du rapport — Laura propose une suite de gestes, et aucun ne part.",
  },
  // #2449.10 — une sélection interne : ce que l'espace a sous la main.
  internal_selection: {
    point: '2449.10',
    realizedBy: 'database/entities/workspace-active-selection.entity.ts',
    why: "La sélection active d'un espace est un état de travail, chez nous, réversible et sans effet extérieur : la poser ne prévient personne et ne coûte rien. C'est le type même de l'écriture que « préparer » a le droit de faire.",
  },
  // #2449.11 — une audience interne. ⚠️ c74 : l'audience est une ÉTIQUETTE.
  internal_audience: {
    point: '2449.11',
    realizedBy: 'database/entities/outreach-sequence.entity.ts',
    why: "⚠️ L'audience est mono-contact PAR DÉFAUT : `campaign_label` a refermé ce chantier le 16/09/2026 (`c74_campagne_etiquette_mono_contact`), assoupli le 10/10/2026 (#3894.3, Louis) — plusieurs contacts SEULEMENT sur demande EXPLICITE de la personne (« pour Marie et Paul »), jamais une audience devinée. L'audience « interne » que « préparer » peut créer reste cette étiquette portée par des séquences mono-contact, une par personne nommée, chez nous : rien n'est envoyé.",
  },
  // #2449.12 — une tâche interne : un pense-bête, pas une tâche CRM.
  internal_task: {
    point: '2449.12',
    realizedBy: 'database/entities/user-action.entity.ts',
    why: "Une tâche interne est un rappel à soi-même journalisé chez nous (`schedule_reminder` retombe sur `user_actions` quand aucun agenda n'est branché). Une tâche CRM, elle, est de site `connected_system` : « préparer » la refuse, et #2449.18 lui demande un GO au niveau « exécuter ».",
    intentType: 'schedule_reminder',
  },
  // #2449.13 — une shortlist interne : des profils rapprochés d'un besoin.
  internal_shortlist: {
    point: '2449.13',
    realizedBy: 'database/entities/shortlist.entity.ts',
    why: "Une shortlist rapproche des profils d'un besoin, dans nos tables : personne n'est contacté, aucun profil n'est positionné chez un client. Proposer n'est pas engager — c'est la même frontière que « on PROPOSE une fusion de doublons, on ne fusionne JAMAIS ».",
  },
  // #2449.14 — un export interne : un fichier rendu à celui qui le demande.
  internal_export: {
    point: '2449.14',
    realizedBy: 'modules/privacy/privacy-portability.service.ts',
    why: "Un export INTERNE est un fichier construit chez nous et rendu à celui qui le demande (portabilité RGPD, CSV d'un écran) : il ne POUSSE rien chez un tiers. L'export qui sort — vers un CRM — est un geste de sortie de données, gouverné par `INTENT_WORKSPACE_GESTURE` et par #2449.22 au niveau « exécuter ».",
  },
  // #2449.15 — un diff CRM interne : la prévisualisation FIGÉE d'une écriture.
  internal_crm_diff: {
    point: '2449.15',
    realizedBy: 'modules/crm/crm-write-request-view.ts',
    why: "La demande d'écriture CRM montre l'état d'aujourd'hui et celui qui est proposé, FIGÉS au moment de la demande et jamais recalculés : c'est littéralement la « prévisualisation figée » que la doctrine exige quand aucun geste utilisateur n'a approuvé l'écriture. Le diff est préparé ; l'écriture, elle, attend.",
  },
}
