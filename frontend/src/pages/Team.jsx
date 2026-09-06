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
    case 'BUZZER_UPDATE': {
      const myEvent = action.buzzerOrder.find(
        (e) => e.username === state.username
      )
      return {
        ...state,
        buzzerPosition: myEvent?.position ?? state.buzzerPosition,
        myStatus: myEvent ? 'Answering' : state.myStatus,
      }
    }
    case 'ROUND_STATE_CHANGE':
      return {
        ...state,
        roundState: action.state,
        buzzerDisabled: action.state !== 'Active',
        buzzerPosition: action.state === 'Active' ? null : state.buzzerPosition,
        myStatus: action.state === 'Active' ? 'Waiting' : state.myStatus,
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
    [state.username]
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
    send({ type: 'buzz' })
    dispatch({ type: 'SET_BUZZER_DISABLED', disabled: true })
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

  const inputStyle = { padding: '0.5rem', width: '250px', marginBottom: '0.75rem' }
  const btnStyle = { padding: '0.5rem 1.5rem' }

  // Screen 1: Choose
  if (state.screen === 'choose') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>TUNE TRACKER</h1>
        <div style={{ marginTop: '2rem' }}>
          <button
            onClick={() => handleChoose('create')}
            style={{ padding: '1rem 2rem', fontSize: '1.1rem', marginBottom: '1rem', display: 'block', width: '250px', marginLeft: 'auto', marginRight: 'auto' }}
          >
            CREATE TEAM
          </button>
          <button
            onClick={() => handleChoose('join')}
            style={{ padding: '1rem 2rem', fontSize: '1.1rem', display: 'block', width: '250px', marginLeft: 'auto', marginRight: 'auto' }}
          >
            JOIN TEAM
          </button>
        </div>
      </div>
    )
  }

  // Screen 2: Team Name (Create or Join)
  if (state.screen === 'teamname') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>TUNE TRACKER</h1>
        {chosenAction === 'create' ? (
          <>
            <p>Enter Team Name</p>
            <input
              type="text"
              placeholder="Team Name"
              value={state.teamName}
              onChange={(e) => dispatch({ type: 'SET_TEAM_NAME', name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              style={inputStyle}
            />
          </>
        ) : (
          <>
            <p>Select or search for a team to join</p>
            <input
              type="text"
              placeholder="Search teams..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: '0.5rem' }}
            />
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #555', borderRadius: '4px', marginBottom: '0.75rem', width: '250px', marginLeft: 'auto', marginRight: 'auto' }}>
              {filteredTeams.length === 0 ? (
                <p style={{ padding: '0.75rem', color: '#888', margin: 0 }}>
                  {state.teamList.length === 0 ? 'No teams available' : 'No matching teams'}
                </p>
              ) : (
                filteredTeams.map((t) => (
                  <div
                    key={t}
                    onClick={() => dispatch({ type: 'SET_TEAM_NAME', name: t })}
                    style={{
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #444',
                      backgroundColor: state.teamName === t ? '#3b82f6' : 'transparent',
                      color: state.teamName === t ? '#fff' : '#ccc',
                    }}
                  >
                    {t}
                  </div>
                ))
              )}
            </div>
            {state.teamName && (
              <p style={{ color: '#aaa', margin: '0 0 0.5rem 0' }}>
                Selected: <strong>{state.teamName}</strong>
              </p>
            )}
            {!state.teamName && (
              <p style={{ color: '#888', margin: '0 0 0.5rem 0' }}>
                Or type a team name below
              </p>
            )}
            <input
              type="text"
              placeholder="Team Name"
              value={state.teamName}
              onChange={(e) => dispatch({ type: 'SET_TEAM_NAME', name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              style={inputStyle}
            />
          </>
        )}
        <br />
        <button onClick={handleJoin} style={{ ...btnStyle, marginRight: '0.5rem' }}>
          {chosenAction === 'create' ? 'CREATE' : 'JOIN'}
        </button>
        <button onClick={handleBack} style={btnStyle}>BACK</button>
        {joinError && <p style={{ color: 'red', marginTop: '0.5rem' }}>{joinError}</p>}
      </div>
    )
  }

  // Screen 3: Username
  if (state.screen === 'username') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>{state.teamName}</h2>
        <p>Enter Username</p>
        <input
          type="text"
          placeholder="Username"
          value={state.username}
          onChange={(e) => dispatch({ type: 'SET_USERNAME', name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmitUsername()}
          style={inputStyle}
        />
        <br />
        <button onClick={handleSubmitUsername} style={btnStyle}>SUBMIT</button>
        <br />
        <button onClick={handleBack} style={{ ...btnStyle, marginTop: '0.5rem' }}>BACK</button>
        {joinError && <p style={{ color: 'red', marginTop: '0.5rem' }}>{joinError}</p>}
      </div>
    )
  }

  // Screen 4: Buzzer
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>{state.teamName}</h2>
      <p>Round: {state.roundName}</p>
      <p style={{ color: state.roundState === 'Active' ? 'green' : '#888' }}>
        {state.roundState === 'Active' ? '🟢 Buzzer Active' : '⏸ Buzzer Inactive'}
      </p>
      <p>Status: {state.myStatus}</p>
      {state.buzzerPosition !== null && <p>Position: #{state.buzzerPosition}</p>}
      <button
        onClick={handleBuzz}
        disabled={state.buzzerDisabled || state.roundState !== 'Active'}
        style={{
          fontSize: '2rem',
          padding: '1rem 3rem',
          backgroundColor: state.buzzerDisabled || state.roundState !== 'Active' ? '#888' : '#ef4444',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: state.buzzerDisabled || state.roundState !== 'Active' ? 'not-allowed' : 'pointer',
          opacity: state.buzzerDisabled || state.roundState !== 'Active' ? 0.5 : 1,
        }}
      >
        BUZZ
      </button>
      {state.buzzerDisabled && <p style={{ color: 'green', fontWeight: 'bold' }}>✓ BUZZER REGISTERED</p>}
    </div>
  )
}
