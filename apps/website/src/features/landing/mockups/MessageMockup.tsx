'use client'

import { useState } from 'react'

const TABS = ['linkedin', 'email'] as const
type Tab = (typeof TABS)[number]

export function MessageMockup() {
  const [tab, setTab] = useState<Tab>('linkedin')

  return (
    <div className="rounded-2xl overflow-hidden bg-[#111118] border border-white/[0.06]">
      <div className="flex border-b border-white/[0.06]">
        {TABS.map(t => {
          const active = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-medium capitalize transition-colors bg-transparent border-b-2 ${
                active ? 'text-violet-500 border-violet-600' : 'text-zinc-500 border-transparent'
              }`}
            >
              {t === 'linkedin' ? 'LinkedIn' : 'Email'}
            </button>
          )
        })}
      </div>
      <div className="p-4">
        {tab === 'linkedin' ? (
          <p className="text-xs leading-relaxed text-zinc-300">
            Bonjour Jean-Pierre, je suis tombé sur l'annonce de votre programme de modernisation SI. Chez [ESN], nous
            avons accompagné 3 DSI du secteur ferroviaire sur des défis similaires. Seriez-vous disponible 20 min pour
            échanger ?
          </p>
        ) : (
          <p className="text-xs leading-relaxed whitespace-pre-line text-zinc-300">
            {`Objet : Retour d'expérience DSI ferroviaire — modernisation SI

Bonjour Jean-Pierre, suite à vos annonces de recrutement Cloud et IA, je me permets de vous contacter pour partager notre expérience sur des projets similaires...`}
          </p>
        )}
      </div>
    </div>
  )
}
