import { useReducer, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'

function formatReactionTime(ms) {
  if (ms == null) return '--'
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  const msPart = ms % 1000
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(msPart).padStart(3, '0')}`
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
      updated[action.teamName] = action.usernames || []
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
    case 'CLEAR_VIOLATIONS':
      return { ...state, violations: [] }
    case 'TEAM_LOCK':
      return { ...state, teamsLocked: action.locked }
    default:
      return state
  }
}

const medals = ['🥇', '🥈', '🥉']

const kindLabels = {
  tab_switch: 'Tab Switch',

  fullscreen_exit: 'Fullscreen Exit',
  page_close: 'Page Close',
  navigation: 'Navigation',
  exit_game: 'Exit Game',
  dual_tab: 'Dual Tab',
}

export default function Host() {
  const navigate = useNavigate()
  const [roundNameInput, setRoundNameInput] = useState('Round 1')
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmKick, setConfirmKick] = useState(null)
  const [confirmEliminate, setConfirmEliminate] = useState(null)
  const [confirmRemoveTeam, setConfirmRemoveTeam] = useState(null)

  const [state, dispatch] = useReducer(hostReducer, {
    buzzerOrder: [],
    roundState: 'Idle',
    roundName: 'Round 1',
    teams: {},
    violations: [],
    teamsLocked: false,
  })

  const handleServerMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'buzzer_update':
        dispatch({ type: 'BUZZER_UPDATE', buzzerOrder: msg.buzzer_order })
        break
      case 'round_state':
        dispatch({ type: 'ROUND_STATE', state: msg.state, startedAtMs: msg.started_at_ms, frozenElapsedMs: msg.frozen_elapsed_ms })
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
      case 'team_lock':
        dispatch({ type: 'TEAM_LOCK', locked: msg.locked })
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

  const handleKick = (teamName, username) => {
    setConfirmKick(null)
    send({ type: 'kick_user', team_name: teamName, username })
  }

  const handleEliminate = (teamName) => {
    setConfirmEliminate(null)
    send({ type: 'disqualify', team_name: teamName, username: null })
  }

  const handleRemoveTeam = (teamName) => {
    setConfirmRemoveTeam(null)
    send({ type: 'remove_team', team_name: teamName })
  }

  const handleReset = () => {
    setConfirmReset(false)
    sendControl('reset')
  }

  const handleClearViolations = () => {
    setConfirmClear(false)
    dispatch({ type: 'CLEAR_VIOLATIONS' })
    send({ type: 'reset_violations' })
  }

  const handleToggleLockTeams = () => {
    send({ type: state.teamsLocked ? 'unlock_teams' : 'lock_teams' })
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
    <>
      <style>{`
        html, body, #root {
          margin: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          border: none !important;
          border-inline: none !important;
          text-align: left !important;
          display: block !important;
        }
        .host-root {
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          background: #0f172a;
          padding: 1.5rem;
          font-family: system-ui, -apple-system, sans-serif;
          overflow-y: auto;
          overflow-x: hidden;
          box-sizing: border-box;
        }
        .host-glass {
          width: 100%;
          box-sizing: border-box;
        }
        .host-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .host-title {
          font-size: 1.8rem;
          font-weight: 700;
          margin: 0;
          color: #f3f4f6;
          text-shadow: 0 0 20px rgba(168,85,247,0.3);
        }
        .host-header-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .conn-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .round-badge {
          padding: 0.35rem 1rem;
          border-radius: 20px;
          color: #fff;
          font-weight: 700;
          font-size: 0.85rem;
        }
        .lock-badge {
          padding: 0.35rem 0.8rem;
          border-radius: 20px;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .lock-badge:hover { opacity: 0.85; }
        .logout-btn {
          padding: 0.4rem 1rem;
          background: rgba(255,255,255,0.06);
          color: #d1d5db;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .logout-btn:hover { background: rgba(255,255,255,0.12); }
        .ctrl-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          padding: 0.75rem 1rem;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 10px;
          margin-bottom: 1.25rem;
        }
        .ctrl-btn {
          padding: 0.4rem 1rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.8rem;
          color: #fff;
          transition: opacity 0.15s;
        }
        .ctrl-btn:hover { opacity: 0.85; }
        .ctrl-btn-row { display: contents; }
        .round-input {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .round-input span { color: #94a3b8; font-size: 0.85rem; }
        .round-input input {
          padding: 0.35rem 0.6rem;
          background: rgba(0,0,0,0.3);
          color: #e2e8f0;
          border: 1px solid rgba(148,163,184,0.2);
          border-radius: 4px;
          font-size: 0.85rem;
          width: 140px;
        }
        .round-input input:focus { outline: none; border-color: rgba(168,139,250,0.5); }
        .round-current { color: #64748b; font-size: 0.8rem; margin-left: 0.25rem; }
        .set-btn {
          padding: 0.35rem 0.7rem;
          background: #3b82f6;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }
        .card {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 10px;
          overflow: hidden;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 1rem;
          border-bottom: 1px solid rgba(148,163,184,0.1);
          font-weight: 700;
          font-size: 0.95rem;
          color: #f3f4f6;
        }
        .card-header .count { color: #64748b; font-weight: 400; font-size: 0.8rem; }
        .empty-row {
          padding: 1.5rem;
          text-align: center;
          color: #64748b;
          font-size: 0.85rem;
        }
        .bz-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .bz-th {
          text-align: left;
          padding: 0.5rem 0.75rem;
          color: #94a3b8;
          font-weight: 600;
          border-bottom: 1px solid rgba(148,163,184,0.1);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .bz-td {
          padding: 0.5rem 0.75rem;
          color: #e2e8f0;
          border-bottom: 1px solid rgba(148,163,184,0.05);
        }
        .bz-cards { display: none; }
        .team-card {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(148,163,184,0.08);
        }
        .team-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.4rem;
        }
        .team-card-name { font-weight: 700; color: #f3f4f6; font-size: 0.9rem; }
        .team-card-actions { display: flex; gap: 0.35rem; }
        .dq-btn {
          padding: 0.2rem 0.5rem;
          background: #dc2626;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .member-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.25rem 0 0.25rem 0.75rem;
        }
        .member-name { color: #94a3b8; font-size: 0.85rem; }
        .member-actions { display: flex; gap: 0.3rem; }
        .remove-btn {
          padding: 0.15rem 0.4rem;
          background: #d97706;
          color: #fff;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .kick-btn {
          padding: 0.15rem 0.4rem;
          background: #7c3aed;
          color: #fff;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .violation-bar {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 10px;
          overflow: hidden;
        }
        .violation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 1rem;
          border-bottom: 1px solid rgba(148,163,184,0.1);
        }
        .violation-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 700;
          font-size: 0.95rem;
          color: #f3f4f6;
        }
        .clear-btn {
          padding: 0.3rem 0.7rem;
          background: rgba(239,68,68,0.15);
          color: #f87171;
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 5px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .clear-btn:hover { background: rgba(239,68,68,0.25); }
        .violation-list { max-height: 300px; overflow-y: auto; }
        .violation-item {
          padding: 0.5rem 1rem;
          border-bottom: 1px solid rgba(148,163,184,0.05);
          font-size: 0.8rem;
          color: #fca5a5;
          background: rgba(127,29,29,0.3);
        }
        .violation-item:first-child { background: rgba(127,29,29,0.5); }
        .violation-empty {
          padding: 1rem;
          text-align: center;
          color: #64748b;
          font-size: 0.85rem;
        }
        .confirm-overlay {
          position: fixed; inset: 0; z-index: 20;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .confirm-dialog {
          background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 12px; padding: 1.5rem; width: 340px; max-width: 85vw; text-align: center;
        }
        .confirm-dialog .warn-icon { font-size: 2rem; margin-bottom: 0.5rem; }
        .confirm-dialog p { color: #e2e8f0; margin: 0 0 0.5rem 0; font-size: 0.95rem; font-weight: 600; }
        .confirm-dialog .sub { color: #94a3b8; font-size: 0.8rem; margin-bottom: 1.25rem; }
        .confirm-actions { display: flex; gap: 0.5rem; }
        .confirm-actions button { flex: 1; padding: 0.6rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
        .confirm-yes { background: #dc2626; color: #fff; }
        .confirm-no { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
        @media (max-width: 700px) {
          .host-root { padding: 1rem; }
          .host-header { flex-direction: column; align-items: flex-start; gap: 0.6rem; }
          .host-title { font-size: 1.3rem; }
          .host-header-right { width: 100%; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem; }
          .lock-badge { font-size: 0.7rem; padding: 0.3rem 0.6rem; min-height: 44px; display: inline-flex; align-items: center; }
          .logout-btn { font-size: 0.7rem; padding: 0.3rem 0.6rem; min-height: 44px; display: inline-flex; align-items: center; }
          .ctrl-bar { flex-direction: column; align-items: stretch; gap: 0.5rem; padding: 0.6rem 0.75rem; }
          .ctrl-btn { width: 100%; padding: 0.65rem; font-size: 0.85rem; min-height: 44px; }
          .ctrl-btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
          .round-input { margin-left: 0; width: 100%; flex-direction: column; align-items: stretch; gap: 0.4rem; }
          .round-input input { width: 100%; }
          .round-input .set-btn { width: 100%; min-height: 44px; }
          .round-input .round-current { margin-left: 0; text-align: center; }
          .grid { grid-template-columns: 1fr; gap: 0.75rem; }
          .card-header { font-size: 0.85rem; padding: 0.5rem 0.75rem; }

          /* Buzzer table: hide on mobile */
          .bz-table { display: none; }

          /* Buzzer card layout for mobile */
          .bz-cards { display: flex; flex-direction: column; }
          .bz-card {
            display: flex;
            align-items: center;
            padding: 0.6rem 0.75rem;
            border-bottom: 1px solid rgba(148,163,184,0.05);
            gap: 0.6rem;
          }
          .bz-card:first-child { background: rgba(34,197,94,0.08); }
          .bz-card:nth-child(2) { background: rgba(34,197,94,0.05); }
          .bz-card:nth-child(3) { background: rgba(34,197,94,0.03); }
          .bz-card-pos {
            font-size: 0.95rem;
            font-weight: 700;
            color: #f3f4f6;
            min-width: 2.2rem;
            text-align: center;
            flex-shrink: 0;
          }
          .bz-card-info { flex: 1; min-width: 0; }
          .bz-card-team {
            font-size: 0.85rem;
            font-weight: 600;
            color: #f3f4f6;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .bz-card-user {
            font-size: 0.75rem;
            color: #94a3b8;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .bz-card-time {
            font-size: 0.8rem;
            color: #94a3b8;
            font-variant-numeric: tabular-nums;
            flex-shrink: 0;
            font-family: ui-monospace, Consolas, monospace;
          }

          .team-card { padding: 0.6rem 0.75rem; }
          .team-card-name { font-size: 0.85rem; }
          .team-card-actions { gap: 0.5rem; }
          .member-row { padding: 0.3rem 0 0.3rem 0.5rem; }
          .member-name { font-size: 0.8rem; }
          .kick-btn { font-size: 0.65rem; padding: 0.25rem 0.45rem; min-height: 36px; }
          .dq-btn { font-size: 0.65rem; padding: 0.25rem 0.45rem; min-height: 36px; }
          .violation-bar { border-radius: 10px; }
          .violation-header { padding: 0.5rem 0.75rem; font-size: 0.85rem; }
          .violation-item { padding: 0.4rem 0.75rem; font-size: 0.75rem; }
          .set-btn { min-height: 44px; }
        }
      `}</style>

      <div className="host-root">
        <div className="host-glass">
          {/* Header */}
          <div className="host-header">
            <h1 className="host-title">Host Dashboard</h1>
            <div className="host-header-right">
              <span className="conn-dot" style={{ backgroundColor: connected ? '#22c55e' : '#ef4444' }} />
              <span className="round-badge" style={{ backgroundColor: roundColor[state.roundState] || '#6b7280' }}>
                {state.roundState}
              </span>
              <button onClick={handleToggleLockTeams} className="lock-badge" style={{
                backgroundColor: state.teamsLocked ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                color: state.teamsLocked ? '#f87171' : '#4ade80',
              }}>
                {state.teamsLocked ? '🔒 Teams Locked' : '🔓 Teams Open'}
              </button>
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </div>
          </div>

          {/* Control Bar */}
          <div className="ctrl-bar">
            <div className="ctrl-btn-row">
              {state.roundState === 'Active' ? (
                <button className="ctrl-btn" style={{ background: 'rgba(22,163,74,0.3)', color: '#86efac', cursor: 'default' }}>
                  ● ROUND ACTIVE
                </button>
              ) : state.roundState === 'Locked' ? (
                <button onClick={() => sendControl('start')} className="ctrl-btn" style={{ background: '#2563eb' }}>
                  🔓 UNLOCK ROUND
                </button>
              ) : (
                <button onClick={() => sendControl('start')} className="ctrl-btn" style={{ background: '#16a34a' }}>
                  ▶ START
                </button>
              )}
              {state.roundState === 'Active' ? (
                <button onClick={() => sendControl('lock')} className="ctrl-btn" style={{ background: '#d97706' }}>
                  🔒 LOCK
                </button>
              ) : state.roundState === 'Locked' ? (
                <button className="ctrl-btn" style={{ background: 'rgba(217,119,6,0.3)', color: '#fbbf24', cursor: 'default' }}>
                  🔒 LOCKED
                </button>
              ) : (
                <button onClick={() => sendControl('lock')} className="ctrl-btn" style={{ background: '#d97706', opacity: 0.5 }}>
                  🔒 LOCK
                </button>
              )}
              <button onClick={() => setConfirmReset(true)} className="ctrl-btn" style={{ background: '#dc2626' }}>
                ↺ RESET
              </button>
            </div>

            <div className="round-input">
              <span>Round:</span>
              <input type="text" value={roundNameInput}
                onChange={(e) => setRoundNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetRoundName()} />
              <button onClick={handleSetRoundName} className="set-btn">Set</button>
              <span className="round-current">
                {state.roundName}
              </span>
            </div>
          </div>

          {/* Two Column Grid */}
          <div className="grid">
            {/* Left: Buzzer Order */}
            <div className="card">
              <div className="card-header">
                <span>Buzzer Order</span>
                <span className="count">({state.buzzerOrder.length})</span>
              </div>
              {state.buzzerOrder.length === 0 ? (
                <div className="empty-row">No buzzer presses yet</div>
              ) : (
                <>
                <table className="bz-table">
                  <thead>
                    <tr>
                      <th className="bz-th">#</th>
                      <th className="bz-th">Team</th>
                      <th className="bz-th">Reaction</th>
                      <th className="bz-th">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.buzzerOrder.map((event, i) => (
                      <tr key={event.username} style={{ backgroundColor: i < 3 ? 'rgba(34,197,94,0.05)' : 'transparent' }}>
                        <td className="bz-td">
                          {i < 3 ? medals[i] + ' ' : ''}#{event.position}
                        </td>
                        <td className="bz-td">{event.team_name}</td>
                        <td className="bz-td" style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                          {formatReactionTime(event.reaction_time_ms)}
                        </td>
                        <td className="bz-td">{event.username}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bz-cards">
                  {state.buzzerOrder.map((event, i) => (
                    <div key={event.username} className="bz-card">
                      <div className="bz-card-pos">
                        {i < 3 ? medals[i] : `#${event.position}`}
                      </div>
                      <div className="bz-card-info">
                        <div className="bz-card-team">{event.team_name}</div>
                        <div className="bz-card-user">{event.username}</div>
                      </div>
                      <div className="bz-card-time">
                        {formatReactionTime(event.reaction_time_ms)}
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}
            </div>

            {/* Right: Teams */}
            <div className="card">
              <div className="card-header">
                <span>Teams</span>
                <span className="count">({teamCount} teams, {memberCount} members)</span>
              </div>
              {teamCount === 0 ? (
                <div className="empty-row">No teams joined yet</div>
              ) : (
                Object.entries(state.teams).map(([name, usernames]) => (
                  <div key={name} className="team-card">
                    <div className="team-card-header">
                      <span className="team-card-name">{name}</span>
                      <div className="team-card-actions">
                        {usernames.length === 0 && (
                          <button onClick={() => setConfirmRemoveTeam({ teamName: name })} className="dq-btn" style={{ background: 'rgba(100,116,139,0.4)', borderColor: 'rgba(100,116,139,0.6)' }}>Remove</button>
                        )}
                        <button onClick={() => setConfirmEliminate({ teamName: name })} className="dq-btn">Eliminate</button>
                      </div>
                    </div>
                    {usernames.map((u) => (
                      <div key={u} className="member-row">
                        <span className="member-name">{u}</span>
                        <div className="member-actions">
                          <button onClick={() => setConfirmKick({ teamName: name, username: u })} className="kick-btn">Kick</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Violations */}
          <div className="violation-bar">
            <div className="violation-header">
              <div className="violation-header-left">
                <span>⚠ Violation Alerts</span>
                <span className="count">({state.violations.length})</span>
              </div>
              {state.violations.length > 0 && (
                <button onClick={() => setConfirmClear(true)} className="clear-btn">Clear All</button>
              )}
            </div>
            <div className="violation-list">
              {state.violations.length === 0 ? (
                <div className="violation-empty">No violations</div>
              ) : (
                state.violations.slice().reverse().map((v, i) => (
                  <div key={i} className="violation-item">
                    ⚠️ {v.username}: {kindLabels[v.kind] || v.kind} ({v.warningCount})
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation */}
      {confirmReset && (
        <div className="confirm-overlay" onClick={() => setConfirmReset(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="warn-icon">⚠️</div>
            <p>Reset Buzzer?</p>
            <div className="sub">This will clear all buzzer data for the current round.</div>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={handleReset}>Reset</button>
              <button className="confirm-no" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Violations Confirmation */}
      {confirmClear && (
        <div className="confirm-overlay" onClick={() => setConfirmClear(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="warn-icon">⚠️</div>
            <p>Clear All Violations?</p>
            <div className="sub">This will reset all warning counts and disqualifications.</div>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={handleClearViolations}>Clear</button>
              <button className="confirm-no" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Kick Confirmation */}
      {confirmKick && (
        <div className="confirm-overlay" onClick={() => setConfirmKick(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="warn-icon">⚠️</div>
            <p>Kick {confirmKick.username}?</p>
            <div className="sub">They will be disconnected from team {confirmKick.teamName}.</div>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={() => handleKick(confirmKick.teamName, confirmKick.username)}>Kick</button>
              <button className="confirm-no" onClick={() => setConfirmKick(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Eliminate Confirmation */}
      {confirmEliminate && (
        <div className="confirm-overlay" onClick={() => setConfirmEliminate(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="warn-icon">⚠️</div>
            <p>Eliminate team {confirmEliminate.teamName}?</p>
            <div className="sub">All members will be eliminated and unable to buzz.</div>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={() => handleEliminate(confirmEliminate.teamName)}>Eliminate</button>
              <button className="confirm-no" onClick={() => setConfirmEliminate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Team Confirmation */}
      {confirmRemoveTeam && (
        <div className="confirm-overlay" onClick={() => setConfirmRemoveTeam(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="warn-icon">🗑️</div>
            <p>Remove team {confirmRemoveTeam.teamName}?</p>
            <div className="sub">This empty team will be permanently deleted.</div>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={() => handleRemoveTeam(confirmRemoveTeam.teamName)}>Remove</button>
              <button className="confirm-no" onClick={() => setConfirmRemoveTeam(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
