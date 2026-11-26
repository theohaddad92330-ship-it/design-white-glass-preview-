#!/usr/bin/env python3
"""
Rend la mesure d'avancement en une page HTML publiable.

Séparé de `mesure.py` à dessein : la mesure doit rester vérifiable sans passer
par la mise en page, et la mise en page ne doit jamais pouvoir corriger un
chiffre. Ce programme ne CALCULE rien — il met en forme ce qu'on lui donne.

    python3 tools/avancement/mesure.py | python3 tools/avancement/rendu.py > page.html
"""
from __future__ import annotations
import html, json, sys
from datetime import date

ETAT_LABEL = {'tenue': 'tenue', 'ouverte': 'ouverte', 'inconnu': 'à lire'}


def esc(x) -> str:
    return html.escape(str(x), quote=True)


def nb(n) -> str:
    """Un nombre lisible — et « non mesuré » quand il n'y en a pas.

    Jamais « 0 » : dans ce dépôt, une absence affichée en zéro est un défaut à
    part entière. La question à se poser sur chaque valeur absente est « si
    elle manque, est-ce que 0 est VRAI ? ». Ici, non.
    """
    if n is None:
        return '<span class="inconnu">non ventilé</span>'
    return f'{n:,}'.replace(',', ' ')


def barre(couvertes, relevees, approche: bool, detail: str = '') -> str:
    """La jauge — et JAMAIS une coche.

    Un document à 93 % n'est pas un document clos : il lui reste 9 exigences dues.
    Afficher une coche, un « terminé » ou une barre pleine serait un chiffre
    inventé à l'écran — exactement ce que ce dépôt s'interdit. On montre donc le
    pourcentage ET ses deux termes, pour que ce qui reste dû reste visible.
    """
    if couvertes is None or not relevees:
        return '<span class="inconnu">—</span>'
    pct = round(couvertes / relevees * 100)
    return (
        f'<span class="barre" role="img" aria-label="{pct} % des exigences closes'
        f'{f", {couvertes} sur {relevees}" if detail else ""}">'
        f'<span class="barre-remplie" style="width:{pct}%"></span></span>'
        f'<span class="pct{" approche" if approche else ""}">{pct} %</span>'
        + (f'<span class="fraction">{detail}</span>' if detail else '')
    )


