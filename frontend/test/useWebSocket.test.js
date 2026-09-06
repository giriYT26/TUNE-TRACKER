import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../src/hooks/useWebSocket'

describe('useWebSocket', () => {
  let mockWs

  beforeEach(() => {
    mockWs = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onclose: null,
      onmessage: null,
    }
    global.WebSocket = vi.fn(function () {
      return mockWs
    })
    global.WebSocket.OPEN = 1
    global.WebSocket.CLOSED = 3
    global.location = { protocol: 'http:', host: 'localhost:5173' }
  })

  it('returns connected and send', () => {
    const { result } = renderHook(() => useWebSocket('/ws/team', vi.fn()))
    expect(result.current).toHaveProperty('connected')
    expect(result.current).toHaveProperty('send')
    expect(typeof result.current.send).toBe('function')
  })

  it('sends message when connected', () => {
    const { result } = renderHook(() => useWebSocket('/ws/team', vi.fn()))
    act(() => {
      result.current.send({ type: 'buzz' })
    })
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'buzz' }))
  })

  it('does not send when disconnected', () => {
    mockWs.readyState = 3
    const { result } = renderHook(() => useWebSocket('/ws/team', vi.fn()))
    act(() => {
      result.current.send({ type: 'buzz' })
    })
    expect(mockWs.send).not.toHaveBeenCalled()
  })

  it('calls onMessage when message received', () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket('/ws/team', onMessage))
    const msg = { data: JSON.stringify({ type: 'buzzer_update' }) }
    act(() => {
      mockWs.onmessage(msg)
    })
    expect(onMessage).toHaveBeenCalledWith({ type: 'buzzer_update' })
  })

  it('creates WebSocket with correct URL', () => {
    renderHook(() => useWebSocket('/ws/team', vi.fn()))
    expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:5173/ws/team')
  })
})
