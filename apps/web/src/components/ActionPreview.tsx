/**
 * Extrait de `features/chat/view/PendingActions.tsx` (défaut d'intégration
 * GA-86, #2166.56) — la carte « ce que cette action va faire » y était une
 * fonction locale, non exportée. `AnalyzeSelectionDialog.tsx` (analyse en LOT
 * depuis Découvrir) est un second appelant légitime, et GA-26 interdit de
 * recopier un composant plutôt que de le partager (« un réglage vit à un seul
 * endroit »). Extraction pure — comportement et rendu inchangés — pour ne pas
 * tirer dans `AnalyzeSelectionDialog.tsx` le reste des dépendances (CRM,
 * mailbox, Pipedrive…) que `PendingActions.tsx` importe par ailleurs.
 */
export function ActionPreview({ rows, title }: { rows: { label: string; value: string }[]; title: string }) {
  if (rows.length === 0) return null
  return (
    // `section` + `aria-label` : le tableau descriptif reste un `dl` (c'est bien
    // une liste de définitions), mais un `dl` ne porte pas de nom accessible —
    // l'encadrer en région le rend annonçable et repérable.
    <section
      aria-label={title}
      className="mt-2.5 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2.5 py-2"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(row => (
          <div key={row.label} className="contents">
            <dt className="text-xs text-[var(--bellum-text-muted)]">{row.label}</dt>
            <dd className="min-w-0 break-words text-xs text-[var(--bellum-text-secondary)]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