def main() -> int:
    d = json.load(sys.stdin)
    fichiers = d['fichiers']
    groupes = d['groupes']
    cert = d['certificat']
    tenues = sum(1 for c in cert if c['etat'] == 'tenue')

    lignes = []
    for f in fichiers:
        g = groupes.get(f['groupe'] or '', {})
        approche = f['cle'] in (g.get('relevees_approchees') or [])
        volume = ('<span class="inconnu">—</span>' if f['unites'] is None
                  else f'{nb(f["unites"])} <span class="unite">{esc(f["unite"])}</span>')
        # ⚠️ DEUX GRAINS DE LECTURE, ET IL FAUT LE DIRE.
        #
        # La passe B a relevé 129 exigences pour PDF-02 ; le recomptage de
        # clôture en trouve 128, parce qu'il lit au grain ligne/puce et exclut
        # les récapitulatifs. Afficher « 93 % » à côté d'un « 129 relevées »
        # sans autre mot laisserait croire à une correction silencieuse — ou
        # pire, ferait calculer 119/129 au lecteur. La colonne « Mesure » nomme
        # donc d'où sort chaque ligne, et la jauge montre ses DEUX termes.
        rec = f.get('recomptage')
        if rec:
            couvertes, denom = rec['clos'], rec['total']
            detail = f"{rec['clos']} / {rec['total']}"
            mesure_src = ('<abbr class="src-recomptage" title="La source relue EN ENTIER contre le '
                          'code : un statut n\'est LIVRÉ qu\'avec un fichier:ligne ET un appelant '
                          'réel. Grain ligne/puce, récapitulatifs exclus.">'
                          + esc(rec['source']) + '</abbr>')
            reste = ' · '.join(f'{v} {k.lower()}' for k, v in rec['restant'].items())
            reste_html = f'<span class="reste">reste dû : {esc(reste)}</span>' if reste else ''
        else:
            couvertes, denom, detail = f['couvertes'], f['exigences_relevees'], ''
            mesure_src = '<span class="src-passeb">passe B</span>'
            reste_html = ''
        lignes.append(f"""
      <tr>
        <td class="nom"><span class="cle">{esc(f['cle'] or '—')}</span><span class="fichier">{esc(f['nom'])}</span></td>
        <td class="chiffre">{volume}</td>
        <td class="chiffre">{nb(f['exigences_relevees'])}{'<span class="tilde" title="ordre de grandeur, pas un compte exact">≈</span>' if approche else ''}</td>
        <td class="chiffre">{nb(couvertes)}</td>
        <td class="chiffre">{nb(f['non_mentionnees'])}</td>
        <td class="jauge">{barre(couvertes, denom, approche, detail)}{reste_html}</td>
        <td class="groupe">{mesure_src}</td>
      </tr>""")

    grp = []
    for k, v in groupes.items():
        if not v.get('lisible'):
            continue
        grp.append(f"""
      <tr>
        <td class="nom"><span class="cle">groupe {esc(k)}</span><span class="fichier">{esc(v['fichier'])}</span></td>
        <td class="chiffre">{nb(v.get('relevees'))}</td>
        <td class="chiffre">{nb(v.get('couvertes'))}</td>
        <td class="chiffre">{nb(v.get('non_mentionnees'))}</td>
        <td class="chiffre">{nb(v.get('incertains'))}</td>
        <td class="jauge">{barre(v.get('couvertes'), v.get('relevees'), False)}</td>
      </tr>""")

    preuves = []
    for c in cert:
        preuves.append(f"""
      <li class="preuve {esc(c['etat'])}">
        <span class="preuve-n">{c['n']}</span>
        <span class="preuve-nom">{esc(c['preuve'])}</span>
        <span class="preuve-etat">{esc(ETAT_LABEL[c['etat']])}</span>
        <p class="preuve-detail">{esc(c['detail'])}</p>
      </li>""")

    st = d['statuts']['total']
    total_st = sum(st.values()) or 1
    ordre = ['LIVRÉ', 'ABSENT', 'NON PROUVÉ', 'PÉRIMÉ', 'REFUSÉ', 'À VÉRIFIER']
    classes = {'LIVRÉ': 'livre', 'ABSENT': 'absent', 'NON PROUVÉ': 'nonprouve',
               'PÉRIMÉ': 'perime', 'REFUSÉ': 'refuse', 'À VÉRIFIER': 'averifier'}
    segments = ''.join(
        f'<span class="seg {classes[k]}" style="flex:{st.get(k, 0)}" title="{esc(k)} : {st.get(k, 0)}"></span>'
        for k in ordre if st.get(k))
    legende = ''.join(
        f'<li><span class="puce {classes[k]}"></span>{esc(k.lower())}<b>{st.get(k, 0)}</b></li>'
        for k in ordre if st.get(k))

    lus = sum(1 for f in fichiers if f['cle'])
    print(GABARIT.format(
        date=date.today().strftime('%d/%m/%Y'),
        commit=esc(d['commit']),
        tracker=esc(d['tracker']),
        chantier=esc(d['chantier']),
        fichiers_lus=lus,
        fichiers_total=len(fichiers),
        tenues=tenues,
        preuves_total=len(cert),
        lignes=''.join(lignes),
        groupes=''.join(grp),
        preuves=''.join(preuves),
        segments=segments,
        legende=legende,
        statuts_total=total_st,
    ))
    return 0


