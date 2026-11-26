import type { DemoChart } from '@/features/demo/demo-chat-script'

/**
 * ⚠️ CE COMPOSANT A SURVÉCU À SA COQUE — #1320, arbitrage de Louis du 03/09.
 *
 * Il vivait dans `DemoChat.tsx`, l'écran parallèle du copilote en démonstration.
 * Cet écran a disparu : `/chat` rend maintenant la coque RÉELLE pour tout le
 * monde et seul le MOTEUR change. Le graphe, lui, reste — c'est ce qu'un
 * prospect voit quand il demande « où en est mon portefeuille », et le retirer
 * aurait appauvri la démonstration au moment même où on la rapproche du produit.
 *
 * Il est rendu par `MessageBubble`, dans le fil, sous le texte de la réponse.
 *
 * Une seule série (donc pas de légende : le titre nomme la mesure), barres
 * horizontales parce que les libellés sont des noms d'entreprises, valeur
 * écrite en bout de barre plutôt qu'un axe à décoder. Les textes portent les
 * jetons de texte, jamais la couleur de la série.
 */
export function DemoBarChart({ chart }: { chart: DemoChart }) {
  const max = Math.max(...chart.bars.map(bar => bar.value), 1)

  return (
    <figure className="mt-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <figcaption className="text-xs font-semibold text-[var(--bellum-text-primary)]">{chart.title}</figcaption>
      <div className="mt-3 flex flex-col gap-2">
        {chart.bars.map(bar => (
          <div
            key={bar.label}
            className="flex items-center gap-3"
            title={`${bar.label} : ${bar.value} ${bar.unit ?? ''}`.trim()}
          >
            <span className="w-32 shrink-0 truncate text-xs text-[var(--bellum-text-secondary)]">{bar.label}</span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* #1907.7 — `rounded-r` rend les mêmes 4 px qu'avant, mais par le nom de l'échelle (GA-250). */}
              <div
                className="h-2.5 rounded-r bg-[var(--bellum-primary-500)]"
                style={{ width: `${Math.round((bar.value / max) * 100)}%` }}
                role="img"
                aria-label={`${bar.label} : ${bar.value} ${bar.unit ?? ''}`.trim()}
              />
              <span className="shrink-0 text-xs font-medium tabular-nums text-[var(--bellum-text-primary)]">
                {bar.value}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--bellum-text-muted)]">{chart.caption}</p>
    </figure>
  )
}
