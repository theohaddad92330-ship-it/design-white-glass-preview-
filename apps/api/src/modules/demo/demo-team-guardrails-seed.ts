/**
 * #4158 (lot L4) — la démonstration des garde-fous entre collègues (craft rule n°9).
 *
 * Les collègues fictifs viennent du lot L2 (`DEMO_COLLEAGUES`, créés par `seedColleagues`) :
 * ce module ne fabrique aucun compte et n'a aucun identifiant à lui — il PREND le premier
 * membre de l'espace qui est l'un d'eux. Il doit donc tourner APRÈS `seedColleagues`
 * (intégration passe 2 : appelé avant, il ne trouvait personne et ne semait rien).
 * Sans collègue, il ne fait RIEN (jamais une trace attribuée à quelqu'un qui n'existe pas).
 *
 * Il sème, avec ce collègue, ce que les écrans montrent :
 *  · #20 — une action récente sur un compte et sur un contact de Société Générale
 *    (« déjà travaillé par X ») ;
 *  · #21 — un message envoyé à ce contact il y a 5 jours (« contacté par X ») ;
 *  · #22 — une exclusion de domaine, avec motif et auteur ;
 *  · #23 — un consultant déjà positionné par ce collègue sur une opportunité du
 *    même client ;
 *  · #25 — ce collègue dans l'équipe du compte ;
 *  · #4996 L7 — la ZONE de ce collègue : deux entités de Société Générale (`account_team_scopes`),
 *    les plus fournies en contacts (`DEMO_SG_ZONE_ENTITY_LABELS`), libellé recopié du nom de l'entité ; le filtre « Mon périmètre »
 *    de l'onglet Contacts garde alors les contacts de ces entités et laisse les autres « hors périmètre ».
 *    Sans collègue : AUCUNE zone (jamais une répartition inventée pour le visiteur) ;
 *  · #4996.4 — et UNE zone de BU de l'espace (`DEMO_SG_ZONE_BUSINESS_UNIT`), libellé recopié du nom de la BU ;
 *  · G.9 — un dossier du compte vitrine marqué « Privé ».
 *
 * IDEMPOTENT : chaque écriture est gardée (`NOT EXISTS` / `ON CONFLICT`) ; la salle
 * se remet à neuf à chaque visite et ne doit jamais doubler une ligne.
 */
import { DEMO_COLLEAGUES, DEMO_SG_ZONE_BUSINESS_UNIT, DEMO_SG_ZONE_ENTITY_LABELS } from './demo-dataset'

type Queryable = { query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T> }

/** Le domaine exclu de la salle : fictif, il ne vise aucun contact semé. */
export const DEMO_DO_NOT_CONTACT_DOMAIN = 'client-en-litige.example'

/**
 * #4295.11 — le contact « ne pas contacter » de la 1re page de `/contacts` : un interlocuteur FICTIF de SNCF
 * (profil `demo-bellum-`), choisi par son profil et non par un tirage — le tirage tombait sur l'un des ~1 800
 * contacts de Société Générale, hors du chemin recommandé que la page ouvre. Voir `DEMO_DOSSIERS` (SNCF).
 */
export const DEMO_DO_NOT_CONTACT_LINKEDIN = 'https://www.linkedin.com/in/demo-bellum-gaetan-lemoine'

