#!/usr/bin/env python3
"""
Mesure l'avancement d'un chantier, FICHIER PAR FICHIER, en relisant la source
et la passe B — jamais en recopiant un total écrit à la main.

Pourquoi un script et pas un tableau : « un total de tracker est un argument ».
Six comptes faux en un jour, tous écrits de bonne foi. Ici, chaque nombre a un
chemin de fichier derrière lui, et ce qui n'a pas pu être mesuré est rendu
`null` — jamais estimé, jamais rempli à zéro.

Sortie : du JSON sur stdout. Le rendu HTML est un autre programme (`rendu.py`),
pour que la mesure reste vérifiable sans passer par la mise en page.
"""
from __future__ import annotations
import json, os, re, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def chemin(var: str, defaut: str) -> Path:
    """Un chemin réglable, parce qu'un chantier n'est pas l'autre.

    Et parce que la source est GITIGNORÉE : depuis un worktree d'intégration,
    elle est absente alors que le tracker à jour, lui, y est. Les trois chemins
    se règlent donc séparément.
    """
    return Path(os.environ[var]) if os.environ.get(var) else REPO / defaut


SOURCE = chemin('AVANCEMENT_SOURCE', 'agent_docs/sources/dossier-26-aout')
PASSEB = chemin('AVANCEMENT_PASSEB', 'agent_docs/passe-b-dossier-26-aout')
TRACKER = chemin('AVANCEMENT_TRACKER', 'agent_docs/dossier-26-aout-2026.md')

# Quel groupe de passe B couvre quel document. Écrit à la main UNE fois, parce
# que c'est un fait de découpage, pas une mesure — et vérifié par le script :
# tout fichier de la source qui n'est dans aucun groupe est signalé.
GROUPES = {
    'A': ['PDF-01', 'PDF-02', 'PDF-03'],
    'B': ['PDF-04', 'PDF-05', 'PDF-06'],
    'C': ['PDF-07', 'PDF-08', 'PDF-09'],
    'D': ['PDF-10', 'PDF-11', 'PDF-12', 'PDF-13'],
    'E': ['PDF-14', 'PDF-15', 'PDF-16', 'PDF-17'],
    'F': ['PDF-18', 'PDF-19', 'PDF-20', 'PDF-21', 'PDF-22', 'LISEZ-MOI', 'SOMMAIRE'],
    'G-images': ['images-produit-cible'],
}
FICHIER_GROUPE = {'G-images': 'passeB-groupe-G-images.md'}


def lire(p: Path) -> str:
    return p.read_text(encoding='utf-8') if p.exists() else ''


