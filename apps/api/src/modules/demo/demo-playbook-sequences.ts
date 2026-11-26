import type { OutreachPlaybookKey, OutreachSequenceStatus, OutreachStepStatus } from '@bellum/contracts'

/**
 * Lot L-C (#4166, craft rule n°9) — LES SÉQUENCES NÉES D'UN MODÈLE, SEMÉES.
 *
 * La bibliothèque « Partir d'un modèle » est statique, donc déjà pleine en
 * démo ; ce qu'il faut semer, c'est le RÉSULTAT : des séquences créées depuis un
 * modèle, avec les étapes du modèle (nature, libellé et intention viennent du
 * CONTRAT, jamais recopiés ici). Elles sont écrites comme le fait la création
 * réelle : étapes libres (pas de `template_key`), délais en jours OUVRÉS,
 * aucune étiquette de campagne (une séquence reste mono-contact, c74).
 *
 * ⚠️ Des contacts DISTINCTS de ceux de `DEMO_OUTREACH_PLAN` : une seconde
 * séquence active sur le même contact serait une collision de sollicitation
 * (c'est le cas de Lorenzo Bini Smaghi, semé exprès ailleurs). Et ACTIVES, pas
 * terminées : la routine de clôture CRM compte les séquences terminées.
 */
export const DEMO_PLAYBOOK_SEQUENCES: readonly {
  contact: string
  playbook: OutreachPlaybookKey
  status: OutreachSequenceStatus
  /**
   * #5029 — le consultant en intercontrat que la séquence PROPOSE (nom complet d'un
   * `DEMO_CONSULTANTS`), résolu dans l'espace de la salle ; absent ⇒ la séquence saute.
   */
  consultant?: string
  /** L'état de chaque étape, dans l'ordre du modèle (un plan plus court que le modèle est refusé par la spec si vide, pas s'il est partiel). */
  steps: readonly { status: OutreachStepStatus; offsetDays: number; outcome?: string }[]
}[] = [
  {
    // Un poste ouvert chez le client : e-mail fait, invitation acceptée, le message est dû aujourd'hui.
    contact: 'Pierre Palmieri',
    playbook: 'hiring_signal',
    status: 'active',
    steps: [
      { status: 'done', offsetDays: -6 },
      { status: 'done', offsetDays: -5, outcome: 'accepted' },
      { status: 'pending', offsetDays: 0 },
      { status: 'pending', offsetDays: 4 },
      { status: 'pending', offsetDays: 8 },
    ],
  },
  {
    // Après un rendez-vous : le compte rendu est parti, la ressource promise suit.
    contact: 'Inès Morvan',
    playbook: 'after_meeting',
    status: 'active',
    steps: [
      { status: 'done', offsetDays: -4 },
      { status: 'pending', offsetDays: 0 },
      { status: 'pending', offsetDays: 3 },
      { status: 'pending', offsetDays: 8 },
    ],
  },
  {
    // #5029 — « Proposer ce profil » depuis le Reverse Market de Camille Roussel (disponible tout de
    // suite) : UN contact de Société Générale, le premier e-mail préparé avec le profil ANONYMISÉ, à
    // relire. Le Reverse Market de Camille dit « Déjà proposé à ce compte ».
    contact: 'Laurent Hinschberger',
    playbook: 'bench_consultant',
    status: 'active',
    consultant: 'Camille Roussel',
    steps: [
      { status: 'pending', offsetDays: 0 },
      { status: 'pending', offsetDays: 1 },
      { status: 'pending', offsetDays: 3 },
    ],
  },
]
