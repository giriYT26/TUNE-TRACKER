import { useState, useEffect, useReducer, useCallback, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

const SESSION_KEY = 'teamSession'

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(data) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {}
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}

function formatReactionTime(ms) {
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  const msPart = ms % 1000
  return `${min}:${String(sec).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`
}

function teamReducer(state, action) {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.screen }
    case 'SET_TEAM_NAME':
      return { ...state, teamName: action.name }
    case 'SET_USERNAME':
      return { ...state, username: action.name }
    case 'SET_ROUND_NAME':
      return { ...state, roundName: action.name }
    case 'SET_STATUS':
      return { ...state, myStatus: action.status }
    case 'SET_BUZZER_DISABLED':
      return { ...state, buzzerDisabled: action.disabled }
    case 'SET_BUZZER_POSITION':
      return { ...state, buzzerPosition: action.position }
    case 'SET_ROUND_STATE':
      return { ...state, roundState: action.state }
    case 'SET_TEAM_LIST':
      return { ...state, teamList: action.teams }
    case 'SET_TEAM_MEMBERS':
      return { ...state, teamMembers: action.members }
    case 'SET_REACTION_TIME':
      return { ...state, reactionTime: action.time }
    case 'BUZZER_UPDATE': {
      const myEvent = action.buzzerOrder.find(
        (e) => e.team_name === state.teamName
      )
      return {
        ...state,
        buzzerPosition: myEvent?.position ?? state.buzzerPosition,
        myStatus: myEvent ? 'Answering' : state.myStatus,
        buzzerDisabled: myEvent ? true : state.buzzerDisabled,
      }
    }
    case 'ROUND_STATE_CHANGE':
      return {
        ...state,
        roundState: action.state,
        buzzerDisabled: action.state !== 'Active',
        buzzerPosition: action.state === 'Active' ? null : state.buzzerPosition,
        myStatus: action.state === 'Active' ? 'Waiting' : state.myStatus,
        roundStartTime: action.state === 'Active' ? Date.now() : null,
        reactionTime: action.state === 'Active' ? null : state.reactionTime,
      }
    case 'RESET_SESSION':
      return {
        screen: 'choose',
        teamName: '',
        username: '',
        action: '',
        roundName: 'Round 1',
        myStatus: 'Waiting',
        buzzerDisabled: false,
        buzzerPosition: null,
        roundState: 'Idle',
        teamList: state.teamList,
        teamMembers: [],
        roundStartTime: null,
        reactionTime: null,
      }
    default:
      return state
  }
}

function getInitialState() {
  const saved = loadSession()
  if (saved && (saved.screen === 'username' || saved.screen === 'buzzer')) {
    return {
      screen: saved.screen,
      teamName: saved.teamName || '',
      username: saved.username || '',
      action: saved.action || '',
      roundName: 'Round 1',
      myStatus: 'Waiting',
      buzzerDisabled: false,
      buzzerPosition: null,
      roundState: 'Idle',
      teamList: [],
      teamMembers: [],
      roundStartTime: null,
      reactionTime: null,
    }
  }
  return {
    screen: 'choose',
    teamName: '',
    username: '',
    action: '',
    roundName: 'Round 1',
    myStatus: 'Waiting',
    buzzerDisabled: false,
    buzzerPosition: null,
    roundState: 'Idle',
    teamList: [],
    teamMembers: [],
    roundStartTime: null,
    reactionTime: null,
  }
}