def entetes_de_groupe() -> dict:
    """Les comptes que chaque agent de passe B a écrits dans son propre entête.

    On lit le TEXTE de l'entête, pas un résumé : `Exigences relevées : **384**
    (PDF-01 : 119 · …)`. Les formulations diffèrent d'un groupe à l'autre — sept
    agents, sept plumes —, d'où plusieurs motifs. Ce qu'aucun motif n'attrape
    reste `null`.
    """
    out = {}
    for g in GROUPES:
        f = PASSEB / FICHIER_GROUPE.get(g, f'passeB-groupe-{g}.md')
        t = lire(f)
        if not t:
            out[g] = {'fichier': f.name, 'lisible': False}
            continue
        bloc = t[t.find('## Comptage'):][:2600]

        def n(motif):
            m = re.search(motif, bloc)
            return int(m.group(1).replace(' ', '').replace(' ', '')) if m else None

        par_doc = {}
        approx: set[str] = set()
        m = re.search(r'Exigences relevées\s*:?\s*\*{0,2}(\d+)\*{0,2}\*{0,2}\s*\(([^)]*)\)', bloc)
        if m:
            for k, v in re.findall(r'(PDF-\d{2})\s*:?\s*≈?\s*(\d+)', m.group(2)):
                par_doc[k] = int(v)
        for k, v in re.findall(r'^\s*[-·]?\s*(?:\*\*)?(PDF-\d{2})[^:\n]*:\s*(\d+)\s*$', bloc, re.M):
            par_doc.setdefault(k, int(v))
        for k, v in re.findall(r'`(LISEZ-MOI|SOMMAIRE)`\s*(\d+)', bloc):
            par_doc[k] = int(v)
        for k, v in re.findall(r'`(PDF-\d{2})`\s*(\d+)', bloc):
            par_doc.setdefault(k, int(v))
        # « Répartition : PDF-10 ≈ 232 · PDF-11 ≈ 176 … » — le groupe D compte
        # en ordres de grandeur et le dit avec un ≈. On garde le nombre ET le
        # fait qu'il est approché : un « environ » qui perd son signe devient
        # un chiffre exact que personne n'a mesuré.
        m3 = re.search(r'Répartition\s*:\s*([^\n]*(?:\n[^\n-][^\n]*)*)', bloc)
        if m3:
            for k, v in re.findall(r'(PDF-\d{2})\s*[:≈]\s*≈?\s*(\d+)', m3.group(1)):
                par_doc.setdefault(k, int(v))
            approx.update(k for k, _ in re.findall(r'(PDF-\d{2})\s*≈?\s*:?\s*≈\s*(\d+)', m3.group(1)))

        def par_doc_de(motif):
            m2 = re.search(motif, bloc)
            if not m2:
                return None
            trouve = dict((k, int(v)) for k, v in re.findall(r'(PDF-\d{2})\s*:?\s*≈?\s*(\d+)', m2.group(1)))
            return trouve or None

        out[g] = {
            'fichier': f.name,
            'lisible': True,
            'couvertes_par_doc': par_doc_de(r'Couvert[es]*\s+par le tracker[^:]*:\s*\*{0,2}\d+\*{0,2}\s*\(([^)]*)\)'),
            'non_mentionnees_par_doc': par_doc_de(r'NON MENTIONNÉ[ES]*\s+nulle part\s*:?\s*\*{0,2}\s*\d+\*{0,2}\s*\(([^)]*)\)'),
            'relevees': n(r'Exigences relevées\s*:?\s*\*{0,2}(\d+)') or n(r'relevés? après déduplication\s*:?\s*\*{0,2}(\d+)'),
            'couvertes': n(r'Couvert[es]*\s+par le tracker[^:]*:\s*\*{0,2}(\d+)'),
            'non_mentionnees': n(r'NON MENTIONNÉ[ES]*\s+nulle part\s*:?\s*\*{0,2}\s*(\d+)'),
            'incertains': n(r'[Rr]approchements incertains\s*:?\s*\*{0,2}(\d+)'),
            'relevees_par_doc': par_doc or None,
            'relevees_approchees': sorted(approx) or None,
        }
    return out


def statuts_verifies() -> dict:
    """Les statuts posés par la vérification CONTRE LE CODE.

    On ne compte que les lignes de TABLEAU (`| … |`) des fichiers de statuage :
    une occurrence du mot « LIVRÉ » dans une phrase n'est pas un statut.
    """
    mots = ('LIVRÉ', 'ABSENT', 'NON PROUVÉ', 'PÉRIMÉ', 'À VÉRIFIER', 'REFUSÉ')
    recap = re.compile(rf'^(?:{"|".join(re.escape(m) for m in mots)})(?:\s*\(.*\))?$')
    total = {m: 0 for m in mots}
    par_fichier = {}
    for f in sorted(PASSEB.glob('*.md')):
        if f.name == 'README.md' or f.name.startswith('passeB-'):
            continue
        c = {m: 0 for m in mots}
        lignes = lire(f).split('\n')
        for i, ligne in enumerate(lignes):
            if not ligne.startswith('|'):
                continue
            # Une ligne d'EN-TÊTE de tableau nomme les colonnes — donc TOUS les
            # statuts d'un coup. On la reconnaît à son trait de séparation.
            suivante = lignes[i + 1] if i + 1 < len(lignes) else ''
            if re.match(r'^\|[\s:|-]+\|?\s*$', suivante):
                continue
            cellules = [x.strip() for x in ligne.strip().strip('|').split('|')]
            if not cellules:
                continue
            # Une ligne de RÉCAPITULATIF porte le statut seul en première colonne
            # (« | **LIVRÉ** | **71** | »). Elle compte les items, elle n'en est
            # pas un : la compter faisait dire « À VÉRIFIER : 9 » à un tracker
            # qui écrit « À VÉRIFIER = 0 ».
            if recap.match(cellules[0].replace('**', '').strip()):
                continue
            # Un statut BARRÉ est un statut RETIRÉ (« ~~NON PROUVÉ~~ → LIVRÉ »),
            # et un statut cité en ITALIQUE est un renvoi (« voir À VÉRIFIER »),
            # pas le statut de cette ligne-là.
            ligne = re.sub(r'~~.*?~~', '', ligne)
            ligne = re.sub(r'_\(.*?\)_', '', ligne)
            for m in mots:
                if re.search(rf'\b{re.escape(m)}\b', ligne):
                    c[m] += 1
        if any(c.values()):
            par_fichier[f.name] = c
            for m in mots:
                total[m] += c[m]
    return {'total': total, 'par_fichier': par_fichier, 'declares': recaps_declares(mots)}


