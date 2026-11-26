/**
 * Une adresse e-mail dans le back-office : TOUJOURS en clair (décision Louis
 * 04/10/2026, doctrine `c87_coordonnees_pro_toujours_en_clair`). Remplace
 * l'ancien masquage « révélé au clic » de #1670.4.
 *
 * `sansLien` : la relance de facture n'ouvre pas de `mailto:` — « on prépare,
 * l'humain envoie » — l'adresse s'y lit, sans geste d'envoi.
 */
export function EmailEnClair({ email, sansLien = false }: { email: string | null | undefined; sansLien?: boolean }) {
  const value = (email ?? '').trim()
  if (!value) return <span className="muted">—</span>
  if (sansLien) return <span className="mono">{value}</span>
  return (
    <a className="mono" href={`mailto:${value}`}>
      {value}
    </a>
  )
}