export async function seedTeamGuardrails(
  db: Queryable,
  input: {
    workspaceId: string
    ownerUserId: string
    /** Le compte vitrine (Société Générale), lu par le service de semis — `null` s'il n'existe pas. */
    accountId: string | null
    /** Un contact de ce compte, `null` s'il n'en a pas. */
    contactId: string | null
  },
): Promise<{ seeded: boolean }> {
  const { workspaceId, ownerUserId, accountId, contactId } = input
  if (!accountId) return { seeded: false }
  // G.9 (4158.70) — « Privé » se voit en salle : UN dossier du compte vitrine porte le switch coché (jamais tous).
  await db.query(
    `UPDATE opportunities SET is_private = true
      WHERE id = (SELECT id FROM opportunities WHERE workspace_id = $1 AND account_id = $2
                   ORDER BY first_detected_at DESC, id LIMIT 1)`,
    [workspaceId, accountId],
  )
  const colleagues = await db.query<{ user_id: string }[] | undefined>(
    `SELECT user_id FROM workspace_members
      WHERE workspace_id = $1 AND user_id <> $2 AND user_id = ANY($3::uuid[])
      ORDER BY created_at, user_id LIMIT 1`,
    [workspaceId, ownerUserId, DEMO_COLLEAGUES.map(colleague => colleague.userId)],
  )
  const colleagueId = colleagues?.[0]?.user_id

  // #4295.11 — la liste « ne pas contacter » ne dépend d'aucun collègue (`added_by` n'a pas de clé étrangère) :
  // la recette prod (19/10) la voyait vide dès que `seedColleagues` n'avait posé personne. Sans collègue fictif elle
  // est posée au nom du visiteur, qui existe ; le reste (#20, #21, #23, #25) exige le collègue.
  const dncAuthor = colleagueId ?? ownerUserId
  // #22 — une exclusion de domaine : motif et auteur lisibles dans Réglages › Ne pas contacter.
  await db.query(
    `INSERT INTO workspace_do_not_contact (workspace_id, kind, domain, reason, added_by)
     SELECT $1, 'domain', $2, 'Contentieux en cours : toute prise de contact passe par la direction.', $3
      WHERE NOT EXISTS (
        SELECT 1 FROM workspace_do_not_contact WHERE workspace_id = $1 AND domain = $2 AND lifted_at IS NULL)`,
    [workspaceId, DEMO_DO_NOT_CONTACT_DOMAIN, dncAuthor],
  )

  // R24-FIX-B (15/10) — /contacts en démo montrait aucun contact « Ne pas contacter » : le domaine ci-dessus
  // ne vise aucun contact semé. On exclut ici deux PERSONNES du compte vitrine (jamais celle que le collègue a
  // déjà contactée, #21 : deux garde-fous distincts), chacune avec son motif et l'auteur. Aucune coordonnée écrite.
  const doNotContactReasons = [
    'A demandé à ne plus être sollicité : décision confirmée par la direction.',
    'Contentieux en cours avec son service : toute prise de contact passe par la direction.',
  ]
  for (const [index, reason] of doNotContactReasons.entries()) {
    // #4295.11 — le premier motif vise le fictif de SNCF (visible d'emblée) ; le second garde le tirage du compte vitrine.
    // Une seule lecture de `contacts` (GA-405, gel à 1) : seul le critère et l'ordre changent.
    const pickBy = index === 0 ? 'c.linkedin_url = $5' : 'c.account_id = $5'
    const pickOrder = index === 0 ? '' : 'ORDER BY md5(c.id::text), c.id'
    const pickSql = `SELECT c.id FROM contacts c
            WHERE c.workspace_id = $1 AND ${pickBy} AND c.deleted_at IS NULL
              AND c.id <> $4
              AND NOT EXISTS (
                SELECT 1 FROM workspace_do_not_contact d
                 WHERE d.workspace_id = $1 AND d.contact_id = c.id AND d.lifted_at IS NULL)
            ${pickOrder}
            LIMIT 1`
    await db.query(
      `INSERT INTO workspace_do_not_contact (workspace_id, kind, contact_id, reason, added_by)
       SELECT $1, 'contact', pick.id, $3, $2
         FROM (${pickSql}) pick
       ON CONFLICT DO NOTHING`,
      // Les paramètres suivent la requête : Postgres refuse un `$n` que le texte ne cite pas.
      index === 0
        ? [
            workspaceId,
            dncAuthor,
            reason,
            contactId ?? '00000000-0000-0000-0000-000000000000',
            DEMO_DO_NOT_CONTACT_LINKEDIN,
          ]
        : [workspaceId, dncAuthor, reason, contactId ?? '00000000-0000-0000-0000-000000000000', accountId],
    )
  }

  if (!colleagueId) return { seeded: false }

  // #20 — une action de travail récente sur le compte, puis sur le contact.
  await db.query(
    `INSERT INTO user_actions (user_id, workspace_id, account_id, action_type, metadata, created_at)
     SELECT $1, $2, $3, 'message_sent', '{}'::jsonb, now() - interval '3 days'
      WHERE NOT EXISTS (
        SELECT 1 FROM user_actions WHERE user_id = $1 AND account_id = $3 AND contact_id IS NULL AND action_type = 'message_sent')`,
    [colleagueId, workspaceId, accountId],
  )
  if (contactId) {
    await db.query(
      `INSERT INTO user_actions (user_id, workspace_id, account_id, contact_id, action_type, metadata, created_at)
       SELECT $1, $2, $3, $4, 'message_sent', '{}'::jsonb, now() - interval '5 days'
        WHERE NOT EXISTS (
          SELECT 1 FROM user_actions WHERE user_id = $1 AND contact_id = $4 AND action_type = 'message_sent')`,
      [colleagueId, workspaceId, accountId, contactId],
    )
    // #21 — le même contact a reçu un message de ce collègue il y a 5 jours (envoi VÉRIFIÉ).
    await db.query(
      `INSERT INTO outreach_messages
         (workspace_id, user_id, contact_id, channel, intent, source, status, current_version, created_at, updated_at)
       SELECT $1, $2, $3, 'email', 'open_relationship', 'contacts', 'sent', 1,
              now() - interval '5 days', now() - interval '5 days'
        WHERE NOT EXISTS (
          SELECT 1 FROM outreach_messages WHERE user_id = $2 AND contact_id = $3 AND status = 'sent')`,
      [workspaceId, colleagueId, contactId],
    )
  }

  // #23 — un consultant que ce collègue a déjà positionné chez le même client.
  await db.query(
    `INSERT INTO submissions
       (workspace_id, project_id, consultant_id, stage, stage_entered_at, submitted_at, owner_id)
     SELECT $1::uuid, pick.project_id, pick.consultant_id, 'submitted', now() - interval '9 days', now() - interval '9 days', $3::uuid
       FROM (
         SELECT o.id AS project_id, c.id AS consultant_id
           FROM opportunities o
          CROSS JOIN consultants c
          WHERE o.workspace_id = $1 AND o.account_id = $2 AND o.kind = 'besoin' AND c.workspace_id = $1
            AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.project_id = o.id AND s.consultant_id = c.id)
          ORDER BY md5(o.id::text || c.id::text)
          LIMIT 1
       ) pick
     ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO NOTHING`,
    [workspaceId, accountId, colleagueId],
  )

  // #25 — le collègue fait partie de l'équipe du compte (en plus du responsable).
  await db.query(
    `INSERT INTO account_team_members (workspace_id, account_id, user_id, added_by)
     SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM account_team_members WHERE account_id = $2 AND user_id = $3 AND removed_at IS NULL)`,
    [workspaceId, accountId, colleagueId, ownerUserId],
  )

  // #4996 L7 — la zone du collègue : les deux entités de Société Générale qui portent le plus de contacts
  // (`DEMO_SG_ZONE_ENTITY_LABELS`, jamais la division d'accueil). Le libellé est le nom de l'entité, recopié ;
  // une entité ne se pose qu'une fois par membre actif (l'index unique partiel le dit aussi en base). Le visiteur
  // n'a aucune zone : sans zone un membre couvre « tout le compte ».
  await db.query(
    `INSERT INTO account_team_scopes (workspace_id, account_id, user_id, entity_id, label, added_by)
     SELECT $1, $2, $3, e.id, e.name, $4
       FROM account_entities e
      WHERE e.workspace_id = $1 AND e.account_id = $2 AND e.is_default = false
        AND lower(btrim(e.name)) = ANY($5::text[])
        AND length(btrim(e.name)) BETWEEN 2 AND 120
        AND NOT EXISTS (
          SELECT 1 FROM account_team_scopes s
           WHERE s.account_id = $2 AND s.user_id = $3 AND s.entity_id = e.id AND s.removed_at IS NULL)
      ORDER BY e.name, e.id`,
    [workspaceId, accountId, colleagueId, ownerUserId, [...DEMO_SG_ZONE_ENTITY_LABELS]],
  )

  // #4996.4 — la zone de BU du collègue : une BU de CET espace, cherchée par son nom (semée par `seedBusinessUnits`,
  // qui tourne avant). Une ligne = une BU, jamais une entité en même temps ; une BU une fois par membre actif.
  await db.query(
    `INSERT INTO account_team_scopes (workspace_id, account_id, user_id, entity_id, business_unit_id, label, added_by)
     SELECT $1, $2, $3, NULL, b.id, b.name, $4
       FROM business_units b
      WHERE b.workspace_id = $1 AND b.name = $5 AND b.status = 'active'
        AND length(btrim(b.name)) BETWEEN 2 AND 120
        AND NOT EXISTS (
          SELECT 1 FROM account_team_scopes s
           WHERE s.account_id = $2 AND s.user_id = $3 AND s.business_unit_id = b.id AND s.removed_at IS NULL)
      LIMIT 1`,
    [workspaceId, accountId, colleagueId, ownerUserId, DEMO_SG_ZONE_BUSINESS_UNIT],
  )

  return { seeded: true }
}
