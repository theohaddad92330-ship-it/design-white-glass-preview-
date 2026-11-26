import { Fragment } from 'react'

/** Les coupures d'un morceau : après chaque « . », jamais au milieu d'un mot. */
function WithDotBreaks({ text }: { text: string }) {
  return (
    <>
      {text.split(/(?<=\.)/).map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  )
}

/**
 * Recette 21/10 A.5 — une adresse e-mail se lit EN ENTIER (règle du 04/10, e-mails toujours en clair) et ne se coupe
 * qu'à « @ » ou après « . » (`<wbr>`), jamais au milieu d'un mot (`break-all` coupait « associe » en deux).
 * Le texte copié/sélectionné reste l'adresse exacte : `<wbr>` n'ajoute aucun caractère.
 *
 * #4503 (recette prod 25/10, « carrefour. / com ») — la coupure passe D'ABORD par « @ » : la partie locale et
 * « @domaine » sont deux blocs insécables, bornés à la largeur de la colonne. Un bloc ne se recoupe à ses points que
 * s'il ne tient pas seul sur une ligne.
 */
export function EmailWithBreaks({ email }: { email: string }) {
  const at = email.lastIndexOf('@')
  if (at <= 0) return <WithDotBreaks text={email} />
  return (
    <>
      <span className="inline-block max-w-full">
        <WithDotBreaks text={email.slice(0, at)} />
      </span>
      <wbr />
      <span className="inline-block max-w-full">
        <WithDotBreaks text={email.slice(at)} />
      </span>
    </>
  )
}
