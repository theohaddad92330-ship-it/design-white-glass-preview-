#!/usr/bin/env python3
"""Ce que les branches EN VOL livrent déjà — pour ne pas re-dispatcher.

Le piège mesuré le 18/09 : j'ai écrit trois briefs d'écrivain sur des points
que quatre branches non fusionnées livraient DÉJÀ. Un registre dit l'état du
code au SHA où on l'a lu ; il ne sait rien des branches en vol. Ce script lit
les branches, pas les registres.
"""
import re, subprocess, collections, sys, time

SECONDES_EN_VOL = 18 * 3600  # une branche poussée il y a plus de 18 h n'est plus « en vol »
maintenant = int(time.time())

def git(*a):
    return subprocess.run(["/usr/bin/git", *a], capture_output=True, text=True, cwd="/Users/louisschlegel/Desktop/belllum-monorepo").stdout

OUVERTS = ("retenu", "à trancher", None)
TERMINAUX = ("livré", "déjà là", "recetté", "reformulé")


def livraison_en_vol(avant, apres):
    """Une branche livre-t-elle ce point, ou son registre a-t-il pris du retard ?

    Le SEUL sens qui compte est : OUVERT sur `main`, TERMINAL sur la branche.
    L'inverse — `recetté` sur main, `livré` sur la branche — n'est pas une
    livraison en vol : c'est une vieille branche dont le registre est plus
    ancien que `main`. La compter ferait re-dispatcher à l'envers un point
    déjà recetté en production.
    """
    return avant in OUVERTS and apres in TERMINAUX


def etat(ligne):
    c = [x.strip().replace("\x00", "\\|") for x in ligne.replace("\\|", "\x00").split("|")]
    if len(c) < 7:
        return None
    m = re.match(r"#?(\d{4})\.(\w+)", c[1])
    return (c[1], c[5]) if m else None

branches = [b.strip() for b in git("branch", "-r", "--list", "origin/feat/*", "origin/chore/*").splitlines() if b.strip()]
par_point = collections.defaultdict(list)
for b in branches:
    if subprocess.run(["/usr/bin/git", "merge-base", "--is-ancestor", b, "origin/main"],
                      cwd="/Users/louisschlegel/Desktop/belllum-monorepo").returncode == 0:
        continue  # déjà sur main : ce n'est plus « en vol »
    # Une branche « en vol » a été poussée RÉCEMMENT. Une branche vieille de
    # deux jours qui n'a pas atterri n'est pas en vol, elle est échouée — et
    # son registre est plus vieux que main.
    age = git("log", "-1", "--format=%ct", b).strip()
    if age and (maintenant - int(age)) > SECONDES_EN_VOL:
        continue
    fichiers = [f for f in git("diff", "--name-only", f"origin/main...{b}", "--", ".claude/notes").splitlines() if f]
    for f in fichiers:
        avant = {}
        for l in git("show", f"origin/main:{f}").splitlines():
            e = etat(l)
            if e: avant[e[0]] = e[1]
        for l in git("show", f"{b}:{f}").splitlines():
            e = etat(l)
            if not e: continue
            pt, st = e
            # un point qui DEVIENT terminal sur la branche : la branche le livre
            if livraison_en_vol(avant.get(pt), st):
                par_point[pt].append((b.replace("origin/", ""), avant.get(pt, "—"), st))

par_issue = collections.defaultdict(list)
for pt, v in par_point.items():
    par_issue[re.match(r"#?(\d{4})", pt).group(1)].append((pt, v[0]))

if not par_issue:
    print("aucune branche en vol ne livre de point (ou aucune branche en vol)")
    sys.exit(0)
for issue in sorted(par_issue):
    pts = sorted(par_issue[issue], key=lambda x: x[0])
    br = sorted({p[1][0] for p in pts})
    print(f"#{issue} — {len(pts)} point(s) en vol sur {', '.join(br)}")
    for pt, (b, av, ap) in pts:
        print(f"    {pt:10} {av} → {ap}")
