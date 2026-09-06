import { useReducer, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'

function hostReducer(state, action) {
  switch (action.type) {
    case 'BUZZER_UPDATE':
      return { ...state, buzzerOrder: action.buzzerOrder }
    case 'ROUND_STATE':
      return { ...state, roundState: action.state }
    case 'ROUND_NAME':
      return { ...state, roundName: action.name }
    case 'TEAM_JOINED': {
      const updated = { ...state.teams }
      updated[action.teamName] = action.usernames
      return { ...state, teams: updated }
    }
    case 'TEAM_STATUS': {
      const updated = { ...state.teams }
      if (action.status === 'Disqualified') {
        if (action.username && updated[action.teamName]) {
          updated[action.teamName] = updated[action.teamName].filter((u) => u !== action.username)
          if (updated[action.teamName].length === 0) delete updated[action.teamName]
        } else {
          delete updated[action.teamName]
        }
      }
      return { ...state, teams: updated }
    }
    case 'VIOLATION': {
      return {
        ...state,
        violations: [...state.violations, {
          teamName: action.teamName,
          username: action.username,
          kind: action.kind,
          warningCount: action.warningCount,
          time: new Date().toLocaleTimeString(),
        }],
      }
    }
    default:
      return state
  }
}

const medals = ['🥇', '🥈', '🥉']

export default function Host() {
  const navigate = useNavigate()
  const [roundNameInput, setRoundNameInput] = useState('Round 1')

  const [state, dispatch] = useReducer(hostReducer, {
    buzzerOrder: [],
    roundState: 'Idle',
    roundName: 'Round 1',
    teams: {},
    violations: [],
  })

  const handleServerMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'buzzer_update':
        dispatch({ type: 'BUZZER_UPDATE', buzzerOrder: msg.buzzer_order })
        break
      case 'round_state':
        dispatch({ type: 'ROUND_STATE', state: msg.state })
        break
      case 'round_name':
        dispatch({ type: 'ROUND_NAME', name: msg.name })
        break
      case 'team_joined':
        dispatch({ type: 'TEAM_JOINED', teamName: msg.team_name, usernames: msg.usernames })
        break
      case 'team_status':
        dispatch({
          type: 'TEAM_STATUS',
          teamName: msg.team_name,
          username: msg.username,
          status: msg.status,
        })
        break
      case 'violation_report':
        dispatch({
          type: 'VIOLATION',
          teamName: msg.team_name,
          username: msg.username,
          kind: msg.kind,
          warningCount: msg.warning_count,
        })
        break
    }
  }, [])

  const { connected, send } = useWebSocket('/ws/host', handleServerMessage)

  const sendControl = (type) => {
    send({ type })
  }

  const handleSetRoundName = () => {
    if (roundNameInput.trim()) {
      send({ type: 'set_round_name', name: roundNameInput.trim() })
    }
  }

  const handleDisqualify = (teamName, username) => {
    send({ type: 'disqualify', team_name: teamName, username: username || null })
  }

  const handleLogout = () => {
    sessionStorage.removeItem('hostAuth')
    navigate('/')
  }

  const roundColor = {
    Idle: '#888',
    Active: '#22c55e',
    Locked: '#ef4444',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Host Dashboard</h1>
        <div>
          <span style={{ color: connected ? 'green' : 'red', marginRight: '1rem' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button onClick={handleLogout} style={{ padding: '0.3rem 0.8rem' }}>Logout</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => sendControl('start')}>START BUZZER</button>
        <button onClick={() => sendControl('lock')}>LOCK BUZZER</button>
        <button onClick={() => sendControl('reset')}>RESET BUZZER</button>
        <button onClick={() => sendControl('reset')}>NEXT</button>
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

      <div style={{ marginBottom: '1.5rem' }}>
        <label>Round Name: </label>
        <input
          type="text"
          value={roundNameInput}
          onChange={(e) => setRoundNameInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSetRoundName()}
          style={{ padding: '0.3rem', marginRight: '0.5rem' }}
        />
        <button onClick={handleSetRoundName} style={{ padding: '0.3rem 0.8rem' }}>Set</button>
        <span style={{ marginLeft: '1rem', color: '#888' }}>Current: {state.roundName}</span>
      </div>

      <h2>Buzzer Order</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Position</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Team</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Time</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {state.buzzerOrder.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ padding: '1rem', textAlign: 'center', color: '#888' }}>
                No buzzer presses yet
              </td>
            </tr>
          ) : (
            state.buzzerOrder.map((event, i) => (
              <tr key={event.username} style={{ borderBottom: '1px solid #444' }}>
                <td style={{ padding: '0.5rem' }}>
                  {i < 3 ? medals[i] : ''} #{event.position}
                </td>
                <td style={{ padding: '0.5rem' }}>{event.team_name}</td>
                <td style={{ padding: '0.5rem' }}>{event.timestamp}</td>
                <td style={{ padding: '0.5rem' }}>{event.username}</td>
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
          Object.entries(state.teams).map(([name, usernames]) => (
            <li key={name} style={{
              padding: '0.75rem',
              marginBottom: '0.5rem',
              borderRadius: '4px',
              backgroundColor: '#1e293b',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>{name}</span>
                <button
                  onClick={() => handleDisqualify(name, null)}
                  style={{ padding: '0.2rem 0.5rem', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Disqualify Team
                </button>
              </div>
              <ul style={{ listStyle: 'none', padding: '0.5rem 0 0 1rem', margin: 0 }}>
                {usernames.map((u) => (
                  <li key={u} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                    <span>{u}</span>
                    <button
                      onClick={() => handleDisqualify(name, u)}
                      style={{ padding: '0.1rem 0.4rem', backgroundColor: '#f59e0b', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))
        )}
      </ul>

      <h2>Violation Alerts</h2>
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {state.violations.length === 0 ? (
          <p style={{ color: '#888' }}>No violations</p>
        ) : (
          state.violations.slice().reverse().map((v, i) => (
            <div key={i} style={{
              padding: '0.5rem',
              marginBottom: '0.3rem',
              borderRadius: '4px',
              backgroundColor: '#7f1d1d',
              fontSize: '0.9rem',
            }}>
              ⚠️ {v.teamName} — {v.username}: {v.kind} ({v.time})
            </div>
          ))
        )}
      </div>
    </div>
  )
}
