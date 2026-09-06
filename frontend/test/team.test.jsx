import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Team from '../src/pages/Team'

vi.mock('../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    send: vi.fn(),
  }),
}))

describe('Team Page', () => {
  it('renders choose screen with CREATE TEAM and JOIN TEAM buttons', () => {
    render(<Team />)
    expect(screen.getAllByText('TUNE TRACKER').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('CREATE TEAM').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('JOIN TEAM').length).toBeGreaterThanOrEqual(1)
  })

  it('shows Connected status', () => {
    render(<Team />)
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(1)
  })

  it('transitions to teamname screen when CREATE TEAM is clicked', () => {
    render(<Team />)
    fireEvent.click(screen.getAllByText('CREATE TEAM')[0])
    expect(screen.getAllByText('Enter Team Name').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('CREATE').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('BACK').length).toBeGreaterThanOrEqual(1)
  })

  it('transitions to teamname screen when JOIN TEAM is clicked', () => {
    render(<Team />)
    fireEvent.click(screen.getAllByText('JOIN TEAM')[0])
    expect(screen.getAllByText('Enter Team Name').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('JOIN').length).toBeGreaterThanOrEqual(1)
  })

  it('goes back to choose screen when BACK is clicked', () => {
    render(<Team />)
    fireEvent.click(screen.getAllByText('CREATE TEAM')[0])
    fireEvent.click(screen.getAllByText('BACK')[0])
    expect(screen.getAllByText('CREATE TEAM').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('JOIN TEAM').length).toBeGreaterThanOrEqual(1)
  })

  it('shows team name input field', () => {
    render(<Team />)
    fireEvent.click(screen.getAllByText('CREATE TEAM')[0])
    const inputs = screen.getAllByPlaceholderText('Team Name')
    expect(inputs.length).toBeGreaterThanOrEqual(1)
  })
})
