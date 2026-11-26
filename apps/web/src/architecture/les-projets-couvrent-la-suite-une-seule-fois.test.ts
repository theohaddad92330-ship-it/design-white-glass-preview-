/**
 * Chaque fichier de test web est lancé par EXACTEMENT un projet vitest.
 *
 * Le projet `node (pur)` prend une liste générée et les projets DOM l'excluent.
 * Deux fautes symétriques : un fichier dans deux projets tourne deux fois (temps
 * perdu, et un état de module qui diffère), un fichier dans aucun ne tourne jamais
 * et rien ne rougit. La garde lit le DISQUE et la table `PROJECT_SCOPES` que la
 * config vitest consomme — pas une copie de la règle.
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ALL_SUITES_INCLUDE, NODE_PUR_PROJECT_INCLUDE, PROJECT_SCOPES, matchesGlob } from '../test/projects'

const WEB_ROOT = resolve(__dirname, '../..')

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else found.push(relative(WEB_ROOT, full).split('\\').join('/'))
  }
  return found
}

const everySuiteOnDisk = walk(WEB_ROOT).filter(file => ALL_SUITES_INCLUDE.some(p => matchesGlob(file, p)))

function projectsRunning(file: string): string[] {
  return Object.entries(PROJECT_SCOPES)
    .filter(([, scope]) => scope.include.some(p => matchesGlob(file, p)))
    .filter(([, scope]) => !scope.exclude.some(p => matchesGlob(file, p)))
    .map(([name]) => name)
}

describe('les projets vitest couvrent la suite web une seule fois', () => {
  it('lit un corpus réel — une garde sans corpus rend un vert qui ne prouve rien', () => {
    expect(everySuiteOnDisk.length).toBeGreaterThan(1000)
    expect(NODE_PUR_PROJECT_INCLUDE.length).toBeGreaterThan(100)
  })

  it('aucun fichier de test ne tourne zéro fois, ni deux fois', () => {
    const wrong = everySuiteOnDisk
      .map(file => ({ file, projects: projectsRunning(file) }))
      .filter(({ projects }) => projects.length !== 1)
    expect(wrong).toEqual([])
  })

  it('chaque entrée de la liste « node (pur) » existe sur le disque et tourne dans ce projet', () => {
    const onDisk = new Set(everySuiteOnDisk)
    const bad = NODE_PUR_PROJECT_INCLUDE.filter(file => !onDisk.has(file) || projectsRunning(file)[0] !== 'node (pur)')
    expect(bad).toEqual([])
  })

  it('sait dire NON : un fichier en double ou orphelin serait vu', () => {
    // un fichier listé dans « node (pur) » ET non exclu du projet jsdom tournerait deux fois
    const jsdom = PROJECT_SCOPES.jsdom
    const probe = NODE_PUR_PROJECT_INCLUDE[0]!
    expect(jsdom.exclude).toContain(probe)
    expect(projectsRunning('src/inexistant/orphelin.md')).toEqual([])
  })
})