def recaps_declares(mots) -> dict:
    """Les totaux que les fichiers de statuage DÉCLARENT dans leur récapitulatif.

    On les lit pour les CROISER avec le compte ligne à ligne, jamais pour les
    remplacer : « un total de tracker est un argument ». Quand les deux
    divergent, c'est la divergence elle-même qui est l'information — le compte
    de lignes ne voit que les items listés en tableau, le récapitulatif compte
    aussi ceux résumés en bloc.
    """
    recap = re.compile(rf'^(?:{"|".join(re.escape(m) for m in mots)})(?:\s*\(.*\))?$')
    out = {}
    for f in sorted(PASSEB.glob('*.md')):
        if f.name == 'README.md' or f.name.startswith('passeB-'):
            continue
        for ligne in lire(f).split('\n'):
            if not ligne.startswith('|'):
                continue
            cellules = [x.strip() for x in ligne.strip().strip('|').split('|')]
            if len(cellules) < 2:
                continue
            tete = cellules[0].replace('**', '').strip()
            if not recap.match(tete):
                continue
            m = re.search(r'(\d+)', cellules[1].replace('**', ''))
            if not m:
                continue
            mot = next(w for w in mots if tete.startswith(w))
            out.setdefault(f.name, {})[mot] = int(m.group(1))
    return out or None


STATUTS_RECOMPTAGE = ('LIVRÉ', 'PARTIEL', 'REFUSÉ', 'PÉRIMÉ', 'ABSENT', 'NON PROUVÉ')
# Clos = ce qui ne sera plus retouché. `PARTIEL` et `ABSENT` restent dus, donc
# dehors. Écrit ici une fois pour que la page et le tracker ne puissent pas
# diverger sur la définition — « un réglage vit à un seul endroit ».
STATUTS_CLOS = ('LIVRÉ', 'REFUSÉ', 'PÉRIMÉ')


def recomptage_cloture(texte: str | None = None) -> dict | None:
    """Le recomptage de clôture du §12.5 du tracker, LU — jamais déduit.

    Pourquoi cette fonction existe : la passe B ne ventile pas le groupe A par
    document, donc PDF-01, PDF-02 et PDF-03 s'affichaient « non ventilé ». Pour
    PDF-02 il existe désormais une mesure autrement plus solide — la source
    relue EN ENTIER contre le code, avec la règle « LIVRÉ exige un fichier:ligne
    ET un appelant réel ». On ajoute donc une SOURCE de mesure ; on ne bricole
    pas un calcul. La règle de `main()` — ne jamais déduire
    `couvertes = relevées − non mentionnées` — reste intacte et le reste.

    Le document mesuré n'est pas deviné : il est DÉCLARÉ dans le tracker
    (« Document mesuré : `PDF-02` ») et lu ici. Sans cette ligne, on refuse de
    rattacher les chiffres à quoi que ce soit — un chiffre juste posé sur le
    mauvais document reste un chiffre faux.

    Deux chemins indépendants doivent s'accorder, et c'est tout l'intérêt :
    le TABLEAU des statuts d'un côté, la PHRASE « Clos = … = 119 / 128 » de
    l'autre. « Un total de tracker est un argument » — on lit les deux et on
    exige l'accord. Au moindre écart, `pct` vaut `None` : la page affichera
    « non ventilé », qui est vrai, plutôt qu'un pourcentage que personne n'a
    mesuré.

    Rend `None` si le §12.5 n'existe pas — et c'est ce qui fait rougir la garde
    quand on retire la section ou son tableau.
    """
    t = lire(TRACKER) if texte is None else texte
    if not t:
        return None
    tous = recomptages_cloture(t)
    return tous[0] if tous else None


