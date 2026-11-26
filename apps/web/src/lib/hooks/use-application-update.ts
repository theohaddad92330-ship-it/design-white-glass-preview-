import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { isDevEnvironment } from '@bellum/utils'

const isDev = isDevEnvironment()

type UpdateState = 'idle' | 'up-to-date' | 'available' | 'force'

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1_000
const MAX_VERSION_AGE_MS = 24 * 60 * 60 * 1_000

const LatestVersionSchema = z.object({
  v: z.number(),
  latestVersion: z.string().optional(),
})

// Matches `YY.MM.DD-tsUNIX+gitSHA10` produced by `tools/get-version.sh package`.
// E.g. `26.05.01-ts1746091200+git1a2b3c4d5e`.
const VERSION_REGEX = /^(\d+\.\d+\.\d+)-ts(\d{10})\+git([a-f0-9]+)$/

/**
 * Polls `/latest-version.json` and reports whether a newer build is live.
 *
 * State transitions:
 *  - `idle`        — first render in prod, before any check resolves
 *  - `up-to-date`  — manifest matches `__CODE_VERSION_ID__`
 *  - `available`   — newer build deployed, soft prompt the user
 *  - `force`       — newer build older than `MAX_VERSION_AGE_MS`, or unrecoverable mismatch
 *
 * In dev (`isDevEnvironment()`) we short-circuit to `up-to-date` and never poll.
 */
export function useApplicationUpdate(): {
  updateState: UpdateState
  update: () => void
} {
  const [updateState, setUpdateState] = useState<UpdateState>(isDev ? 'up-to-date' : 'idle')
  const checkIntervalRef = useRef<number | undefined>(undefined)
  const forceTimeoutRef = useRef<number | undefined>(undefined)

  const update = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    if (isDev) return

    const checkUpdate = () => {
      void (async () => {
        // Once we've scheduled the force timer, the soft "available" state is
        // already shown; further polls would only race with that timer.
        if (forceTimeoutRef.current !== undefined) return

        const now = Date.now()
        const res = await fetch(`/latest-version.json?ts=${now}`)
        if (!res.ok) {
          console.error('latest-version.json: non-OK response', res.status)
          return
        }
        const json: unknown = await res.json()
        const payload = LatestVersionSchema.parse(json)

        // The schema version (`v`) lets us bump the manifest format without
        // breaking older deployed clients — they'll force-reload to pick up
        // the new client that knows how to read it.
        if (payload.v > 1) {
          setUpdateState('force')
          return
        }

        if (payload.latestVersion === undefined) {
          console.error('latest-version.json: missing latestVersion', payload)
          return
        }

        if (payload.latestVersion === __CODE_VERSION_ID__) {
          setUpdateState('up-to-date')
          return
        }

        const latestVersionMatch = VERSION_REGEX.exec(payload.latestVersion)
        if (latestVersionMatch === null) {
          console.error('latest-version.json: unexpected version shape', payload.latestVersion)
          setUpdateState('force')
          return
        }

        const releaseTimestampString = latestVersionMatch[2]
        const releaseTimestampMs = parseInt(releaseTimestampString, 10) * 1_000
        const delta = Math.max(now - releaseTimestampMs, 0)

        if (delta > MAX_VERSION_AGE_MS) {
          setUpdateState('force')
          return
        }

        setUpdateState('available')
        // Stop polling — we already know an update is live; the next user
        // action will be the reload, or the force timeout below.
        if (checkIntervalRef.current !== undefined) {
          window.clearInterval(checkIntervalRef.current)
          checkIntervalRef.current = undefined
        }
        forceTimeoutRef.current = window.setTimeout(() => {
          setUpdateState('force')
        }, MAX_VERSION_AGE_MS - delta)
      })().catch(err => {
        console.error('Failed to check for updates:', err)
      })
    }

    checkUpdate()
    checkIntervalRef.current = window.setInterval(checkUpdate, UPDATE_CHECK_INTERVAL_MS)

    return () => {
      if (checkIntervalRef.current !== undefined) {
        window.clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = undefined
      }
      if (forceTimeoutRef.current !== undefined) {
        window.clearTimeout(forceTimeoutRef.current)
        forceTimeoutRef.current = undefined
      }
    }
  }, [])

  return { updateState, update }
}
