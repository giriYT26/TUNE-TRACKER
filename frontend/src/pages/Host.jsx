import { useReducer, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

function hostReducer(state, action) {
  switch (action.type) {
    case 'BUZZER_UPDATE':
      return { ...state, buzzerOrder: action.buzzerOrder }
    case 'ROUND_STATE':
      return { ...state, roundState: action.state }
    case 'TEAM_STATUS': {
      const updated = { ...state.teams }
      updated[action.teamName] = { status: action.status, warningCount: action.warningCount }
      return { ...state, teams: updated }
    }
    default:
      return state
  }
}

export default function Host() {
  const [state, dispatch] = useReducer(hostReducer, {
    buzzerOrder: [],
    roundState: 'Idle',
    teams: {},
  })

  const handleServerMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'buzzer_update':
        dispatch({ type: 'BUZZER_UPDATE', buzzerOrder: msg.buzzer_order })
        break
      case 'round_state':
        dispatch({ type: 'ROUND_STATE', state: msg.state })
        break
      case 'team_status':
        dispatch({
          type: 'TEAM_STATUS',
          teamName: msg.team_name,
          status: msg.status,
          warningCount: msg.warning_count,
        })
        break
    }
  }, [])

  const { connected, send } = useWebSocket('/ws/host', handleServerMessage)

  const sendControl = (type) => {
    send({ type })
  }

  const roundColor = {
    Idle: '#888',
    Active: '#22c55e',
    Locked: '#ef4444',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Host Dashboard</h1>
      <p style={{ color: connected ? 'green' : 'red' }}>
        {connected ? 'Connected' : 'Disconnected'}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => sendControl('start')}>START BUZZER</button>
        <button onClick={() => sendControl('lock')}>LOCK BUZZER</button>
        <button onClick={() => sendControl('reset')}>RESET BUZZER</button>
        <button onClick={() => sendControl('next_question')}>NEXT QUESTION</button>
        <span style={{
          padding: '0.5rem 1rem',
          borderRadius: '4px',
          color: '#fff',
          backgroundColor: roundColor[state.roundState] || '#888',
          fontWeight: 'bold',
        }}>
          {state.roundState}
        </span>
      </div>

      <h2>Buzzer Order</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Position</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Team</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {state.buzzerOrder.length === 0 ? (
            <tr>
              <td colSpan="3" style={{ padding: '1rem', textAlign: 'center', color: '#888' }}>
                No buzzer presses yet
              </td>
            </tr>
          ) : (
            state.buzzerOrder.map((event) => (
              <tr key={event.team_name} style={{ borderBottom: '1px solid #444' }}>
                <td style={{ padding: '0.5rem' }}>#{event.position}</td>
                <td style={{ padding: '0.5rem' }}>{event.team_name}</td>
                <td style={{ padding: '0.5rem' }}>{event.timestamp}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2>Teams</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {Object.keys(state.teams).length === 0 ? (
          <li style={{ color: '#888' }}>No teams joined yet</li>
        ) : (
          Object.entries(state.teams).map(([name, info]) => (
            <li key={name} style={{
              padding: '0.75rem',
              marginBottom: '0.5rem',
              borderRadius: '4px',
              backgroundColor: info.status === 'Disqualified' ? '#7f1d1d' : '#1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{name}</span>
              <span>
                <span style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  marginRight: '0.5rem',
                  backgroundColor: info.status === 'Disqualified' ? '#ef4444' : '#334155',
                  color: '#fff',
                  fontSize: '0.85rem',
                }}>
                  {info.status}
                </span>
                <span style={{ color: '#fbbf24', fontSize: '0.85rem' }}>
                  Warnings: {info.warningCount || 0}
                </span>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
