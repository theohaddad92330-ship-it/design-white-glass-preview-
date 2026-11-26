import type { AdminPromptRegistryDiffReport, AdminPromptRegistryReport } from '@/lib/admin'
import { libelleDiff, libelleVersion } from './prompt-registry-panel.logic'

/**
 * #2445.1 (épopée #2766) — REGISTRE DE PROMPTS, liste + version + DIFF entre
 * deux refs git + commande de ROLLBACK.
 *
 * Le registre lui-même vit sur l'IA (`app/prompts/registry.py`, GA-26) — cet
 * écran ne fait que le RENDRE, lecture seule. La version est un hash de
 * template (`prompt_registry_canonical_fingerprint`), pas un numéro
 * incrémental : deux lignes avec le même hash portent le même contenu.
 *
 * Le diff (`GET .../prompt-registry/:name/diff`) est un `git diff` du fichier
 * golden COMMITTÉ entre deux refs — jamais une seconde source de vérité. La
 * commande de rollback est RENDUE sous le diff, jamais exécutée : un rollback
 * de prompt reste un commit qu'un humain fait. Formulaire en GET (pas de
 * secret côté navigateur, pas de route API neuve) — le choix des refs vit
 * dans l'URL, rechargeable et partageable.
 */
export function PromptRegistryPanel({
  report,
  diff,
  refA,
  refB,
}: {
  report: AdminPromptRegistryReport
  diff: (AdminPromptRegistryDiffReport & { name: string }) | null
  refA: string
  refB: string
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Registre de prompts</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Chaque prompt enregistré et son hash de template actuel. Choisis un prompt et deux refs git pour voir le diff
        entre elles.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Prompt</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {report.prompts.map(prompt => (
              <tr key={prompt.name}>
                <td className="mono">{prompt.name}</td>
                <td className="mono">{libelleVersion(prompt.version)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form method="GET" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Prompt
          <select name="diffPrompt" defaultValue={diff?.name ?? ''}>
            <option value="" disabled>
              choisir…
            </option>
            {report.prompts.map(prompt => (
              <option key={prompt.name} value={prompt.name}>
                {prompt.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Depuis (réf. A)
          <input name="diffRefA" defaultValue={refA} placeholder="ex. HEAD~1" style={{ width: 120 }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Jusqu'à (réf. B)
          <input name="diffRefB" defaultValue={refB} placeholder="HEAD" style={{ width: 120 }} />
        </label>
        <button type="submit" className="btn-sm">
          Voir le diff
        </button>
      </form>
      {diff ? (
        diff.available ? (
          <div style={{ marginTop: 10 }}>
            <pre style={{ overflowX: 'auto', fontSize: 12 }}>{libelleDiff(diff.diff)}</pre>
            {diff.rollbackCommand.length > 0 ? (
              <>
                <p className="subtitle" style={{ margin: '8px 0 4px' }}>
                  Commande de rollback — affichée, jamais exécutée ici :
                </p>
                <pre className="mono" style={{ overflowX: 'auto', fontSize: 12 }}>
                  {diff.rollbackCommand.join(' ')}
                </pre>
              </>
            ) : null}
          </div>
        ) : (
          <p className="error" style={{ marginTop: 10 }}>
            L'IA n'a pas répondu — diff indisponible.
          </p>
        )
      ) : null}
    </section>
  )
}
