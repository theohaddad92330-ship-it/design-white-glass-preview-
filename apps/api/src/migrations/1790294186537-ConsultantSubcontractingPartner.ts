import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * E-09 — « un sous-traitant porte toujours son partenaire », tenu par la BASE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INVARIANT, ET SEULEMENT LUI
 * ─────────────────────────────────────────────────────────────────────────────
 * `engagement_kind = 'sous_traitance'` ⇒ `partner_account_id IS NOT NULL`.
 *
 * Ce n'est pas une opinion : l'application le tient déjà en TypeScript, et à
 * trois endroits qui disent tous la même chose —
 * `engagementNeedsPartner` / `missingPartnerForEngagement`
 * (`packages/contracts/src/schemas/consultant.ts:62` et `:258`),
 * `assertPartnerForSubcontracting` qui refuse en 400 sur `POST /consultants` et
 * `PUT /consultants/:id` (`consultants.controller.ts:141`), et le formulaire qui
 * pose la question avant d'envoyer (`consultantForm.ts:172`). Le SQL était le
 * seul à ne rien en savoir : `partner_account_id` est arrivé simplement
 * `nullable`, sans contrainte (`1789561203847-TalentEngagementAndRates:70`).
 *
 * ⚠️ La contrainte est à SENS UNIQUE, et c'est délibéré. La réciproque —
 * « une autre nature n'a JAMAIS de partenaire » — n'est vraie que dans l'écran,
 * qui remet le champ à `null` en changeant d'engagement. L'API, elle, accepte
 * `partner_account_id` avec n'importe quel `engagement_kind` : personne ne le
 * lui interdit. Écrire l'équivalence rejetterait donc en production des lignes
 * que le produit accepte aujourd'hui — une contrainte devinée est pire que pas
 * de contrainte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `NOT VALID`
 * ─────────────────────────────────────────────────────────────────────────────
 * `migration:run:prod` est le `preDeployCommand` de Railway : un `ADD CONSTRAINT`
 * qui échoue ABANDONNE le déploiement et laisse l'ancienne image en ligne, sans
 * que rien ne le dise (c'est le défaut fondateur de GA-11). Or des lignes en
 * violation sont PRODUCTIBLES aujourd'hui, et pas seulement en théorie : jusqu'à
 * cette même modification, un `PUT /consultants/:id` portant
 * `{ partner_account_id: null }` SANS `engagement_kind` traversait la garde du
 * contrôleur — `missingPartnerForEngagement` rend `false` quand l'engagement est
 * absent du corps — et vidait le partenaire d'une fiche déjà sous-traitante.
 * Le nombre de lignes concernées n'a pas pu être mesuré : la base de production
 * n'est pas joignable depuis le poste de développement.
 *
 * `NOT VALID` tranche sans deviner : PostgreSQL applique la contrainte à toutes
 * les ÉCRITURES (c'est le trou d'E-09 : « un INSERT direct passe ») et se
 * contente de ne pas relire l'existant. La validation est ensuite TENTÉE, dans
 * un bloc qui survit à son échec — si aucune ligne n'est en violation, la
 * contrainte devient pleinement valide ; sinon le déploiement passe quand même,
 * et un avertissement nomme le travail restant.
 *
 * Mesuré le 28/08/2026 sur une instance PostgreSQL 16 jetable, table minimale
 * reproduisant les colonnes en jeu : ligne en violation insérable AVANT (1) ;
 * `ADD CONSTRAINT … NOT VALID` accepté malgré elle ; `VALIDATE` seul ÉCHOUE tant
 * qu'elle est là (c'est le déploiement abandonné qu'on évite) ; après la
 * contrainte, `INSERT` sous-traitant sans partenaire REFUSÉ (colonne à `NULL`
 * comme colonne omise), `UPDATE` qui vide le partenaire REFUSÉ, sous-traitant
 * AVEC partenaire accepté, les quatre autres natures acceptées sans partenaire,
 * et `freelance` + partenaire accepté (le sens unique). Après réparation à la
 * main, `VALIDATE` rend `convalidated = true`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON NE RÉPARE RIEN TOUT SEUL
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun `UPDATE` de reprise, contrairement à l'habitude de ce dossier, et pour
 * une raison de doctrine : inventer un partenaire est une donnée fictive, et
 * rétrograder `engagement_kind` effacerait une saisie humaine — « une correction
 * humaine gagne toujours ». Une fiche sous-traitante sans partenaire dit
 * exactement ce qu'elle sait : on ignore qui la porte. C'est à un humain de le
 * dire, pas à une migration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE : ON RESSERRE, DONC LE CODE D'ABORD
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle du dépôt (« la contrainte s'élargit AVANT le code qui écrit la
 * valeur ») s'inverse quand on resserre. Le chemin qui pouvait écrire une ligne
 * en violation est fermé dans le même commit, sur la ligne FUSIONNÉE, par
 * `ConsultantsService.update` — sans quoi la base renverrait un `23514` que
 * l'utilisateur lirait 500 au lieu d'une phrase.
 */
export class ConsultantSubcontractingPartner1790294186537 implements MigrationInterface {
  public name = 'ConsultantSubcontractingPartner1790294186537'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rejouable, et surtout : reposer la contrainte est le geste qui la
    // re-valide après une réparation manuelle des lignes héritées.
    await queryRunner.query(`
      ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_subcontracting_partner_check
    `)

    // `IS DISTINCT FROM` et non `<>` : sur une colonne nulle, `<>` rend NULL, un
    // CHECK nul PASSE, et la contrainte serait permissive par accident plutôt
    // que par décision. `engagement_kind` est `NOT NULL DEFAULT 'inconnu'` —
    // l'écrire quand même coûte zéro et survit à une colonne qui changerait.
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD CONSTRAINT consultants_subcontracting_partner_check
        CHECK (engagement_kind IS DISTINCT FROM 'sous_traitance' OR partner_account_id IS NOT NULL)
        NOT VALID
    `)

    // La validation relit toute la table : c'est le seul geste de cette
    // migration qui peut échouer sur l'existant, donc le seul qu'on enveloppe.
    // Sans ce gestionnaire on aurait rétabli, un ordre plus loin, exactement le
    // déploiement abandonné que le `NOT VALID` vient d'éviter.
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TABLE consultants VALIDATE CONSTRAINT consultants_subcontracting_partner_check;
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING 'consultants_subcontracting_partner_check reste NOT VALID : des fiches portent engagement_kind = sous_traitance sans partner_account_id. Toutes les ECRITURES sont deja gardees ; les lignes heritees se reparent a la main (renseigner le partenaire, ou corriger l engagement), puis cette migration rejouee les validera.';
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Retirer une contrainte n'échoue jamais sur des données : le retour arrière
    // n'a rien à réparer.
    await queryRunner.query(
      `ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_subcontracting_partner_check`,
    )
  }
}
