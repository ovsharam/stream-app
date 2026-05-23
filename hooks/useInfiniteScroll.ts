import { useEffect, useRef, useCallback } from 'react'

export function useInfiniteScroll(onLoadMore: () => void, hasMore: boolean): {
  sentinelRef: (node: HTMLElement | null) => void
} {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      targetRef.current = node
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      if (!node || !hasMore) return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) onLoadMore()
        },
        { rootMargin: '200px' }
      )
      observerRef.current.observe(node)
    },
    [onLoadMore, hasMore]
  )

  useEffect(() => {
    return () => observerRef.current?.disconnect()
  }, [])

  return { sentinelRef }
}