export default function Team() {
  const [joinError, setJoinError] = useState('')
  const [chosenAction, setChosenAction] = useState(() => {
    const saved = loadSession()
    return saved?.action || ''
  })
  const [teamSearch, setTeamSearch] = useState('')
  const reregisteredRef = useRef(false)

  const [state, dispatch] = useReducer(teamReducer, null, getInitialState)

  const handleServerMessage = useCallback(
    (msg) => {
      switch (msg.type) {
        case 'joined':
          dispatch({ type: 'SET_SCREEN', screen: 'username' })
          setJoinError('')
          break
        case 'username_accepted':
          dispatch({ type: 'SET_ROUND_NAME', name: msg.round_name || 'Round 1' })
          dispatch({ type: 'SET_SCREEN', screen: 'buzzer' })
          setJoinError('')
          break
        case 'error':
          setJoinError(msg.message)
          break
        case 'team_list':
          dispatch({ type: 'SET_TEAM_LIST', teams: msg.teams || [] })
          break
        case 'team_joined':
          if (msg.team_name === state.teamName) {
            dispatch({ type: 'SET_TEAM_MEMBERS', members: msg.usernames || [] })
          }
          break
        case 'buzzer_update':
          dispatch({
            type: 'BUZZER_UPDATE',
            buzzerOrder: msg.buzzer_order,
          })
          break
        case 'round_state':
          dispatch({ type: 'ROUND_STATE_CHANGE', state: msg.state })
          break
        case 'round_name':
          dispatch({ type: 'SET_ROUND_NAME', name: msg.name })
          break
        case 'team_status':
          if (msg.username === state.username) {
            dispatch({ type: 'SET_STATUS', status: msg.status })
          }
          break
      }
    },
    [state.username, state.teamName]
  )

  const { connected, send } = useWebSocket('/ws/team', handleServerMessage)

  // Re-register with server on reconnect
  useEffect(() => {
    if (!connected) {
      reregisteredRef.current = false
      return
    }
    if (reregisteredRef.current) return

    const saved = loadSession()
    if (saved && saved.teamName && saved.username) {
      reregisteredRef.current = true
      send({ type: 'join', team_name: saved.teamName, action: saved.action || 'join' })
      send({ type: 'username', username: saved.username })
    } else if (saved && saved.teamName && saved.screen === 'username') {
      reregisteredRef.current = true
      send({ type: 'join', team_name: saved.teamName, action: saved.action || 'join' })
    }
  }, [connected, send])

  // Save session on screen changes
  useEffect(() => {
    if (state.screen === 'username' || state.screen === 'buzzer') {
      saveSession({
        screen: state.screen,
        teamName: state.teamName,
        username: state.username,
        action: chosenAction || state.action,
      })
    }
  }, [state.screen, state.teamName, state.username, chosenAction, state.action])

  const handleChoose = (action) => {
    dispatch({ type: 'SET_SCREEN', screen: 'teamname' })
    dispatch({ type: 'SET_TEAM_NAME', name: '' })
    setJoinError('')
    setTeamSearch('')
    setChosenAction(action)
    if (action === 'join') {
      send({ type: 'get_teams' })
    }
  }

  const handleJoin = () => {
    const name = state.teamName.trim()
    if (!name) return
    setJoinError('')
    send({ type: 'join', team_name: name, action: chosenAction })
  }

  const handleSubmitUsername = () => {
    const name = state.username.trim()
    if (!name) return
    setJoinError('')
    send({ type: 'username', username: name })
  }

  const handleBuzz = () => {
    const reactionTime = state.roundStartTime ? Date.now() - state.roundStartTime : null
    if (reactionTime !== null) {
      dispatch({ type: 'SET_REACTION_TIME', time: reactionTime })
    }
    send({ type: 'buzz', reaction_time_ms: reactionTime })
    dispatch({ type: 'SET_BUZZER_DISABLED', disabled: true })
  }

  const handleLeave = () => {
    send({ type: 'leave' })
    dispatch({ type: 'RESET_SESSION' })
    clearSession()
  }

  const handleBack = () => {
    dispatch({ type: 'RESET_SESSION' })
    setJoinError('')
    clearSession()
  }

  const filteredTeams = state.teamList.filter((t) =>
    t.toLowerCase().includes(teamSearch.toLowerCase())
  )

  useEffect(() => {
    if (!connected) return

    const reportViolation = (kind) => {
      send({ type: 'violation', kind })
    }

    const handleVisibility = () => {
      if (document.hidden) reportViolation('tab_switch')
    }
    const handleBlur = () => reportViolation('window_blur')
    const handleFullscreen = () => {
      if (!document.fullscreenElement) reportViolation('fullscreen_exit')
    }
    const handleBeforeUnload = () => {
      reportViolation('page_close')
    }
    const handlePopState = () => {
      reportViolation('navigation')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('fullscreenchange', handleFullscreen)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handlePopState)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('fullscreenchange', handleFullscreen)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [connected, send])

  const inputStyle = { padding: '0.5rem', width: '250px', maxWidth: '80vw', marginBottom: '0.75rem', boxSizing: 'border-box' }
  const btnStyle = { padding: '0.5rem 1.5rem' }

  return (
    <>
      <style>{`
        .team-root { padding: 2rem; text-align: center; }
        .team-title { font-size: 2rem; margin-bottom: 0.5rem; }
        .team-subtitle { font-size: 1.25rem; margin-bottom: 0.5rem; }
        .team-btn-big { padding: 1rem 2rem; font-size: 1.1rem; margin-bottom: 1rem; display: block; width: 250px; max-width: 80vw; margin-left: auto; margin-right: auto; }
        .buzz-btn { font-size: 2rem; padding: 1rem 3rem; border: none; border-radius: 8px; color: #fff; }
        .buzz-btn:disabled { cursor: not-allowed; opacity: 0.5; background-color: #888 !important; }
        .buzz-btn:not(:disabled) { cursor: pointer; background-color: #ef4444; }
        .buzz-btn:not(:disabled):active { transform: scale(0.95); }
        .team-search-list { max-height: 200px; overflow-y: auto; border: 1px solid #555; border-radius: 4px; margin-bottom: 0.75rem; width: 250px; max-width: 80vw; margin-left: auto; margin-right: auto; }
        .team-search-item { padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid #444; }
        .team-error { color: red; margin-top: 0.5rem; }
        .leave-btn { padding: 0.4rem 1rem; font-size: 0.85rem; background: transparent; color: #94a3b8; border: 1px solid #475569; border-radius: 6px; cursor: pointer; margin-top: 1rem; }
        .leave-btn:hover { color: #ef4444; border-color: #ef4444; }
        .member-list { display: inline-block; text-align: left; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 0.5rem 1rem; margin: 0.5rem auto; min-width: 160px; }
        .member-list-title { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem; text-align: center; }
        .member-item { padding: 0.2rem 0; color: #cbd5e1; font-size: 0.9rem; }
        .member-item-you { color: #3b82f6; font-weight: 600; }
        .reaction-timer { font-size: 1.5rem; font-family: monospace; font-variant-numeric: tabular-nums; color: #94a3b8; margin: 0.5rem 0; }
        .reaction-timer.frozen { color: #22c55e; font-weight: bold; }
        @media (max-width: 480px) {
          .team-root { padding: 1rem; }
          .team-title { font-size: 1.5rem; }
          .team-subtitle { font-size: 1rem; }
          .buzz-btn { font-size: 1.5rem; padding: 0.8rem 2rem; }
          .team-btn-big { padding: 0.8rem 1.5rem; font-size: 1rem; width: 200px; }
          .reaction-timer { font-size: 1.2rem; }
          .member-list { min-width: 140px; padding: 0.4rem 0.75rem; }
        }
      `}</style>

      <div className="team-root">
        {/* Screen 1: Choose */}
        {state.screen === 'choose' && (
          <>
            <h1 className="team-title">TUNE TRACKER</h1>
            <div style={{ marginTop: '2rem' }}>
              <button className="team-btn-big" onClick={() => handleChoose('create')}>CREATE TEAM</button>
              <button className="team-btn-big" onClick={() => handleChoose('join')}>JOIN TEAM</button>
            </div>
          </>
        )}

        {/* Screen 2: Team Name */}
        {state.screen === 'teamname' && (
          <>
            <h1 className="team-title">TUNE TRACKER</h1>
            {chosenAction === 'create' ? (
              <>
                <p>Enter Team Name</p>
                <input type="text" placeholder="Team Name" value={state.teamName}
                  onChange={(e) => dispatch({ type: 'SET_TEAM_NAME', name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()} style={inputStyle} />
              </>
            ) : (
              <>
                <p>Select or search for a team to join</p>
                <input type="text" placeholder="Search teams..." value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  style={{ ...inputStyle, marginBottom: '0.5rem' }} />
                <div className="team-search-list">
                  {filteredTeams.length === 0 ? (
                    <p style={{ padding: '0.75rem', color: '#888', margin: 0 }}>
                      {state.teamList.length === 0 ? 'No teams available' : 'No matching teams'}
                    </p>
                  ) : (
                    filteredTeams.map((t) => (
                      <div key={t} className="team-search-item"
                        onClick={() => dispatch({ type: 'SET_TEAM_NAME', name: t })}
                        style={{
                          backgroundColor: state.teamName === t ? '#3b82f6' : 'transparent',
                          color: state.teamName === t ? '#fff' : '#ccc',
                        }}>
                        {t}
                      </div>
                    ))
                  )}
                </div>
                {state.teamName && (
                  <p style={{ color: '#aaa', margin: '0 0 0.5rem 0' }}>Selected: <strong>{state.teamName}</strong></p>
                )}
                {!state.teamName && (
                  <p style={{ color: '#888', margin: '0 0 0.5rem 0' }}>Or type a team name below</p>
                )}
                <input type="text" placeholder="Team Name" value={state.teamName}
                  onChange={(e) => dispatch({ type: 'SET_TEAM_NAME', name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()} style={inputStyle} />
              </>
            )}
            <br />
            <button onClick={handleJoin} style={{ ...btnStyle, marginRight: '0.5rem' }}>
              {chosenAction === 'create' ? 'CREATE' : 'JOIN'}
            </button>
            <button onClick={handleBack} style={btnStyle}>BACK</button>
            {joinError && <p className="team-error">{joinError}</p>}
          </>
        )}

        {/* Screen 3: Username */}
        {state.screen === 'username' && (
          <>
            <h2 className="team-subtitle">{state.teamName}</h2>
            <p>Enter Username</p>
            <input type="text" placeholder="Username" value={state.username}
              onChange={(e) => dispatch({ type: 'SET_USERNAME', name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitUsername()} style={inputStyle} />
            <br />
            <button onClick={handleSubmitUsername} style={btnStyle}>SUBMIT</button>
            <br />
            <button onClick={handleBack} style={{ ...btnStyle, marginTop: '0.5rem' }}>BACK</button>
            {joinError && <p className="team-error">{joinError}</p>}
          </>
        )}

        {/* Screen 4: Buzzer */}
        {state.screen === 'buzzer' && (
          <>
            <h2 className="team-title">{state.teamName}</h2>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Round: <strong style={{ color: '#e2e8f0' }}>{state.roundName}</strong></span>
              <span style={{ color: state.roundState === 'Active' ? '#22c55e' : '#94a3b8', fontSize: '0.95rem' }}>
                {state.roundState === 'Active' ? '● Active' : '○ Inactive'}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Status: <strong style={{ color: state.myStatus === 'Answering' ? '#22c55e' : '#e2e8f0' }}>{state.myStatus}</strong></span>
              {state.buzzerPosition !== null && (
                <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Position: <strong style={{ color: '#e2e8f0' }}>#{state.buzzerPosition}</strong></span>
              )}
            </div>

            {/* Reaction Timer */}
            <div className={`reaction-timer${state.reactionTime !== null ? ' frozen' : ''}`}>
              {state.reactionTime !== null
                ? formatReactionTime(state.reactionTime)
                : '0:00.000'}
            </div>

            <div style={{ margin: '1.5rem 0' }}>
              <button
                className="buzz-btn"
                onClick={handleBuzz}
                disabled={state.buzzerDisabled || state.roundState !== 'Active'}
                style={{
                  backgroundColor: state.buzzerDisabled || state.roundState !== 'Active' ? '#888' : '#ef4444',
                }}
              >
                BUZZ
              </button>
            </div>

            {state.buzzerDisabled && <p style={{ color: '#22c55e', fontWeight: 'bold', margin: '0.5rem 0' }}>✓ BUZZER REGISTERED</p>}

            {state.teamMembers.length > 0 && (
              <div className="member-list">
                <div className="member-list-title">Team ({state.teamMembers.length}/4)</div>
                {state.teamMembers.map((m) => (
                  <div key={m} className={`member-item${m === state.username ? ' member-item-you' : ''}`}>
                    {m === state.username ? `${m} (you)` : m}
                  </div>
                ))}
              </div>
            )}

            <button className="leave-btn" onClick={handleLeave}>LEAVE TEAM</button>
          </>
        )}
      </div>
    </>
  )
}