def _sections_du_tracker(t: str) -> list:
    """Découpe le tracker à chaque titre de niveau 2 ou 3.

    On ne cherche PAS « §12.5 » par son numéro : un numéro de section se
    renumérote, et une mesure qui suit un numéro meurt au premier
    réagencement. C'est l'ANCRE « Document mesuré » qui désigne un recomptage,
    donc n'importe quelle section peut en porter un.
    """
    bornes = [m.start() for m in re.finditer(r'^#{2,3} ', t, re.M)]
    return [t[a:b] for a, b in zip(bornes, bornes[1:] + [len(t)])]


def recomptages_cloture(texte: str | None = None) -> list:
    """TOUS les recomptages de clôture du tracker, un par document mesuré."""
    t = lire(TRACKER) if texte is None else texte
    if not t:
        return []
    out = []
    for section in _sections_du_tracker(t):
        if 'Document mesuré' not in section:
            continue
        r = _un_recomptage(section)
        if r is not None:
            out.append(r)
    return out


def _un_recomptage(section: str) -> dict | None:
    """Lit UNE section de recomptage. `None` si elle n'en est pas une."""
    if not re.search(r'^\|\s*\*{0,2}Total', section, re.M):
        return None

    m = re.search(r'\*\*Document mesuré\s*:\s*`([A-Z]+-\d{2})`\*\*', section)
    document = m.group(1) if m else None

    statuts = {}
    for nom in STATUTS_RECOMPTAGE:
        # `| **LIVRÉ** | **111** |` comme `| PARTIEL | 8 |` : le gras est
        # cosmétique, il ne doit pas décider si une ligne est lue.
        mm = re.search(rf'^\|\s*\*{{0,2}}{re.escape(nom)}\*{{0,2}}\s*\|\s*\*{{0,2}}(\d+)\*{{0,2}}\s*\|',
                       section, re.M)
        if mm:
            statuts[nom] = int(mm.group(1))

    mt = re.search(r'^\|\s*\*{0,2}Total\*{0,2}\s*\|\s*\*{0,2}(\d+)\*{0,2}\s*\|', section, re.M)
    total_declare = int(mt.group(1)) if mt else None

    mc = re.search(r'Clos\s*=[^=]*=\s*(\d+)\s*/\s*(\d+)\s*=\s*([\d,.]+)\s*%', section)
    clos_declare = int(mc.group(1)) if mc else None
    total_clos_declare = int(mc.group(2)) if mc else None
    pct_declare = float(mc.group(3).replace(',', '.')) if mc else None

    ecarts = []
    if document is None:
        ecarts.append("le document mesuré n'est pas déclaré — rien à rattacher")
    if len(statuts) != len(STATUTS_RECOMPTAGE):
        manquants = [s for s in STATUTS_RECOMPTAGE if s not in statuts]
        ecarts.append(f'statuts absents du tableau : {", ".join(manquants)}')
    if total_declare is None:
        ecarts.append('pas de ligne Total dans le tableau des statuts')
    if clos_declare is None:
        ecarts.append('pas de phrase « Clos = … / … = … % »')

    # Les deux recalculs. Ce sont EUX qui font foi ; les nombres écrits ne
    # servent qu'à être contredits.
    somme = sum(statuts.values()) if statuts else None
    clos_calcule = (sum(statuts.get(s, 0) for s in STATUTS_CLOS)
                    if len(statuts) == len(STATUTS_RECOMPTAGE) else None)

    if somme is not None and total_declare is not None and somme != total_declare:
        ecarts.append(f'la somme des statuts ({somme}) ne fait pas le total déclaré ({total_declare})')
    if clos_calcule is not None and clos_declare is not None and clos_calcule != clos_declare:
        ecarts.append(f'le clos recalculé ({clos_calcule}) contredit le clos déclaré ({clos_declare})')
    if (total_declare is not None and total_clos_declare is not None
            and total_declare != total_clos_declare):
        ecarts.append(f'le dénominateur du clos ({total_clos_declare}) '
                      f'diffère du total du tableau ({total_declare})')

    coherent = not ecarts
    pct = None
    if coherent and clos_calcule is not None and total_declare:
        pct = round(clos_calcule / total_declare * 100, 1)
        if pct_declare is not None and abs(pct - pct_declare) > 0.1:
            ecarts.append(f'le pourcentage recalculé ({pct} %) contredit celui écrit ({pct_declare} %)')
            coherent = False
            pct = None

    return {
        'document': document,
        'statuts': statuts,
        'total': total_declare,
        'clos': clos_calcule if coherent else clos_declare,
        'pct': pct,
        'restant': ({s: statuts[s] for s in ('PARTIEL', 'ABSENT', 'NON PROUVÉ') if statuts.get(s)}
                    if coherent else {}),
        'source': '§12.5 du tracker',
        'coherent': coherent,
        'ecarts': ecarts,
    }


