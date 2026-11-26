import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3417 (retour bêta 30/09, fiche contact) — le CONTENU de la bibliothèque :
 * un modèle par scénario (les dix de l'issue), premier pas de séquence.
 *
 * Table de RÉFÉRENCE, pas de contenu de démo : `outreach_approved_templates`
 * n'a ni `workspace_id` ni `user_id` (voir la migration de création), donc
 * cette ligne existe IDENTIQUEMENT en démo et en production — pas de seed
 * séparé dans `DemoSeedService` (craft rule n°9 satisfaite par construction :
 * rien à « remplir aussi en démo » quand la table n'est pas scopée par
 * espace).
 *
 * Textes VOLONTAIREMENT génériques (aucune affirmation non prouvable — la
 * même exigence que `OUTREACH_WRITING_RULES`) : ce sont des points de départ
 * éditables, pas des messages finaux. Seul `approche_froide` NOMME un signal
 * récent, donc lui seul porte `recent_signal` en preuve obligatoire — les
 * neuf autres ne réclament aucune preuve pour rester « prêts à envoyer ».
 * Variables : uniquement `{{prenom}}`/`{{entreprise}}`, les deux seules que
 * `ApprovedMessageTemplateService` sait résoudre dans cette tranche.
 */
export class OutreachApprovedTemplatesSeed1796409452648 implements MigrationInterface {
  name = 'OutreachApprovedTemplatesSeed1796409452648'

  readonly rows: Array<{
    scenario: string
    channel: string
    exact_text: string
    required_evidence: string[]
  }> = [
    {
      scenario: 'invitation_acceptee',
      channel: 'linkedin',
      exact_text:
        "Merci d'avoir accepté la connexion, {{prenom}}. Je travaille sur des sujets proches de ceux de {{entreprise}} — ravi d'échanger si l'occasion se présente.",
      required_evidence: [],
    },
    {
      scenario: 'connexion_dormante',
      channel: 'linkedin',
      exact_text:
        'Bonjour {{prenom}}, cela fait un moment — je voulais reprendre contact au sujet de {{entreprise}}. Où en êtes-vous sur vos priorités actuelles ?',
      required_evidence: [],
    },
    {
      scenario: 'contact_recommande',
      channel: 'linkedin',
      exact_text:
        "Bonjour {{prenom}}, on m'a suggéré de vous contacter au sujet de {{entreprise}}. Je serais curieux d'échanger sur vos priorités actuelles.",
      required_evidence: [],
    },
    {
      scenario: 'approche_froide',
      channel: 'linkedin',
      exact_text:
        "Bonjour {{prenom}}, j'ai repéré un signal récent chez {{entreprise}} qui a retenu mon attention. Est-ce un sujet d'actualité pour vous en ce moment ?",
      required_evidence: ['recent_signal'],
    },
    {
      scenario: 'contexte_partenaire',
      channel: 'email',
      exact_text:
        'Bonjour {{prenom}}, je vous contacte dans le cadre d’un partenariat avec {{entreprise}} — je souhaitais échanger sur les points de recoupement entre nos activités.',
      required_evidence: [],
    },
    {
      scenario: 'appel_sans_contexte',
      channel: 'phone',
      exact_text:
        'Bonjour {{prenom}}, je vous appelle au sujet de {{entreprise}} — avez-vous deux minutes pour un échange rapide ?',
      required_evidence: [],
    },
    {
      scenario: 'prospection_inversee_consultant',
      channel: 'linkedin',
      exact_text:
        'Bonjour {{prenom}}, je vous contacte car un profil consultant pourrait correspondre à un besoin chez {{entreprise}} — seriez-vous la bonne personne pour en discuter ?',
      required_evidence: [],
    },
    {
      scenario: 'objections_client',
      channel: 'email',
      exact_text:
        'Bonjour {{prenom}}, je comprends la réserve exprimée. Je voulais revenir vers vous pour clarifier ce point avec {{entreprise}} et voir si cela change la donne.',
      required_evidence: [],
    },
    {
      scenario: 'objections_consultant',
      channel: 'email',
      exact_text:
        'Bonjour {{prenom}}, à propos de la réserve soulevée sur le profil proposé : je voulais apporter un complément d’information pour {{entreprise}}.',
      required_evidence: [],
    },
    {
      scenario: 'cloture_elegante',
      channel: 'email',
      exact_text:
        'Bonjour {{prenom}}, je clos ce fil pour l’instant — n’hésitez pas à revenir vers nous chez {{entreprise}} si le sujet redevient d’actualité. Bonne continuation.',
      required_evidence: [],
    },
  ]

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of this.rows) {
      await queryRunner.query(
        `INSERT INTO outreach_approved_templates
           (scenario, channel, sequence_step, delay_days, source, exact_text, variables, required_evidence, forbidden_claims)
         VALUES ($1, $2, 1, 0, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
        [
          row.scenario,
          row.channel,
          'méthode conquête ESN',
          row.exact_text,
          JSON.stringify(['prenom', 'entreprise']),
          JSON.stringify(row.required_evidence),
          JSON.stringify(['expertise reconnue', 'méthodologie éprouvée']),
        ],
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM outreach_approved_templates WHERE source = 'méthode conquête ESN'`)
  }
}