GABARIT = r"""<title>Manifeste du 26 août</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
  :root {{
    --ground:#F3F6F4; --surface:#FFFFFF; --surface-2:#F8FAF9;
    --ink:#111716; --muted:#5B6764; --faint:#8A9793; --line:#DCE4E1;
    --accent:#22335C; --accent-soft:#E7ECF5;
    --livre:#2C6E49; --absent:#8E3B32; --nonprouve:#8C5F0E; --perime:#585770;
    --refuse:#4B4B46; --averifier:#6B6F6E;
    --serif:'Newsreader',Georgia,'Times New Roman',serif;
    --sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
    --mono:'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,monospace;
  }}
  @media (prefers-color-scheme: dark) {{
    :root:not([data-theme="light"]) {{
      --ground:#0E1312; --surface:#151B19; --surface-2:#1A211F;
      --ink:#E6EDEA; --muted:#93A19D; --faint:#6E7C78; --line:#232C2A;
      --accent:#8FB0E6; --accent-soft:#1B2436;
      --livre:#63B98A; --absent:#D98279; --nonprouve:#D6A44A; --perime:#9E9CBB;
      --refuse:#9A9A92; --averifier:#9AA3A1;
    }}
  }}
  :root[data-theme="dark"] {{
    --ground:#0E1312; --surface:#151B19; --surface-2:#1A211F;
    --ink:#E6EDEA; --muted:#93A19D; --faint:#6E7C78; --line:#232C2A;
    --accent:#8FB0E6; --accent-soft:#1B2436;
    --livre:#63B98A; --absent:#D98279; --nonprouve:#D6A44A; --perime:#9E9CBB;
    --refuse:#9A9A92; --averifier:#9AA3A1;
  }}
  * {{ box-sizing:border-box; }}
  body {{
    margin:0; background:var(--ground); color:var(--ink);
    font-family:var(--sans); font-size:15px; line-height:1.55;
    -webkit-font-smoothing:antialiased;
  }}
  .page {{ max-width:1120px; margin:0 auto; padding:clamp(24px,5vw,64px) clamp(16px,4vw,40px) 96px; }}

  header {{ display:flex; flex-direction:column; gap:14px; padding-bottom:28px; border-bottom:2px solid var(--ink); }}
  .eyebrow {{
    font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase;
    color:var(--muted); display:flex; flex-wrap:wrap; gap:6px 18px;
  }}
  h1 {{
    font-family:var(--serif); font-weight:600; font-size:clamp(30px,5.2vw,50px);
    line-height:1.06; margin:0; text-wrap:balance; letter-spacing:-.015em;
  }}
  .chapeau {{ max-width:62ch; color:var(--muted); margin:0; font-size:16px; }}

  .bandeau {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px;
              background:var(--line); border:1px solid var(--line); margin:32px 0 0; }}
  .bandeau div {{ background:var(--surface); padding:16px 18px; }}
  .bandeau dt {{ font-family:var(--mono); font-size:10.5px; letter-spacing:.12em; text-transform:uppercase;
                 color:var(--muted); margin:0 0 6px; }}
  .bandeau dd {{ margin:0; font-family:var(--serif); font-size:26px; font-weight:600;
                 font-variant-numeric:tabular-nums; line-height:1.1; }}
  .bandeau dd small {{ font-family:var(--sans); font-size:13px; font-weight:400; color:var(--muted); }}

  h2 {{ font-family:var(--serif); font-size:24px; font-weight:600; margin:56px 0 6px; letter-spacing:-.01em; }}
  h2 + .note {{ margin:0 0 20px; color:var(--muted); max-width:64ch; font-size:14px; }}

  .cadre {{ overflow-x:auto; border:1px solid var(--line); background:var(--surface); }}
  table {{ width:100%; border-collapse:collapse; font-size:13.5px; min-width:720px; }}
  thead th {{
    font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
    color:var(--muted); text-align:right; padding:12px 14px; border-bottom:1px solid var(--line);
    background:var(--surface-2); font-weight:600; white-space:nowrap;
  }}
  thead th:first-child, tbody td.nom {{ text-align:left; }}
  tbody td {{ padding:11px 14px; border-bottom:1px solid var(--line); text-align:right;
              font-variant-numeric:tabular-nums; vertical-align:middle; }}
  tbody tr:last-child td {{ border-bottom:0; }}
  tbody tr:hover td {{ background:var(--surface-2); }}
  td.nom {{ line-height:1.3; }}
  .cle {{ display:block; font-family:var(--mono); font-size:12.5px; font-weight:600; }}
  .fichier {{ display:block; color:var(--faint); font-size:11.5px; word-break:break-word; }}
  .unite {{ color:var(--faint); font-size:11px; }}
  .inconnu {{ color:var(--faint); font-style:italic; font-size:12px; }}
  .tilde {{ color:var(--faint); margin-left:3px; font-family:var(--mono); }}
  .groupe {{ font-family:var(--mono); font-size:11.5px; color:var(--muted); }}
  td.jauge {{ display:flex; align-items:center; gap:9px; justify-content:flex-end; }}
  .barre {{ display:block; width:86px; height:7px; background:var(--line); overflow:hidden; }}
  .barre-remplie {{ display:block; height:100%; background:var(--accent); }}
    /* La fraction sous la jauge : 119 / 128. Elle existe parce qu'un
       pourcentage seul se lit comme un verdict, alors que « 119 / 128 » se lit
       comme un état — et laisse voir les 9 qui restent. */
    .fraction {{ display:block; font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; }}
    .reste {{ display:block; font-size:11px; color:var(--absent); margin-top:2px; }}
    .src-recomptage {{ font-size:11.5px; border-bottom:1px dotted var(--line); cursor:help; }}
    .src-passeb {{ font-size:11.5px; color:var(--muted); }}
  .pct {{ font-family:var(--mono); font-size:12px; min-width:38px; text-align:right; }}
  .pct.approche {{ color:var(--muted); }}

  .repartition {{ display:flex; height:14px; border:1px solid var(--line); overflow:hidden; }}
  .seg {{ display:block; }}
  .seg.livre {{ background:var(--livre); }} .seg.absent {{ background:var(--absent); }}
  .seg.nonprouve {{ background:var(--nonprouve); }} .seg.perime {{ background:var(--perime); }}
  .seg.refuse {{ background:var(--refuse); }} .seg.averifier {{ background:var(--averifier); }}
  ul.legende {{ list-style:none; display:flex; flex-wrap:wrap; gap:8px 22px; padding:14px 0 0; margin:0;
                font-family:var(--mono); font-size:11.5px; color:var(--muted); }}
  ul.legende li {{ display:flex; align-items:center; gap:7px; }}
  ul.legende b {{ color:var(--ink); font-variant-numeric:tabular-nums; }}
  .puce {{ width:9px; height:9px; display:block; }}
  .puce.livre {{ background:var(--livre); }} .puce.absent {{ background:var(--absent); }}
  .puce.nonprouve {{ background:var(--nonprouve); }} .puce.perime {{ background:var(--perime); }}
  .puce.refuse {{ background:var(--refuse); }} .puce.averifier {{ background:var(--averifier); }}

  ol.preuves {{ list-style:none; padding:0; margin:0; display:grid; gap:1px; background:var(--line);
                border:1px solid var(--line); }}
  li.preuve {{ background:var(--surface); padding:14px 18px;
               display:grid; grid-template-columns:auto 1fr auto; gap:4px 14px; align-items:baseline; }}
  li.preuve.ouverte {{ background:var(--accent-soft); }}
  .preuve-n {{ font-family:var(--mono); font-size:11px; color:var(--faint); }}
  .preuve-nom {{ font-weight:500; }}
  .preuve-etat {{ font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; }}
  li.preuve.tenue .preuve-etat {{ color:var(--livre); }}
  li.preuve.ouverte .preuve-etat {{ color:var(--nonprouve); }}
  .preuve-detail {{ grid-column:2/-1; margin:2px 0 0; color:var(--muted); font-size:12.5px; max-width:78ch; }}

  footer {{ margin-top:64px; padding-top:20px; border-top:1px solid var(--line);
            color:var(--faint); font-size:12px; font-family:var(--mono); }}
  @media (max-width:640px) {{
    li.preuve {{ grid-template-columns:auto 1fr; }}
    .preuve-etat {{ grid-column:2; }}
    .preuve-detail {{ grid-column:1/-1; }}
  }}
</style>

<div class="page">
  <header>
    <p class="eyebrow"><span>{chantier}</span><span>commit {commit}</span><span>{date}</span></p>
    <h1>Ce qui reste dans l’archive</h1>
    <p class="chapeau">Un fichier par ligne, et ce qui n’a pas pu être ventilé le dit
      plutôt que d’afficher zéro. Chaque nombre est relu à l’exécution depuis
      <code>{tracker}</code> et la passe B — aucun n’est recopié à la main.</p>
  </header>

  <dl class="bandeau">
    <div><dt>Fichiers de l’archive</dt><dd>{fichiers_total}<small> / tous ouverts</small></dd></div>
    <div><dt>Documents porteurs</dt><dd>{fichiers_lus}<small> inventoriés</small></dd></div>
    <div><dt>Preuves du certificat</dt><dd>{tenues}<small> / {preuves_total} tenues</small></dd></div>
    <div><dt>Lignes statuées</dt><dd>{statuts_total}<small> contre le code</small></dd></div>
  </dl>

  <h2>Le manifeste, fichier par fichier</h2>
  <p class="note">« Relevées » est ce que la passe B a extrait du document ; « couvertes » ce que le
    tracker mentionnait déjà ; « non mentionnées » ce qu’il ignorait. Les trois ne s’additionnent pas :
    il reste des rapprochements incertains, comptés au groupe. Un pourcentage n’est affiché que
    lorsque les deux termes sont ventilés — et <strong>jamais déduit par soustraction</strong>.</p>
  <p class="note"><strong>La colonne « Mesure » dit d’où sort chaque ligne, et ce n’est pas un détail :
    les deux sources ne lisent pas au même grain.</strong> La passe B relève au fil du document ;
    le recomptage de clôture relit la source EN ENTIER contre le code, au grain ligne/puce,
    récapitulatifs exclus — d’où <em>129 relevées</em> d’un côté et <em>128</em> de l’autre pour le
    même PDF-02. Ce n’est pas une correction silencieuse : c’est deux façons de compter, et la jauge
    affiche donc toujours ses deux termes plutôt qu’un pourcentage nu.
    Un document n’est jamais marqué « clos » ni coché ici : <strong>93 % veut dire que 9 exigences
    restent dues</strong>, et elles sont nommées sous la jauge.</p>
  <div class="cadre">
    <table>
      <thead><tr>
        <th>Document</th><th>Volume</th><th>Relevées</th><th>Couvertes</th>
        <th>Non mentionnées</th><th>Couverture</th><th>Mesure</th>
      </tr></thead>
      <tbody>{lignes}</tbody>
    </table>
  </div>

  <h2>Par groupe de lecture</h2>
  <p class="note">Sept agents, sept documents de passe B, chacun avec la consigne inversée : chercher
    ce que la source demande et que le tracker ne mentionne <em>nulle part</em>. C’est à ce niveau que
    les comptes sont complets — la ventilation par document dépend de ce que chaque agent a détaillé.</p>
  <div class="cadre">
    <table>
      <thead><tr>
        <th>Groupe</th><th>Relevées</th><th>Couvertes</th><th>Non mentionnées</th>
        <th>Incertains</th><th>Couverture</th>
      </tr></thead>
      <tbody>{groupes}</tbody>
    </table>
  </div>

  <h2>Ce que la vérification contre le code a rendu</h2>
  <p class="note">⚠️ Ce sont les statuts posés <b>ligne à ligne</b> dans les tableaux de statuage.
    Les items traités en BLOC (« les douze suivants sont absents ») n’y sont pas comptés : ce n’est
    donc pas le total de la source, et le récapitulatif de chaque fichier reste la référence.
    Un compte qui prétendrait au total serait un chiffre inventé.</p>
  <p class="note">Chaque ligne de statuage porte un verdict prouvé par <code>fichier:ligne</code>.
    « Absent » n’est pas une dette : c’est ce que la source contient et que le produit ne fait pas,
    dont une part est refusée ailleurs avec sa raison.</p>
  <div class="repartition">{segments}</div>
  <ul class="legende">{legende}</ul>

  <h2>Le certificat d’épuisement</h2>
  <p class="note">Une archive ne se marque <code>DONE</code> que sur ces dix preuves. Dans le doute,
    on ne l’écrit pas : une archive marquée à tort coûte un item perdu pour toujours, parce que
    personne ne rouvre une archive terminée.</p>
  <ol class="preuves">{preuves}</ol>

  <footer>Généré par <code>tools/avancement/mesure.py | tools/avancement/rendu.py</code> —
    relancer la commande régénère la page depuis le dépôt.</footer>
</div>
"""

if __name__ == '__main__':
    sys.exit(main())