def fichiers_source() -> list:
    """Ce que l'archive contient RÉELLEMENT, lu sur le disque."""
    out = []
    if not SOURCE.exists():
        return out
    for p in sorted(SOURCE.iterdir()):
        if p.name == 'sources-21-aout':
            n = len(list(p.glob('*')))
            out.append({'nom': p.name, 'type': 'dossier', 'unites': n, 'unite': 'fichiers'})
        elif p.is_dir():
            n = len(list(p.iterdir()))
            out.append({'nom': p.name, 'type': 'dossier', 'unites': n, 'unite': 'images'})
        elif p.suffix == '.txt':
            out.append({'nom': p.name, 'type': 'texte',
                        'unites': len(p.read_text(encoding='utf-8', errors='replace').split('\n')),
                        'unite': 'lignes'})
        elif p.suffix == '.csv':
            with p.open(encoding='utf-8', errors='replace') as fh:
                out.append({'nom': p.name, 'type': 'csv', 'unites': sum(1 for _ in fh) - 1, 'unite': 'lignes'})
        else:
            out.append({'nom': p.name, 'type': 'autre', 'unites': None, 'unite': None})
    return out


def cle_doc(nom: str) -> str | None:
    m = re.match(r'(PDF-\d{2})_', nom)
    if m:
        return m.group(1)
    if nom.startswith('LISEZ-MOI'):
        return 'LISEZ-MOI'
    if nom.startswith('SOMMAIRE'):
        return 'SOMMAIRE'
    if nom == 'images-produit-cible':
        return 'images-produit-cible'
    return None


def certificat() -> list:
    """Les dix preuves du §11, avec l'état que le tracker leur donne."""
    t = lire(TRACKER)
    i = t.find('## 11. Certificat')
    if i < 0:
        return []
    out = []
    # ⚠️ Pas de fenêtre de N caractères : elle coupait la dixième preuve, et
    # un tableau tronqué se lit comme un tableau complet. On va jusqu'au bout.
    for ligne in t[i:].split('\n'):
        m = re.match(r'\|\s*(\d+)\.\s*([^|]+?)\s*\|(.*)$', ligne)
        if m:
            # Le corps se termine par un `|` de fin de colonne — mais pas
            # toujours : deux lignes du tableau n'en portent pas, et une regex
            # qui l'EXIGE en perd deux sur dix sans le dire. C'est le genre de
            # silence que ce fichier existe pour éviter.
            corps = m.group(3).strip().rstrip('|').strip()
            etat = 'tenue' if corps.startswith('✅') else ('ouverte' if corps.startswith('⚠️') else 'inconnu')
            out.append({'n': int(m.group(1)), 'preuve': m.group(2), 'etat': etat,
                        'detail': re.sub(r'\s+', ' ', corps)[:600]})
    return out


def git_head() -> str:
    # `git log` ment sur ce poste après un merge ; `rev-parse` est la vérité.
    try:
        return subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO, capture_output=True,
                              text=True, check=True).stdout.strip()[:9]
    except Exception:
        return 'inconnu'


