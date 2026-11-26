import type { AdminRightsMatrixReport } from '@/lib/admin'
import { compterParPermission, courtPermission, trierParOutil } from './rights-matrix-panel.logic'

/**
 * #2445.4 (épopée #2766) — LA MATRICE DES DROITS, par outil du copilote.
 *
 * Le classement vit sur l'IA (`app/services/tool_permissions.py`, déménagé
 * hors de `tests/test_copilote_security_eval.py` ce lot pour qu'un service
 * applicatif puisse le lire sans importer `tests.*`, GA-26) — cet écran ne
 * fait que le RENDRE, lecture seule.
 *
 * ⚠️ Ni rôle ni plan : #2445.4 demandait une matrice croisée plan/rôle/
 * connecteur, mais aucun des deux n'existe côté produit aujourd'hui — un
 * outil déclaré est visible par TOUT utilisateur authentifié, sur TOUT plan
 * (vérifié : `chat_tools.py` ne lit ni rôle ni plan avant d'exposer un outil
 * au modèle). C'est cohérent avec la doctrine « le rôle change l'ORDRE,
 * jamais le CONTENU » (c76) — l'écran le DIT plutôt que d'inventer deux
 * colonnes vides.
 */
export function RightsMatrixPanel({ report }: { report: AdminRightsMatrixReport }) {
  const tools = trierParOutil(report.tools)
  const compte = compterParPermission(report.tools)

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Matrice des droits</h2>
      <p className="subtitle" style={{ marginBottom: 4 }}>
        Ce que chaque outil du copilote peut faire — lecture, proposition (le clic de la personne exécute) ou dépense de
        crédits.
      </p>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {compte.lecture} lecture · {compte.proposition} proposition · {compte.dépense} dépense — {tools.length} outils
        au total. Ni rôle ni plan ne filtrent ce contenu aujourd&apos;hui (doctrine c76 : le rôle change l&apos;ordre,
        jamais le contenu).
      </p>
      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Outil</th>
              <th>Permission</th>
            </tr>
          </thead>
          <tbody>
            {tools.map(({ tool, permission }) => (
              <tr key={tool}>
                <td className="mono">{tool}</td>
                <td>
                  <span className={`badge ${courtPermission(permission) === 'dépense' ? 'completed' : ''}`}>
                    {courtPermission(permission)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
