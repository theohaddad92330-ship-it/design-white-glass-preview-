import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3417 (recette prod 01/10) — « Aucun modèle approuvé pour ce scénario et ce
 * canal » pour cinq scénarios sur dix en e-mail. CAUSE : la première graine
 * (`OutreachApprovedTemplatesSeed`) ne posait qu'UN canal par scénario ; un
 * commercial qui choisit l'e-mail pour une invitation acceptée tombait sur du
 * vide. Cette migration complète : chaque scénario a désormais un modèle en
 * e-mail ET en LinkedIn (le téléphone et la messagerie vocale ne s'écrivent
 * pas : les modèles restent ceux de la première graine).
 *
 * Mêmes règles que la première graine : table de référence non scopée (donc
 * identique en démo), textes génériques sans affirmation non prouvable, seul
 * `approche_froide` exige un signal récent, variables `{{prenom}}` et
 * `{{entreprise}}` seulement. Idempotente : `WHERE NOT EXISTS`.
 */
export class OutreachApprovedTemplatesEveryChannel1796417894263 implements MigrationInterface {
  name = 'OutreachApprovedTemplatesEveryChannel1796417894263'

  readonly rows: ReadonlyArray<{
    scenario: string
    channel: 'email' | 'linkedin'
    exact_text: string
    required_evidence: string[]
  }> = [
    {
      scenario: 'invitation_acceptee',
      channel: 'email',
      exact_text:
        "Bonjour {{prenom}}, merci d'avoir accepté ma demande de connexion. Je travaille sur des sujets proches de ceux de {{entreprise}} — ravi d'échanger si l'occasion se présente.",
      required_evidence: [],
    },
    {
      scenario: 'connexion_dormante',
      channel: 'email',
      exact_text:
        'Bonjour {{prenom}}, cela fait un moment que nous ne nous sommes pas parlé — je voulais reprendre contact au sujet de {{entreprise}}. Où en êtes-vous sur vos priorités actuelles ?',
      required_evidence: [],
    },
    {
      scenario: 'contact_recommande',
      channel: 'email',
      exact_text:
        "Bonjour {{prenom}}, on m'a suggéré de vous écrire au sujet de {{entreprise}}. Je serais curieux d'échanger sur vos priorités actuelles.",
      required_evidence: [],
    },
    {
      scenario: 'approche_froide',
      channel: 'email',
      exact_text:
        "Bonjour {{prenom}}, j'ai repéré un signal récent chez {{entreprise}} qui a retenu mon attention. Est-ce un sujet d'actualité pour vous en ce moment ?",
      required_evidence: ['recent_signal'],
    },
    {
      scenario: 'appel_sans_contexte',
      channel: 'email',
      exact_text:
        'Bonjour {{prenom}}, je vous écris au sujet de {{entreprise}} — auriez-vous quelques minutes cette semaine pour un échange rapide ?',
      required_evidence: [],
    },
    {
      scenario: 'prospection_inversee_consultant',
      channel: 'email',
      exact_text:
        'Bonjour {{prenom}}, un profil consultant pourrait correspondre à un besoin chez {{entreprise}} — seriez-vous la bonne personne pour en discuter ?',
      required_evidence: [],
    },
    {
      scenario: 'contexte_partenaire',
      channel: 'linkedin',
      exact_text:
        'Bonjour {{prenom}}, je vous contacte dans le cadre d’un partenariat avec {{entreprise}} — ravi d’échanger sur les points de recoupement entre nos activités.',
      required_evidence: [],
    },
    {
      scenario: 'objections_client',
      channel: 'linkedin',
      exact_text:
        'Bonjour {{prenom}}, je comprends la réserve exprimée. Je voulais clarifier ce point avec {{entreprise}} et voir si cela change la donne.',
      required_evidence: [],
    },
    {
      scenario: 'objections_consultant',
      channel: 'linkedin',
      exact_text:
        'Bonjour {{prenom}}, à propos de la réserve soulevée sur le profil proposé : je voulais apporter un complément d’information pour {{entreprise}}.',
      required_evidence: [],
    },
    {
      scenario: 'cloture_elegante',
      channel: 'linkedin',
      exact_text:
        'Bonjour {{prenom}}, je clos cet échange pour l’instant — n’hésitez pas à revenir vers nous chez {{entreprise}} si le sujet redevient d’actualité. Bonne continuation.',
      required_evidence: [],
    },
  ]

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of this.rows) {
      await queryRunner.query(
        `INSERT INTO outreach_approved_templates
           (scenario, channel, sequence_step, delay_days, source, exact_text, variables, required_evidence, forbidden_claims)
         SELECT $1::text, $2::text, 1, 0, $3::text, $4::text, $5::jsonb, $6::jsonb, $7::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM outreach_approved_templates
            WHERE scenario = $1::text AND channel = $2::text AND status = 'active' AND sequence_step = 1)`,
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
    for (const row of this.rows) {
      await queryRunner.query(
        `DELETE FROM outreach_approved_templates
          WHERE scenario = $1 AND channel = $2 AND source = 'méthode conquête ESN' AND exact_text = $3`,
        [row.scenario, row.channel, row.exact_text],
      )
    }
  }
}
