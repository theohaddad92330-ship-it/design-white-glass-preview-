import { useEffect, useRef, useState } from 'react'

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState({ fps: 0, memory: 0, jank: 0, longTasks: 0 })

  useEffect(() => {
    let frameCount = 0
    let lastTime = performance.now()
    let animationId = 0
    let jankCount = 0

    const measureFPS = () => {
      frameCount++
      const now = performance.now()
      const delta = now - lastTime
      if (delta >= 1000) {
        const fps = Math.round((frameCount * 1000) / delta)
        frameCount = 0
        lastTime = now
        const perfWithMemory = performance as Performance & { memory?: { usedJSHeapSize: number } }
        const memoryMB = perfWithMemory.memory ? perfWithMemory.memory.usedJSHeapSize / (1024 * 1024) : 0
        setMetrics(prev => ({ ...prev, fps, memory: Math.round(memoryMB), jank: jankCount, longTasks: jankCount }))
        jankCount = 0
      }
      animationId = requestAnimationFrame(measureFPS)
    }

    let observer: PerformanceObserver | null = null
    if ('PerformanceObserver' in window) {
      try {
        observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) jankCount++
          }
        })
        observer.observe({ entryTypes: ['longtask'] })
      } catch {
        // unsupported
      }
    }

    animationId = requestAnimationFrame(measureFPS)
    return () => {
      cancelAnimationFrame(animationId)
      observer?.disconnect()
    }
  }, [])

  return metrics
}

export function useNetworkMetrics() {
  const [pendingRequests, setPendingRequests] = useState(0)

  useEffect(() => {
    let pending = 0
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      pending++
      setPendingRequests(pending)
      try {
        return await originalFetch(...args)
      } finally {
        pending--
        setPendingRequests(pending)
      }
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return { pendingRequests }
}

export function useRenderMetrics() {
  const [renderTime, setRenderTime] = useState(0)
  const renderStart = useRef(performance.now())

  useEffect(() => {
    const renderEnd = performance.now()
    setRenderTime(Math.round(renderEnd - renderStart.current))
    renderStart.current = renderEnd
  }, [])

  return { renderTime }
}

export function useFCPMetrics() {
  const [fcp, setFcp] = useState<number | null>(null)

  useEffect(() => {
    const existing = performance.getEntriesByName('first-contentful-paint')
    if (existing.length > 0) {
      setFcp(Math.round(existing[0].startTime))
      return
    }
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              setFcp(Math.round(entry.startTime))
              observer.disconnect()
            }
          }
        })
        observer.observe({ type: 'paint', buffered: true })
        return () => observer.disconnect()
      } catch {
        // unsupported
      }
    }
  }, [])

  return { fcp }
}

export function useDomNodeCount() {
  const [count, setCount] = useState(() => document.getElementsByTagName('*').length)

  useEffect(() => {
    const interval = setInterval(() => setCount(document.getElementsByTagName('*').length), 3000)
    return () => clearInterval(interval)
  }, [])

  return count
}
