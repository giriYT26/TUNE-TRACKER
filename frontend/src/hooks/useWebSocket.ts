import { useEffect, useRef, useState, useCallback } from 'react'

export interface BuzzerEvent {
  position: number
  team_name: string
  timestamp: string
}

export function useWebSocket(
  path: string,
  onMessage?: (data: unknown) => void
) {
  const socketRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${location.host}${path}`
    const ws = new WebSocket(url)
    socketRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage?.(data)
      } catch {
        // ignore malformed messages
      }
    }

    return () => {
      ws.close()
      socketRef.current = null
    }
  }, [path, onMessage])

  const send = useCallback((msg: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { connected, send }
}
