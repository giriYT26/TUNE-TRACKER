import { useState, useEffect, useReducer, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

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
    default:
      return state
  }
}

export default function Team() {
  const [joinError, setJoinError] = useState('')

  const [state, dispatch] = useReducer(teamReducer, {
    screen: 'join',
    teamName: '',
    username: '',
    roundName: 'Round 1',
    myStatus: 'Waiting',
    buzzerDisabled: false,
    buzzerPosition: null,
    roundState: 'Idle',
  })

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

  const handleJoin = () => {
    const name = state.teamName.trim()
    if (!name) return
    setJoinError('')
    send({ type: 'join', team_name: name })
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

  // Screen 1: Join
  if (state.screen === 'join') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>TUNE TRACKER</h1>
        <p>Enter Team Name</p>
        <input
          type="text"
          placeholder="Team Name"
          value={state.teamName}
          onChange={(e) => dispatch({ type: 'SET_TEAM_NAME', name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          style={{ padding: '0.5rem', width: '200px', marginBottom: '1rem' }}
        />
        <br />
        <button onClick={handleJoin} style={{ padding: '0.5rem 1.5rem' }}>JOIN EVENT</button>
        {joinError && <p style={{ color: 'red' }}>{joinError}</p>}
        <p style={{ color: connected ? 'green' : 'red' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
    )
  }

  // Screen 2: Username
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
          style={{ padding: '0.5rem', width: '200px', marginBottom: '1rem' }}
        />
        <br />
        <button onClick={handleSubmitUsername} style={{ padding: '0.5rem 1.5rem' }}>SUBMIT</button>
        {joinError && <p style={{ color: 'red' }}>{joinError}</p>}
        <p style={{ color: connected ? 'green' : 'red' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
    )
  }

  // Screen 3: Buzzer
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>{state.teamName}</h2>
      <p>Round: {state.roundName}</p>
      <p style={{ color: state.roundState === 'Active' ? 'green' : '#888' }}>
        {state.roundState === 'Active' ? '🟢 Buzzer Active' : '⏸ Buzzer Inactive'}
      </p>
      <p style={{ color: connected ? 'green' : 'red' }}>
        {connected ? 'Connected' : 'Disconnected'}
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
