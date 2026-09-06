import { useState, useEffect, useReducer, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

function teamReducer(state, action) {
  switch (action.type) {
    case 'SET_JOINED':
      return { ...state, joined: action.joined }
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
        (e) => e.team_name === action.teamName
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
  }
}

export default function Team() {
  const [teamName, setTeamName] = useState('')
  const [joinError, setJoinError] = useState('')

  const [state, dispatch] = useReducer(teamReducer, {
    joined: false,
    myStatus: 'Waiting',
    buzzerDisabled: false,
    buzzerPosition: null,
    roundState: 'Idle',
  })

  const handleServerMessage = useCallback(
    (msg) => {
      switch (msg.type) {
        case 'buzzer_update':
          dispatch({
            type: 'BUZZER_UPDATE',
            buzzerOrder: msg.buzzer_order,
            teamName,
          })
          break
        case 'round_state': {
          dispatch({ type: 'ROUND_STATE_CHANGE', state: msg.state })
          if (msg.state === 'Active') {
            dispatch({ type: 'SET_JOINED', joined: true })
          }
          break
        }
        case 'team_status':
          if (msg.team_name === teamName) {
            dispatch({ type: 'SET_STATUS', status: msg.status })
          }
          break
      }
    },
    [teamName]
  )

  const { connected, send } = useWebSocket('/ws/team', handleServerMessage)

  const handleJoin = () => {
    const name = teamName.trim()
    if (!name) return
    setJoinError('')
    send({ type: 'join', team_name: name })
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

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('fullscreenchange', handleFullscreen)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('fullscreenchange', handleFullscreen)
    }
  }, [connected, send])

  if (!state.joined) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>TUNE TRACKER</h1>
        <p>Enter Team Name</p>
        <input
          type="text"
          placeholder="Team Name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        />
        <button onClick={handleJoin}>JOIN EVENT</button>
        {joinError && <p style={{ color: 'red' }}>{joinError}</p>}
        <p style={{ color: connected ? 'green' : 'red' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>{teamName}</h2>
      <p>Round: {state.roundState}</p>
      <p>Status: {state.myStatus}</p>
      {state.buzzerPosition !== null && <p>Position: #{state.buzzerPosition}</p>}
      <p style={{ color: connected ? 'green' : 'red' }}>
        {connected ? 'Connected' : 'Disconnected'}
      </p>
      <button
        onClick={handleBuzz}
        disabled={state.buzzerDisabled || state.roundState !== 'Active'}
        style={{
          fontSize: '2rem',
          padding: '1rem 3rem',
          cursor: state.buzzerDisabled || state.roundState !== 'Active' ? 'not-allowed' : 'pointer',
          opacity: state.buzzerDisabled || state.roundState !== 'Active' ? 0.5 : 1,
        }}
      >
        BUZZ
      </button>
      {state.buzzerDisabled && <p>BUZZER REGISTERED</p>}
    </div>
  )
}
