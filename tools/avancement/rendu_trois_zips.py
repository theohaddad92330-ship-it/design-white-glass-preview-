#!/usr/bin/env python3
"""Insère la vue des TROIS zip en tête de la page d'avancement.

La page existante mesure le dossier du 26 août, fichier par fichier — elle
reste, elle est juste. Ce qui manquait, c'est la ligne au-dessus : Louis suit
trois chantiers, et une page qui n'en montre qu'un fait croire que les deux
autres dorment.

⚠️ Deux règles tenues ici, les mêmes que dans le produit :
  · ce qu'on ne sait pas compter s'écrit « non compté », jamais « 0 » ;
  · quand deux comptes se contredisent, on rend LES DEUX et on le dit.

Usage : rendu.py < mesure.json > page.html ; puis
        rendu_trois_zips.py page.html trois_zips.json > page_finale.html
"""

from __future__ import annotations

import html
import json
import sys
from pathlib import Path

ANCRE = '  </header>'

STYLE = """
  /* — la vue des trois chantiers — */
  .zips { display:grid; grid-template-columns:repeat(auto-fit,minmax(268px,1fr)); gap:1px;
          background:var(--line); border:1px solid var(--line); margin:32px 0 0; }
  .zip { background:var(--surface); padding:18px 20px 20px; display:flex; flex-direction:column; gap:10px; }
  .zip-titre { font-family:var(--serif); font-size:19px; font-weight:600; line-height:1.2; margin:0; }
  .zip-sous { color:var(--muted); font-size:12.5px; margin:0; }
  .zip dl { margin:6px 0 0; display:grid; gap:6px; }
  .zip .l { display:flex; justify-content:space-between; align-items:baseline; gap:12px;
            border-top:1px dotted var(--line); padding-top:6px; }
  .zip .l:first-child { border-top:0; padding-top:0; }
  .zip .k { color:var(--muted); font-size:12px; line-height:1.3; }
  .zip .v { font-family:var(--mono); font-size:14px; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .zip .v.rien { color:var(--faint); font-style:italic; font-size:11.5px; font-family:var(--sans); }
  .zip .ecart { color:var(--nonprouve); font-size:11.5px; border-top:1px solid var(--line);
                padding-top:8px; margin:2px 0 0; }
  .zip .src { font-family:var(--mono); font-size:10.5px; color:var(--faint); word-break:break-all; margin:auto 0 0; }
"""


def valeur(v: object) -> str:
    """Un nombre, ou « non compté ». Jamais « 0 » pour une absence de mesure."""
    if v is None:
        return '<span class="v rien">non compté</span>'
    return f'<span class="v">{v:,}</span>'.replace(',', ' ')


def carte(z: dict) -> str:
    lignes = ''.join(
        f'<div class="l"><span class="k">{html.escape(m["nom"])}</span>{valeur(m["valeur"])}</div>'
        for m in z['mesures']
    )
    ecart = f'<p class="ecart">⚠️ {html.escape(z["ecart"])}</p>' if z.get('ecart') else ''
    return (
        f'<div class="zip">'
        f'<h3 class="zip-titre">{html.escape(z["titre"])}</h3>'
        f'<p class="zip-sous">{html.escape(z["sous_titre"])}</p>'
        f'<dl>{lignes}</dl>{ecart}'
        f'<p class="src">{html.escape(z["tracker"])}</p>'
        f'</div>'
    )


def table_24(z: dict) -> str:
    if not z.get('detail'):
        return ''
    corps = ''
    for a in z['detail']:
        ouv, att = a['ouverts'], a['a_ouvrir']
        # Un rapport qui n'a pas tout ouvert se voit : c'est la première chose
        # que la règle zéro demande de vérifier.
        complet = ouv is not None and att is not None and ouv == att
        cellule = (
            f'{ouv} / {att}' if ouv is not None and att is not None else '<span class="inconnu">non dit</span>'
        )
        if not complet and ouv is not None:
            cellule = f'<span style="color:var(--absent)">{cellule}</span>'
        trous = a['trous_en_tableau'] or a['trous_declares']
        corps += (
            f'<tr><td class="nom"><span class="cle">{html.escape(a["nom"])}</span></td>'
            f'<td>{cellule}</td><td>{valeur(trous)}</td></tr>'
        )
    return (
        '<h2>Les onze archives du 24 août, une par une</h2>'
        '<p class="note">Les marques « DONE » ont été retirées le 29/08 : chaque archive a été '
        'rouverte par une passe B à consigne inversée — partir de la matière brute, chercher ce que '
        'la source demande et que le tracker ne mentionne nulle part. Un rapport dont les trous ne '
        'sont pas en tableau est marqué « non compté », jamais « 0 ».</p>'
        '<div class="cadre"><table><thead><tr>'
        '<th>Archive</th><th>Fichiers ouverts</th><th>Trous</th>'
        '</tr></thead><tbody>' + corps + '</tbody></table></div>'
    )


def main() -> int:
    page = Path(sys.argv[1]).read_text(encoding='utf-8')
    data = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    zips = data['zips']

    bloc = (
        '<h2>Les trois chantiers</h2>'
        '<p class="note">Trois zip en cours de front. Ils ne se lisent pas de la même façon — '
        'l’un a un tracker à recomptages, l’autre un inventaire d’exigences, le troisième onze '
        'passes B — donc chacun est mesuré avec son propre compteur, et aucun total ne les '
        'additionne : les recouvrements ne sont pas déduplicables.</p>'
        '<div class="zips">' + ''.join(carte(z) for z in zips) + '</div>'
    )
    z24 = next((z for z in zips if z['cle'] == '24-aout'), None)
    if z24:
        bloc += table_24(z24)

    if ANCRE not in page:
        print('ancre introuvable dans la page', file=sys.stderr)
        return 1
    page = page.replace('</style>', STYLE + '</style>', 1)
    page = page.replace(ANCRE, ANCRE + '\n' + bloc, 1)
    sys.stdout.write(page)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
