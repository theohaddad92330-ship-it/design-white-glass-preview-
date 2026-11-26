import { DEMO_COLLEAGUES } from './demo-dataset'

/**
 * #4158.14 — la boîte d'ÉQUIPE de la salle de démonstration.
 *
 * Un prospect qui ouvre la cloche doit voir ce que le mode équipe change : un
 * collègue lui attribue un compte, lui délègue une action, le mentionne. Les
 * collègues sont FICTIFS, et c'est assumé ici seulement (craft rule n°9 —
 * décision Louis 14/10, tracker #4158 § 1 : « l'espace démo reçoit des
 * collègues fictifs »).
 *
 * Les auteurs sont les collègues fictifs de L2 (`DEMO_COLLEAGUES`, #4158.13) : cette
 * liste en est la SEULE source d'identifiants (un test le prouve). La boîte ne
 * fabrique aucun id : elle en désigne deux par leur clé.
 */
const colleagueByKey = (key: string): { userId: string; name: string } => {
  const colleague = DEMO_COLLEAGUES.find(candidate => candidate.key === key)
  if (!colleague) throw new Error(`Collègue fictif inconnu : ${key}`)
  return { userId: colleague.userId, name: `${colleague.first_name} ${colleague.last_name}` }
}

type DemoTeamInboxRow = {
  type: 'account_assigned' | 'action_delegated' | 'team_mention'
  title: string
  link: string | null
  actorUserId: string
  /** Âge de la notification, en millisecondes avant « maintenant ». */
  ageMs: number
  read: boolean
}

const HOUR = 60 * 60 * 1000

/**
 * Les lignes de la boîte d'équipe. Un lien n'est écrit que si le compte visé
 * existe dans la salle : jamais un lien deviné (GA-18/GA-19).
 */
export function buildDemoTeamInboxRows(accountIds: ReadonlyMap<string, string>): DemoTeamInboxRow[] {
  const camille = colleagueByKey('lea')
  const julien = colleagueByKey('karim')
  const accountLink = (company: string): string | null => {
    const id = accountIds.get(company)
    return id ? `/accounts/${id}` : null
  }
  return [
    {
      type: 'account_assigned',
      title: `${camille.name} t'a attribué le compte SNCF`,
      link: accountLink('SNCF'),
      actorUserId: camille.userId,
      ageMs: 3 * HOUR,
      read: false,
    },
    {
      type: 'action_delegated',
      title: `${julien.name} t'a délégué une action sur Société Générale`,
      link: accountLink('Société Générale'),
      actorUserId: julien.userId,
      ageMs: 5 * HOUR,
      read: false,
    },
    {
      type: 'team_mention',
      title: `${camille.name} t'a mentionné dans un commentaire d'équipe`,
      link: accountLink('Société Générale') ?? '/team',
      actorUserId: camille.userId,
      ageMs: 20 * HOUR,
      read: false,
    },
    {
      type: 'account_assigned',
      title: `${julien.name} t'a attribué le compte Groupe BPCE`,
      link: accountLink('Groupe BPCE'),
      actorUserId: julien.userId,
      ageMs: 3 * 24 * HOUR,
      read: true,
    },
  ]
}
