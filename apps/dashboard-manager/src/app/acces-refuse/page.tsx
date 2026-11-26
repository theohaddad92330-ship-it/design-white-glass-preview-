/**
 * L'écran qu'on voit quand son rôle ne suffit pas (#1669).
 *
 * Il existe pour que le refus soit une PHRASE et pas une page blanche : un
 * lecteur qui clique sur « Facturation » doit comprendre que ce n'est pas une
 * panne, et savoir à qui demander.
 */
export const dynamic = 'force-dynamic'

export default async function AccesRefusePage(props: { searchParams?: Promise<{ ecran?: string }> }) {
  const searchParams = await props.searchParams
  const ecran = searchParams?.ecran ?? ''

  return (
    <main className="wrap wrap--etroit">
      <h1>Accès refusé</h1>
      <p className="subtitle">
        Cet écran est réservé au rôle « propriétaire ». Ton rôle te donne accès au reste de la console, en lecture comme
        en action — seule la trésorerie est fermée.
      </p>
      {ecran ? (
        <p className="muted">
          Écran demandé : <code className="mono">{ecran}</code>
        </p>
      ) : null}
      <p className="muted">
        Si tu dois y accéder, demande à un propriétaire de changer ton rôle dans la liste d’accès du back-office.
      </p>
      <p>
        <a className="btn" href="/monitoring?view=cockpit">
          Retour au cockpit
        </a>
      </p>
    </main>
  )
}
