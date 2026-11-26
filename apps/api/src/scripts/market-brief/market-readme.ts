import type { MarketBrief } from '@bellum/contracts'

import type { convertMarketWorkbook } from './market-engine'
type MarketConversion = ReturnType<typeof convertMarketWorkbook>

/** README de couverture des briefs de marché : par zone, ce que chaque onglet est devenu, ce qui a été écarté et pourquoi. */
export const renderMarketReadme = (
  reports: readonly { slug: string; brief: MarketBrief; conversion: MarketConversion }[],
): string => {
  const out: string[] = [
    '# Briefs de marché de la salle de démonstration',
    '',
    'Générés par `pnpm --filter @bellum/api convert:market-brief` depuis les classeurs de `agent_docs/sources/briefs-comptes-2026-10-04/`',
    '(`MARCHE_LILLE_MEEDZ`, `MARCHE_NANTES_SAINT_NAZAIRE`, `META_MARCHE_LYON_SUISSE`). **Ne jamais éditer à la main.** Aucune donnée',
    'inventée : tout vient d’une cellule des classeurs ; ce que le contrat ne porte pas est listé ici avec sa raison.',
    '',
  ]
  for (const { slug, brief, conversion } of reports) {
    out.push(`## ${brief.zone.label} — \`${slug}.json\``, '')
    out.push(
      `Périmètre : ${brief.zone.scope === 'france' ? `départements ${brief.zone.departments.join(', ')}` : `cantons ${brief.zone.cantons.join(', ')}`}.`,
      `${brief.clients?.length ?? 0} clients · ${brief.esn.length} ESN · ${brief.people.length} personnes (en clair, D5) · ${brief.sections.length} sections · ${brief.guardrails.length} garde-fous.`,
      '',
      '| Onglet | Destination | Lignes | Note |',
      '| --- | --- | ---: | --- |',
    )
    for (const line of conversion.coverage) {
      out.push(`| ${line.sheet} | ${line.destination} | ${line.rows} | ${line.note ?? ''} |`)
    }
    const skipped = Object.entries(conversion.skipped)
    if (skipped.length) {
      out.push('', 'Écarté (jamais en silence) :', '')
      for (const [reason, count] of skipped) out.push(`- ${reason} — ${count}`)
    }
    out.push('')
  }
  return `${out.join('\n').trimEnd()}\n`
}
