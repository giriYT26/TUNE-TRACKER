import { useReducer, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'

function formatReactionTime(ms) {
  if (ms == null) return '--'
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  const msPart = ms % 1000
  return `${min}:${String(sec).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`
}

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

const styles = {
  page: {
    padding: '1.5rem',
    maxWidth: '1100px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  headerTitle: {
    fontSize: '1.8rem',
    fontWeight: '700',
    margin: 0,
    color: '#f3f4f6',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  stateBadge: {
    padding: '0.35rem 1rem',
    borderRadius: '20px',
    color: '#fff',
    fontWeight: '700',
    fontSize: '0.85rem',
    letterSpacing: '0.5px',
  },
  logoutBtn: {
    padding: '0.4rem 1rem',
    backgroundColor: '#374151',
    color: '#d1d5db',
    border: '1px solid #4b5563',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  controlBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    marginBottom: '1.25rem',
    border: '1px solid #334155',
  },
  ctrlBtn: {
    padding: '0.4rem 1rem',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.8rem',
    color: '#fff',
    letterSpacing: '0.3px',
  },
  roundInput: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  input: {
    padding: '0.35rem 0.6rem',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #475569',
    borderRadius: '4px',
    fontSize: '0.85rem',
    width: '140px',
  },
  setBtn: {
    padding: '0.35rem 0.7rem',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '600',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.25rem',
    marginBottom: '1.25rem',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    border: '1px solid #334155',
    overflow: 'hidden',
  },
  cardHeader: {
    padding: '0.6rem 1rem',
    borderBottom: '1px solid #334155',
    fontWeight: '700',
    fontSize: '0.95rem',
    color: '#f3f4f6',
  },
  cardBody: {
    padding: '0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    color: '#94a3b8',
    fontWeight: '600',
    borderBottom: '1px solid #334155',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  td: {
    padding: '0.5rem 0.75rem',
    color: '#e2e8f0',
    borderBottom: '1px solid #1e293b',
  },
  emptyRow: {
    padding: '1.5rem',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.85rem',
  },
  teamCard: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #334155',
  },
  teamHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.4rem',
  },
  teamName: {
    fontWeight: '700',
    color: '#f3f4f6',
    fontSize: '0.9rem',
  },
  dqBtn: {
    padding: '0.2rem 0.5rem',
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: '600',
  },
  memberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.25rem 0 0.25rem 0.75rem',
  },
  memberName: {
    color: '#94a3b8',
    fontSize: '0.85rem',
  },
  removeBtn: {
    padding: '0.15rem 0.4rem',
    backgroundColor: '#d97706',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: '600',
  },
  violationBar: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    border: '1px solid #334155',
    overflow: 'hidden',
  },
  violationHeader: {
    padding: '0.6rem 1rem',
    borderBottom: '1px solid #334155',
    fontWeight: '700',
    fontSize: '0.95rem',
    color: '#f3f4f6',
  },
  violationList: {
    maxHeight: '180px',
    overflowY: 'auto',
  },
  violationItem: {
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #1e293b',
    fontSize: '0.8rem',
    color: '#fca5a5',
    backgroundColor: '#450a0a',
  },
  violationEmpty: {
    padding: '1rem',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.85rem',
  },
}

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
    Idle: '#6b7280',
    Active: '#22c55e',
    Locked: '#ef4444',
  }

  const teamCount = Object.keys(state.teams).length
  const memberCount = Object.values(state.teams).reduce((sum, m) => sum + m.length, 0)

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Host Dashboard</h1>
        <div style={styles.headerRight}>
          <span style={{ ...styles.stateBadge, backgroundColor: roundColor[state.roundState] || '#6b7280' }}>
            {state.roundState}
          </span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      {/* Control Bar */}
      <div style={styles.controlBar}>
        <button
          onClick={() => sendControl('start')}
          style={{ ...styles.ctrlBtn, backgroundColor: '#16a34a' }}
        >
          ▶ START
        </button>
        <button
          onClick={() => sendControl('lock')}
          style={{ ...styles.ctrlBtn, backgroundColor: '#d97706' }}
        >
          🔒 LOCK
        </button>
        <button
          onClick={() => sendControl('reset')}
          style={{ ...styles.ctrlBtn, backgroundColor: '#dc2626' }}
        >
          ↺ RESET
        </button>
        <button
          onClick={() => sendControl('reset')}
          style={{ ...styles.ctrlBtn, backgroundColor: '#2563eb' }}
        >
          ⏭ NEXT
        </button>

        <div style={styles.roundInput}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Round:</span>
          <input
            type="text"
            value={roundNameInput}
            onChange={(e) => setRoundNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetRoundName()}
            style={styles.input}
          />
          <button onClick={handleSetRoundName} style={styles.setBtn}>Set</button>
          <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: '0.25rem' }}>
            {state.roundName}
          </span>
        </div>
      </div>

      {/* Two Column Grid */}
      <div style={styles.grid}>
        {/* Left: Buzzer Order */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            Buzzer Order
            <span style={{ color: '#64748b', fontWeight: '400', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
              ({state.buzzerOrder.length})
            </span>
          </div>
          <div style={styles.cardBody}>
            {state.buzzerOrder.length === 0 ? (
              <div style={styles.emptyRow}>No buzzer presses yet</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Team</th>
                    <th style={styles.th}>Reaction</th>
                    <th style={styles.th}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {state.buzzerOrder.map((event, i) => (
                    <tr key={event.username} style={{ backgroundColor: i < 3 ? 'rgba(34,197,94,0.05)' : 'transparent' }}>
                      <td style={styles.td}>
                        {i < 3 ? medals[i] + ' ' : ''}#{event.position}
                      </td>
                      <td style={styles.td}>{event.team_name}</td>
                      <td style={{ ...styles.td, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{formatReactionTime(event.reaction_time_ms)}</td>
                      <td style={styles.td}>{event.username}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Teams */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            Teams
            <span style={{ color: '#64748b', fontWeight: '400', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
              ({teamCount} teams, {memberCount} members)
            </span>
          </div>
          <div style={styles.cardBody}>
            {teamCount === 0 ? (
              <div style={styles.emptyRow}>No teams joined yet</div>
            ) : (
              Object.entries(state.teams).map(([name, usernames]) => (
                <div key={name} style={styles.teamCard}>
                  <div style={styles.teamHeader}>
                    <span style={styles.teamName}>{name}</span>
                    <button
                      onClick={() => handleDisqualify(name, null)}
                      style={styles.dqBtn}
                    >
                      Disqualify
                    </button>
                  </div>
                  {usernames.map((u) => (
                    <div key={u} style={styles.memberRow}>
                      <span style={styles.memberName}>{u}</span>
                      <button
                        onClick={() => handleDisqualify(name, u)}
                        style={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Violations - Full Width */}
      <div style={styles.violationBar}>
        <div style={styles.violationHeader}>
          ⚠ Violation Alerts
          <span style={{ color: '#64748b', fontWeight: '400', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
            ({state.violations.length})
          </span>
        </div>
        <div style={styles.violationList}>
          {state.violations.length === 0 ? (
            <div style={styles.violationEmpty}>No violations</div>
          ) : (
            state.violations.slice().reverse().map((v, i) => (
              <div key={i} style={{
                ...styles.violationItem,
                backgroundColor: i === 0 ? '#7f1d1d' : '#450a0a',
              }}>
                ⚠️ {v.teamName} — {v.username}: {v.kind} ({v.time})
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