def main() -> int:
    # ⚠️ LA GARDE QUI MANQUAIT, ET ELLE A COÛTÉ UNE PAGE PUBLIÉE SUR DU VIDE.
    #
    # `agent_docs/sources/` est GITIGNORÉ : il existe dans le dépôt principal et
    # PAS dans un worktree. Lancé depuis un worktree, ce programme rendait un
    # manifeste de zéro fichier — et la page se rendait parfaitement, avec ses
    # colonnes, ses titres et « 0 fichiers ». Un zéro de mesure est
    # indiscernable d'un zéro vrai pour qui regarde la page.
    #
    # C'est la même règle que pour une garde d'architecture : elle doit prouver
    # qu'elle LIT quelque chose. Ici, on refuse de produire plutôt que de
    # produire du vide.
    if not SOURCE.exists():
        print(f'La source est introuvable : {SOURCE}\n'
              f"Elle est gitignorée, donc absente d'un worktree — lancer ce programme depuis le dépôt principal.",
              file=sys.stderr)
        return 2
    if not PASSEB.exists():
        print(f'La passe B est introuvable : {PASSEB}', file=sys.stderr)
        return 2
    if not TRACKER.exists():
        print(f'Le tracker est introuvable : {TRACKER}', file=sys.stderr)
        return 2

    groupes = entetes_de_groupe()
    doc_groupe = {d: g for g, docs in GROUPES.items() for d in docs}
    # Une SOURCE de mesure supplémentaire, pas un calcul de plus : le §12.5 du
    # tracker recompte un document EN ENTIER contre le code. Il ne couvre qu'un
    # document ; les autres restent à la passe B, et « non ventilé » quand elle
    # ne ventile pas.
    recomptages = {r['document']: r for r in recomptages_cloture() if r.get('document')}
    fichiers = []
    orphelins = []
    for f in fichiers_source():
        cle = cle_doc(f['nom'])
        g = doc_groupe.get(cle) if cle else None
        if cle and not g:
            orphelins.append(f['nom'])
        info = groupes.get(g, {}) if g else {}
        releve = (info.get('relevees_par_doc') or {}).get(cle)
        couv = (info.get('couvertes_par_doc') or {}).get(cle)
        nm = (info.get('non_mentionnees_par_doc') or {}).get(cle)
        # ⚠️ On ne DÉDUIT pas `couvertes = relevées − non mentionnées` : les
        # groupes comptent aussi des « rapprochements incertains », qui ne sont
        # ni l'un ni l'autre. Une soustraction donnerait un nombre faux qui a
        # l'air juste. Ce qui n'est pas ventilé reste `null`.
        # Le recomptage ne s'applique qu'au document qu'il DÉCLARE mesurer, et
        # seulement s'il est cohérent. Incohérent, il ne remplace rien : la
        # ligne reste « non ventilé », ce qui est vrai.
        rec = recomptages.get(cle)
        rec = rec if rec and rec.get('coherent') else None
        fichiers.append({**f, 'cle': cle, 'groupe': g,
                         'exigences_relevees': releve,
                         'couvertes': couv,
                         'non_mentionnees': nm,
                         # ⚠️ Le dénominateur du recomptage N'EST PAS celui de la
                         # passe B : 129 relevées d'un côté, 128 de l'autre. Deux
                         # grains de lecture, pas une correction silencieuse — la
                         # page doit AFFICHER lequel elle utilise, sinon 93 %
                         # aurait l'air de sortir des 129.
                         'recomptage': rec,
                         'groupe_relevees': info.get('relevees'),
                         'groupe_couvertes': info.get('couvertes'),
                         'groupe_non_mentionnees': info.get('non_mentionnees')})
    porteurs = sum(1 for f in fichiers if f['cle'])
    if porteurs == 0:
        print('Aucun fichier porteur reconnu dans la source — la mesure serait vide.', file=sys.stderr)
        return 2

    print(json.dumps({
        'chantier': 'Dossier du 26 août 2026',
        'tracker': 'agent_docs/dossier-26-aout-2026.md',
        'commit': git_head(),
        'source_sur_disque': SOURCE.exists(),
        'fichiers': fichiers,
        'fichiers_hors_groupe': orphelins,
        'groupes': groupes,
        'statuts': statuts_verifies(),
        'recomptages_cloture': list(recomptages.values()),
        'certificat': certificat(),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
