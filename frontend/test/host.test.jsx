import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Host from '../src/pages/Host'

vi.mock('../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    send: vi.fn(),
  }),
}))

describe('Host Dashboard', () => {
  it('renders dashboard title', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('Host Dashboard').length).toBeGreaterThan(0)
  })

  it('renders control buttons', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('▶ START').length).toBeGreaterThan(0)
    expect(screen.getAllByText('🔒 LOCK').length).toBeGreaterThan(0)
    expect(screen.getAllByText('↺ RESET').length).toBeGreaterThan(0)
    expect(screen.getAllByText('⏭ NEXT').length).toBeGreaterThan(0)
  })

  it('renders Logout button', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('Logout').length).toBeGreaterThan(0)
  })

  it('renders round state badge', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('Idle').length).toBeGreaterThan(0)
  })

  it('shows round name input', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('Round:').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Set').length).toBeGreaterThan(0)
  })

  it('shows empty buzzer order message', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('No buzzer presses yet').length).toBeGreaterThan(0)
  })

  it('shows empty teams message', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('No teams joined yet').length).toBeGreaterThan(0)
  })

  it('shows empty violations message', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText('No violations').length).toBeGreaterThan(0)
  })

  it('shows section headers', () => {
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    )
    expect(screen.getAllByText(/Buzzer Order/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Teams/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Violation Alerts/).length).toBeGreaterThan(0)
  })
})
