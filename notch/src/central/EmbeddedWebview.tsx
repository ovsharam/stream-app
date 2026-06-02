import { useRef, type RefObject } from 'react'
import { useWebviewPopups } from './useWebviewPopups'

type Props = {
  className?: string
  src: string
  partition: string
}

export function EmbeddedWebview({ className, src, partition }: Props) {
  const ref = useRef<HTMLElement>(null)
  useWebviewPopups(ref, true)

  return (
    <webview
      ref={ref as RefObject<HTMLElement>}
      className={className}
      src={src}
      partition={partition}
      allowpopups="true"
      webpreferences="contextIsolation=yes,nativeWindowOpen=yes,javascript=yes"
    />
  )
}
