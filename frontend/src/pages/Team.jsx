import { useState, useEffect, useReducer, useCallback, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import ShapeGrid from '../components/ShapeGrid'
import buzzerSound from '../assets/buzzer_sound.mp4'

const SESSION_KEY = 'teamSession'
const WARNING_SEEN_KEY = 'warningSeen'

const extensionKinds = ['tab_switch', 'fullscreen_exit', 'page_close', 'navigation']

const kindLabels = {
  tab_switch: 'Tab Switch',
  fullscreen_exit: 'Fullscreen Exit',
  page_close: 'Page Close',
  navigation: 'Navigation',
  exit_game: 'Exit Game',
  dual_tab: 'Dual Tab',
}

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
  if (ms < 0) ms = 0
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  const msPart = ms % 1000
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(msPart).padStart(3, '0')}`
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
    case 'ELIMINATED':
      return { ...state, screen: 'eliminated' }
    case 'SET_BUZZER_DISABLED':
      return { ...state, buzzerDisabled: action.disabled }
    case 'SET_CLOCK_OFFSET':
      return { ...state, clockOffset: action.offset }
    case 'SET_TEAM_NAME_LOCAL':
      return { ...state, teamName: action.name }
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
    case 'TOGGLE_MENU':
      return { ...state, menuOpen: !state.menuOpen }
    case 'CLOSE_MENU':
      return { ...state, menuOpen: false }
    case 'SET_TEAM_LOCK':
      return { ...state, teamsLocked: action.locked }
    case 'SET_SESSION_TOKEN':
      return { ...state, sessionToken: action.token }
    case 'BUZZER_UPDATE': {
      const myEvent = action.buzzerOrder.find(
        (e) => e.team_name === state.teamName
      )
      const nowBuzzed = !!myEvent
      const buzzTime = (nowBuzzed && !state.teamBuzzed)
        ? (myEvent?.reaction_time_ms ?? (state.roundStartTime ? Math.max(0, (Date.now() + state.clockOffset) - state.roundStartTime) : 0))
        : nowBuzzed ? state.teamBuzzTime : null
      return {
        ...state,
        buzzerOrder: action.buzzerOrder,
        buzzerPosition: myEvent?.position ?? null,
        myStatus: myEvent ? 'Answered' : 'Pending',
        buzzerDisabled: nowBuzzed,
        teamBuzzed: nowBuzzed,
        teamBuzzTime: buzzTime,
      }
    }
    case 'ROUND_STATE_CHANGE': {
      const isNewRound = action.state === 'Active' && action.startedAtMs !== state.roundStartTime
      const isUnlock = action.state === 'Active' && state.roundState === 'Locked'
      const isStartFromIdle = action.state === 'Active' && state.roundState === 'Idle'

      if (isNewRound || isStartFromIdle) {
        return {
          ...state,
          roundState: action.state,
          buzzerDisabled: false,
          buzzerPosition: null,
          myStatus: 'Pending',
          roundStartTime: action.startedAtMs,
          reactionTime: null,
          teamBuzzed: false,
          teamBuzzTime: null,
          buzzerOrder: [],
        }
      }

      if (isUnlock) {
        const frozenElapsed = state.roundStartTime
          ? (state.frozenAtLock ?? (Date.now() + state.clockOffset - state.roundStartTime))
          : 0
        const resumedStartTime = Date.now() + state.clockOffset - frozenElapsed
        return {
          ...state,
          roundState: action.state,
          buzzerDisabled: false,
          buzzerPosition: null,
          roundStartTime: resumedStartTime,
          frozenAtLock: null,
          teamBuzzed: false,
          myStatus: 'Pending',
          teamBuzzTime: null,
          buzzerOrder: [],
          reactionTime: null,
        }
      }

      if (action.state === 'Locked' && state.roundState === 'Active') {
        const elapsed = state.roundStartTime ? (Date.now() + state.clockOffset - state.roundStartTime) : 0
        return {
          ...state,
          roundState: action.state,
          buzzerDisabled: true,
          frozenAtLock: elapsed,
        }
      }

      return {
        ...state,
        roundState: action.state,
        buzzerDisabled: action.state !== 'Active',
        buzzerPosition: action.state === 'Active' ? null : state.buzzerPosition,
        roundStartTime: action.state === 'Idle' ? null : state.roundStartTime,
      }
    }
    case 'RESET_SESSION':
      return {
        screen: 'choose',
        teamName: '',
        username: '',
        action: '',
        roundName: 'Round 1',
        myStatus: 'Pending',
        buzzerDisabled: false,
        buzzerPosition: null,
        roundState: 'Idle',
        teamList: state.teamList,
        teamMembers: [],
        roundStartTime: null,
        reactionTime: null,
        teamBuzzed: false,
        teamBuzzTime: null,
        buzzerOrder: [],
        menuOpen: false,
        teamsLocked: state.teamsLocked,
        sessionToken: null,
        clockOffset: 0,
        frozenAtLock: null,
      }
    default:
      return state
  }
}

function getInitialState() {
  const saved = loadSession()
  if (saved && saved.screen === 'buzzer') {
    return {
      screen: saved.screen,
      teamName: saved.teamName || '',
      username: saved.username || '',
      action: saved.action || '',
      roundName: 'Round 1',
      myStatus: 'Pending',
      buzzerDisabled: true,
      buzzerPosition: null,
      roundState: 'Idle',
      teamList: [],
      teamMembers: [],
      roundStartTime: null,
      reactionTime: null,
      teamBuzzed: false,
      teamBuzzTime: null,
      buzzerOrder: [],
      menuOpen: false,
      teamsLocked: false,
      sessionToken: saved.sessionToken || null,
      clockOffset: 0,
      frozenAtLock: null,
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
    teamBuzzed: false,
    teamBuzzTime: null,
    buzzerOrder: [],
    menuOpen: false,
    teamsLocked: false,
    sessionToken: null,
    clockOffset: 0,
    frozenAtLock: null,
  }
}

export default function Team() {
  const [joinError, setJoinError] = useState('')
  const [chosenAction, setChosenAction] = useState(() => {
    const saved = loadSession()
    return saved?.action || ''
  })
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [teamSearch, setTeamSearch] = useState('')
  const [usernameEntered, setUsernameEntered] = useState(() => {
    const saved = loadSession()
    return saved?.screen === 'buzzer' || false
  })
  const [lobbyUsername, setLobbyUsername] = useState('')
  const autoJoiningRef = useRef(false)
  const reregisteredRef = useRef(false)

  const [state, dispatch] = useReducer(teamReducer, null, getInitialState)
  const [tick, setTick] = useState(0)
  const [warningNotice, setWarningNotice] = useState(null)
  const [renamingTeam, setRenamingTeam] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const buzzerAudioRef = useRef(null)

  // Preload buzzer sound once
  useEffect(() => {
    const audio = new Audio(buzzerSound)
    audio.preload = 'auto'
    audio.load()
    buzzerAudioRef.current = audio
  }, [])

  // Live ticking timer — updates display every ~16ms while round is active and team hasn't buzzed
  useEffect(() => {
    if (state.roundState !== 'Active' || state.reactionTime !== null || state.teamBuzzed || state.buzzerDisabled) return
    const id = setInterval(() => setTick((t) => t + 1), 16)
    return () => clearInterval(id)
  }, [state.roundState, state.reactionTime, state.teamBuzzed, state.buzzerDisabled])

  // Auto-dismiss warning notification after 5 seconds
  useEffect(() => {
    if (!warningNotice) return
    const timer = setTimeout(() => setWarningNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [warningNotice])

  // Toggle buzzer-active class on html/body/#root for fullscreen bg
  useEffect(() => {
    const cls = 'buzzer-active'
    const targets = [document.documentElement, document.body, document.getElementById('root')]
    if (state.screen === 'buzzer') {
      targets.forEach((el) => { if (el) el.classList.add(cls) })
    }
    return () => { targets.forEach((el) => { if (el) el.classList.remove(cls) }) }
  }, [state.screen])

  const handleServerMessage = useCallback(
    (msg) => {
      switch (msg.type) {
        case 'joined':
          autoJoiningRef.current = false
          send({ type: 'username', username: lobbyUsername.trim() })
          break
        case 'username_accepted':
          dispatch({ type: 'SET_ROUND_NAME', name: msg.round_name || 'Round 1' })
          dispatch({ type: 'SET_SCREEN', screen: 'buzzer' })
          if (msg.session_token) {
            dispatch({ type: 'SET_SESSION_TOKEN', token: msg.session_token })
          }
          setJoinError('')
          break
        case 'reconnect_accepted':
          dispatch({ type: 'SET_SESSION_TOKEN', token: msg.session_token })
          dispatch({ type: 'SET_TEAM_NAME', name: msg.team_name })
          dispatch({ type: 'SET_USERNAME', name: msg.username })
          dispatch({ type: 'SET_ROUND_NAME', name: msg.round_name || 'Round 1' })
          dispatch({ type: 'SET_SCREEN', screen: 'buzzer' })
          setJoinError('')
          break
        case 'error':
          setJoinError(msg.message)
          break
        case 'session_expired':
          dispatch({ type: 'RESET_SESSION' })
          clearSession()
          setUsernameEntered(false)
          setLobbyUsername('')
          setJoinError('Session expired. Please rejoin.')
          break
        case 'username_status':
          if (msg.team_name) {
            autoJoiningRef.current = true
            dispatch({ type: 'SET_USERNAME', name: lobbyUsername.trim() })
            dispatch({ type: 'SET_TEAM_NAME', name: msg.team_name })
            setChosenAction('join')
            send({ type: 'join', team_name: msg.team_name, action: 'join' })
          } else {
            setUsernameEntered(true)
          }
          break
        case 'team_list':
          dispatch({ type: 'SET_TEAM_LIST', teams: msg.teams || [] })
          break
        case 'team_joined':
          send({ type: 'get_teams' })
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
          if (msg.state === 'Active' && msg.started_at_ms != null && msg.server_now != null) {
            const offset = msg.server_now - Date.now()
            dispatch({ type: 'SET_CLOCK_OFFSET', offset })
          }
          dispatch({ type: 'ROUND_STATE_CHANGE', state: msg.state, startedAtMs: msg.started_at_ms })
          break
        case 'round_name':
          dispatch({ type: 'SET_ROUND_NAME', name: msg.name })
          break
        case 'team_status':
          if (msg.username === state.username) {
            if (msg.status === 'Disqualified') {
              dispatch({ type: 'ELIMINATED' })
              clearSession()
            } else {
              dispatch({ type: 'SET_STATUS', status: msg.status })
            }
          }
          break
        case 'team_lock':
          dispatch({ type: 'SET_TEAM_LOCK', locked: msg.locked })
          break
        case 'kicked':
          if (msg.username === state.username) {
            dispatch({ type: 'RESET_SESSION' })
            clearSession()
            setUsernameEntered(false)
            setLobbyUsername('')
            setJoinError('You have been kicked from the team.')
          }
          break
        case 'violation_report':
          if (msg.username === state.username) {
            if (extensionKinds.includes(msg.kind) && !localStorage.getItem(WARNING_SEEN_KEY)) {
              setWarningNotice({ kind: msg.kind, warningCount: msg.warning_count })
              localStorage.setItem(WARNING_SEEN_KEY, '1')
            }
          }
          break
        case 'team_name_changed':
          if (msg.old_name === state.teamName) {
            dispatch({ type: 'SET_TEAM_NAME', name: msg.new_name })
            dispatch({ type: 'SET_TEAM_NAME_LOCAL', name: msg.new_name })
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
    if (saved && saved.sessionToken && saved.teamName && saved.username) {
      reregisteredRef.current = true
      send({ type: 'reconnect', session_token: saved.sessionToken })
    } else if (saved && saved.teamName && saved.username) {
      reregisteredRef.current = true
      send({ type: 'join', team_name: saved.teamName, action: saved.action || 'join' })
      send({ type: 'username', username: saved.username })
    }
  }, [connected, send])

  // Save session on screen changes
  useEffect(() => {
    if (state.screen === 'buzzer') {
      saveSession({
        screen: state.screen,
        teamName: state.teamName,
        username: state.username,
        action: chosenAction || state.action,
        teamBuzzed: state.teamBuzzed,
        teamBuzzTime: state.teamBuzzTime,
        roundStartTime: state.roundStartTime,
        buzzerPosition: state.buzzerPosition,
        sessionToken: state.sessionToken,
      })
    }
  }, [state.screen, state.teamName, state.username, chosenAction, state.action, state.teamBuzzed, state.teamBuzzTime, state.roundStartTime, state.buzzerPosition, state.sessionToken])

  const handleJoinTeam = (teamName) => {
    dispatch({ type: 'SET_TEAM_NAME', name: teamName })
    setChosenAction('join')
    setJoinError('')
    send({ type: 'join', team_name: teamName, action: 'join' })
  }

  const handleCreateTeam = () => {
    const name = state.teamName.trim()
    if (!name) return
    setJoinError('')
    setChosenAction('create')
    autoJoiningRef.current = true
    send({ type: 'join', team_name: name, action: 'create' })
  }

  const handleSubmitUsername = () => {
    const name = state.username.trim()
    if (!name) {
      setJoinError('Please enter a username')
      return
    }
    setJoinError('')
    send({ type: 'username', username: name })
  }

  const handleCheckUsername = () => {
    const name = lobbyUsername.trim()
    if (!name) {
      setJoinError('Please enter your name')
      return
    }
    setJoinError('')
    send({ type: 'check_username', username: name })
  }

  const handleBuzz = () => {
    if (buzzerAudioRef.current) {
      buzzerAudioRef.current.currentTime = 0
      buzzerAudioRef.current.play()
    }
    send({ type: 'buzz' })
  }

  const handleLeave = () => {
    setConfirmLeave(false)
    dispatch({ type: 'CLOSE_MENU' })
    send({ type: 'violation', kind: 'exit_game' })
    send({ type: 'leave' })
    dispatch({ type: 'RESET_SESSION' })
    setUsernameEntered(false)
    setLobbyUsername('')
    clearSession()
  }

  useEffect(() => {
    if (state.screen === 'choose') {
      send({ type: 'get_teams' })
    }
  }, [state.screen, send])

  useEffect(() => {
    if (!connected) return

    const reportViolation = (kind) => {
      send({ type: 'violation', kind })
    }

    const handleVisibility = () => {
      if (document.hidden) reportViolation('tab_switch')
    }
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
    document.addEventListener('fullscreenchange', handleFullscreen)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handlePopState)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('fullscreenchange', handleFullscreen)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [connected, send])

  return (
    <>
      <style>{`
        .team-root { padding: 2rem; text-align: center; }
        .team-root.buzzer-active { background: transparent; padding: 0; border: none; }
        html.buzzer-active, body.buzzer-active, #root.buzzer-active {
          background: #000 !important;
          width: 100% !important;
          max-width: 100% !important;
          border: none !important;
          margin: 0 !important;
        }
        .team-title { font-size: 2rem; margin-bottom: 0.5rem; }
        .team-subtitle { font-size: 1.25rem; margin-bottom: 0.5rem; }
        .team-btn-big { padding: 1rem 2rem; font-size: 1.1rem; margin-bottom: 1rem; display: block; width: 250px; max-width: 80vw; margin-left: auto; margin-right: auto; }
        .lobby-create-btn {
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          width: 100%; padding: 0.75rem 1rem; margin-bottom: 1.5rem;
          background: rgba(168, 139, 250, 0.15); border: 1px solid rgba(168, 139, 250, 0.3);
          border-radius: 10px; color: #a78bfa; font-size: 0.95rem; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
        }
        .lobby-create-btn:hover { background: rgba(168, 139, 250, 0.25); border-color: rgba(168, 139, 250, 0.5); }
        .lobby-create-form {
          background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 10px; padding: 1rem; margin-bottom: 1.5rem;
        }
        .lobby-create-form input {
          width: 100%; padding: 0.6rem 0.75rem; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px;
          color: #e2e8f0; font-size: 0.9rem; margin-bottom: 0.75rem; box-sizing: border-box;
        }
        .lobby-create-form input::placeholder { color: #64748b; }
        .lobby-create-form input:focus { outline: none; border-color: rgba(168, 139, 250, 0.5); }
        .lobby-create-actions { display: flex; gap: 0.5rem; }
        .lobby-create-actions button { flex: 1; padding: 0.5rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
        .lobby-create-actions .create-submit { background: #7c3aed; color: #fff; }
        .lobby-create-actions .create-cancel { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); }
        .lobby-section-title {
          font-size: 0.7rem; color: #64748b; text-transform: uppercase;
          letter-spacing: 1px; margin-bottom: 0.5rem; font-weight: 700; text-align: left;
        }
        .lobby-team-list { text-align: left; max-height: 300px; overflow-y: auto; }
        .lobby-search {
          width: 100%; padding: 0.6rem 0.75rem; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px;
          color: #e2e8f0; font-size: 0.85rem; margin-bottom: 0.5rem; box-sizing: border-box;
        }
        .lobby-search::placeholder { color: #64748b; }
        .lobby-search:focus { outline: none; border-color: rgba(168, 139, 250, 0.5); }
        .lobby-team-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.7rem 1rem; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
          margin-bottom: 0.35rem; cursor: pointer; transition: all 0.15s;
        }
        .lobby-team-item:hover { background: rgba(168, 139, 250, 0.1); border-color: rgba(168, 139, 250, 0.25); }
        .lobby-team-name { color: #e2e8f0; font-weight: 600; font-size: 0.9rem; }
        .lobby-team-size { color: #94a3b8; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
        .lobby-team-full { color: #64748b; font-size: 0.75rem; }
        .lobby-empty { color: #475569; font-size: 0.85rem; text-align: center; padding: 2rem 0; }
        .lobby-bg { position: relative; min-height: 100vh; min-height: 100dvh; }
        .lobby-bg-grid { position: fixed; inset: 0; z-index: 0; }
        .lobby { position: relative; z-index: 1; max-width: 400px; margin: 0 auto; padding: 2rem 0; }
        .lobby-locked-banner {
          padding: 0.6rem 1rem; margin-bottom: 1rem;
          background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px; color: #f87171; font-size: 0.85rem; font-weight: 600; text-align: center;
        }
        .lobby-team-item.locked { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
        .lobby-rules {
          margin-top: 1.5rem;
          background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 10px; overflow: hidden;
        }
        .lobby-rules-header {
          padding: 0.6rem 1rem;
          border-bottom: 1px solid rgba(148,163,184,0.1);
          font-weight: 700; font-size: 0.9rem; color: #a78bfa;
        }
        .lobby-rules-list {
          padding: 0.75rem 1rem 0.75rem 1.5rem;
          margin: 0; text-align: left;
        }
        .lobby-rules-list li {
          color: #94a3b8; font-size: 0.8rem; line-height: 1.6;
          margin-bottom: 0.25rem;
        }
        .lobby-rules-list li:last-child { margin-bottom: 0; }
        .confirm-overlay {
          position: fixed; inset: 0; z-index: 20;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .confirm-dialog, .username-modal {
          background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 12px; padding: 1.5rem; width: 300px; max-width: 85vw; text-align: center;
        }
        .username-modal input {
          width: 100%; padding: 0.6rem 0.75rem; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px;
          color: #e2e8f0; font-size: 0.9rem; margin-bottom: 0.75rem; box-sizing: border-box;
        }
        .username-modal input::placeholder { color: #64748b; }
        .username-modal input:focus { outline: none; border-color: rgba(168, 139, 250, 0.5); }
        .username-modal h3 { color: #f1f5f9; margin: 0 0 0.25rem 0; font-size: 1.1rem; }
        .username-modal .sub-label { color: #94a3b8; font-size: 0.85rem; margin: 0 0 1rem 0; }
        .username-modal .modal-error { color: #f87171; font-size: 0.8rem; margin: 0 0 0.75rem 0; }
        .username-modal-actions { display: flex; gap: 0.5rem; }
        .username-modal-actions button { flex: 1; padding: 0.6rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
        .username-modal-actions .modal-submit { background: #7c3aed; color: #fff; }
        .username-modal-actions .modal-cancel { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); }
        .confirm-dialog p { color: #e2e8f0; margin: 0 0 1.25rem 0; font-size: 0.95rem; }
        .confirm-actions { display: flex; gap: 0.5rem; }
        .confirm-actions button { flex: 1; padding: 0.6rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
        .confirm-yes { background: #dc2626; color: #fff; }
        .confirm-no { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
        .buzzer-bg {
          position: fixed; inset: 0;
          background: #0a0a0a url('/bg_2.png') center/cover no-repeat;
          z-index: 0;
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; min-height: 100dvh;
        }
        .buzzer-glass {
          position: relative; z-index: 1;
          width: 90%; max-width: 420px;
          padding: 2rem 1.5rem;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          text-align: center;
        }
        .buzzer-glass .team-title { color: #f1f5f9; text-shadow: 0 0 20px rgba(168,85,247,0.4); }
        .buzzer-glass .info-row { display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; font-size: 0.85rem; }
        .buzzer-glass .info-label { color: #94a3b8; }
        .buzzer-glass .info-value { color: #e2e8f0; font-weight: 600; }
        .buzzer-glass .info-locked { color: #ef4444; }
        .reaction-timer { font-size: 2rem; font-family: monospace; font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.7); margin: 1rem 0; text-shadow: 0 0 12px rgba(168,85,247,0.3); }
        .reaction-timer.frozen { color: #22c55e; font-weight: bold; text-shadow: 0 0 16px rgba(34,197,94,0.5); }
        .buzz-btn { font-size: 2rem; padding: 1rem 3rem; border: none; border-radius: 12px; color: #fff; }
        .buzz-btn:disabled { cursor: not-allowed; opacity: 0.4; background-color: rgba(100,116,139,0.6) !important; }
        .buzz-btn:not(:disabled) { cursor: pointer; background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 4px 20px rgba(239,68,68,0.4); }
        .buzz-btn:not(:disabled):active { transform: scale(0.95); }
        .buzzer-glass .buzzer-msg { color: #22c55e; font-weight: bold; margin: 0.5rem 0; font-size: 0.9rem; }
        .menu-toggle {
          position: absolute; top: 0.75rem; right: 0.75rem; z-index: 2;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; padding: 0.4rem 0.6rem; cursor: pointer;
          color: rgba(255,255,255,0.6); font-size: 1.1rem; line-height: 1;
          transition: background 0.2s;
        }
        .menu-toggle:hover { background: rgba(255,255,255,0.2); color: #fff; }
        .side-menu-overlay {
          position: fixed; inset: 0; z-index: 10;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; justify-content: flex-end;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .side-menu {
          width: 300px; max-width: 85vw; height: 100vh; height: 100dvh;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-left: 1px solid rgba(148, 163, 184, 0.15);
          display: flex; flex-direction: column;
          animation: slideIn 0.25s ease;
          overflow-y: auto;
        }
        .side-menu-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1rem 1.25rem; border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }
        .side-menu-header h3 { margin: 0; color: #f1f5f9; font-size: 1rem; }
        .side-menu-close {
          background: none; border: none; color: rgba(255,255,255,0.5);
          font-size: 1.4rem; cursor: pointer; padding: 0; line-height: 1;
        }
        .side-menu-close:hover { color: #fff; }
        .side-menu-section { padding: 0.75rem 1.25rem; }
        .side-menu-section-title {
          font-size: 0.65rem; color: #64748b; text-transform: uppercase;
          letter-spacing: 1px; margin-bottom: 0.5rem; font-weight: 700;
        }
        .menu-member-item {
          padding: 0.35rem 0.75rem; color: rgba(255,255,255,0.7); font-size: 0.85rem;
          border-radius: 6px; margin-bottom: 0.15rem;
        }
        .menu-member-item.is-me { color: #a78bfa; font-weight: 600; background: rgba(168, 139, 250, 0.1); }
        .menu-leave-btn {
          display: block; width: 100%; padding: 0.6rem; margin-top: 0.5rem;
          background: transparent; color: rgba(255,255,255,0.4);
          border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
          cursor: pointer; font-size: 0.85rem; transition: all 0.2s;
        }
        .menu-leave-btn:hover { color: #ef4444; border-color: #ef4444; background: rgba(239,68,68,0.08); }
        .eliminated-bg {
          position: fixed; inset: 0;
          background: #0a0a0a;
          z-index: 0;
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; min-height: 100dvh;
        }
        .eliminated-glass {
          position: relative; z-index: 1;
          width: 90%; max-width: 420px;
          padding: 2.5rem 1.5rem;
          background: rgba(127, 29, 29, 0.4);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          text-align: center;
        }
        .eliminated-glass .elim-icon { font-size: 4rem; margin-bottom: 2.5rem; }
        .eliminated-glass .elim-title {
          color: #f87171; font-size: 1.8rem; font-weight: 800;
          text-shadow: 0 0 20px rgba(239,68,68,0.5); margin: 0 0 0.5rem 0;
        }
        .eliminated-glass .elim-sub {
          color: #fca5a5; font-size: 0.95rem; margin: 0 0 2rem 0;
        }
        .eliminated-glass .elim-btn {
          padding: 0.75rem 2rem; background: rgba(239,68,68,0.2);
          border: 1px solid rgba(239,68,68,0.4); border-radius: 8px;
          color: #fca5a5; font-size: 0.9rem; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
        }
        .eliminated-glass .elim-btn:hover { background: rgba(239,68,68,0.3); color: #fff; }
        .warning-banner {
          position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          padding: 0.75rem 1rem;
          background: rgba(234,179,8,0.95); backdrop-filter: blur(8px);
          color: #1a1a1a; font-weight: 700; font-size: 0.85rem;
          display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 4px 20px rgba(234,179,8,0.3);
          animation: slideDown 0.3s ease;
        }
        @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        .warning-banner .warn-close {
          background: none; border: none; font-size: 1.2rem; cursor: pointer;
          color: #1a1a1a; padding: 0 0.5rem; font-weight: 700;
        }
        .real-name-hint { color: #64748b; font-size: 0.75rem; margin-top: 0.25rem; }
        @media (max-width: 480px) {
          .team-root { padding: 1rem; }
          .team-title { font-size: 1.5rem; }
          .team-subtitle { font-size: 1rem; }
          .buzzer-glass { padding: 1.5rem 1rem; }
          .buzzer-glass .info-row { gap: 0.75rem; font-size: 0.8rem; }
          .buzz-btn { font-size: 1.5rem; padding: 0.8rem 2rem; }
          .team-btn-big { padding: 0.8rem 1.5rem; font-size: 1rem; width: 200px; }
          .reaction-timer { font-size: 1.5rem; }
          .side-menu { width: 260px; }
        }
      `}</style>

      <div className={`team-root${state.screen === 'buzzer' ? ' buzzer-active' : ''}`}>
        {/* Screen 1: Lobby */}
        {state.screen === 'choose' && (
          <div className="lobby-bg">
            <div className="lobby-bg-grid">
              <ShapeGrid
                direction="diagonal"
                speed={0.13}
                borderColor="#634599"
                hoverFillColor="#222"
                shape="hexagon"
                hoverTrailAmount={5}
                squareSize={46}
              />
            </div>
            <div className="lobby">
              <h1 className="team-title">TUNE TRACKER</h1>

              {state.teamsLocked && (
                <div className="lobby-locked-banner">🔒 Teams are locked by the host</div>
              )}

              {!usernameEntered && !state.teamsLocked ? (
                <div className="lobby-create-form">
                  <p className="sub-label">Enter your name to get started</p>
                  <p className="real-name-hint">Enter your real name (no pseudonyms)</p>
                  <input type="text" placeholder="Your real name" value={lobbyUsername}
                    onChange={(e) => { setLobbyUsername(e.target.value); setJoinError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleCheckUsername()} autoFocus />
                  <div className="lobby-create-actions">
                    <button className="create-submit" onClick={handleCheckUsername}>CONTINUE</button>
                  </div>
                  {joinError && <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>{joinError}</p>}
                </div>
              ) : usernameEntered && !state.teamsLocked && (creatingTeam ? (
                <div className="lobby-create-form">
                  <input type="text" placeholder="Team Name" value={state.teamName}
                    onChange={(e) => dispatch({ type: 'SET_TEAM_NAME', name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()} autoFocus />
                  <div className="lobby-create-actions">
                    <button className="create-submit" onClick={handleCreateTeam}>CREATE</button>
                    <button className="create-cancel" onClick={() => { setCreatingTeam(false); dispatch({ type: 'SET_TEAM_NAME', name: '' }); setJoinError('') }}>BACK</button>
                  </div>
                  {joinError && <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>{joinError}</p>}
                </div>
              ) : (
                <button className="lobby-create-btn" onClick={() => { setCreatingTeam(true); setJoinError('') }}>
                  <span style={{ fontSize: '1.2rem' }}>+</span> CREATE TEAM
                </button>
              ))}

              {joinError && !state.teamsLocked && !creatingTeam && usernameEntered && (
                <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>{joinError}</p>
              )}

              {usernameEntered && (
                <>
                  <div className="lobby-section-title">TEAMS ({state.teamList.length})</div>
                  {state.teamList.length > 0 && (
                    <input type="text" className="lobby-search" placeholder="Search teams..."
                      value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} />
                  )}
                  <div className="lobby-team-list">
                    {state.teamList.length === 0 ? (
                      <div className="lobby-empty">No teams yet</div>
                    ) : (() => {
                      const filtered = state.teamList.filter((t) =>
                        t.name.toLowerCase().includes(teamSearch.toLowerCase())
                      )
                      if (filtered.length === 0) {
                        return <div className="lobby-empty">No matching teams</div>
                      }
                      return filtered.map((t) => (
                        <div key={t.name}
                          className={`lobby-team-item${state.teamsLocked ? ' locked' : ''}`}
                          onClick={() => !state.teamsLocked && handleJoinTeam(t.name)}>
                          <span className="lobby-team-name">{t.name}</span>
                          <span className={t.size >= t.limit ? 'lobby-team-full' : 'lobby-team-size'}>
                            {t.size}/{t.limit}{t.size >= t.limit ? ' (full)' : ''}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                </>
              )}

              <div className="lobby-rules">
                <div className="lobby-rules-header">Competition Rules</div>
                <ol className="lobby-rules-list">
                  <li>No Shazam, SoundHound, or music identification apps.</li>
                  <li>Phones must be placed face down on the table during all rounds.</li>
                  <li>Answers must be submitted within the allotted countdown.</li>
                  <li>Shouting answers out of turn results in immediate point deduction.</li>
                  <li>Cheating will lead to disqualification.</li>
                  <li>Judges' and organizers' decision is final and binding.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Screen 2: Buzzer */}
        {state.screen === 'buzzer' && (
          <div className="buzzer-bg">
            {warningNotice && (
              <div className="warning-banner">
                <span>⚠ Warning: {kindLabels[warningNotice.kind] || warningNotice.kind} ({warningNotice.warningCount})</span>
                <button className="warn-close" onClick={() => setWarningNotice(null)}>✕</button>
              </div>
            )}
            <div className="buzzer-glass">
              <button className="menu-toggle" onClick={() => dispatch({ type: 'TOGGLE_MENU' })}>☰</button>
              <h2 className="team-title">{state.teamName}</h2>

              <div className="info-row">
                <span className="info-label">Round: <span className="info-value">{state.roundName}</span></span>
                <span className="info-label">Status: <span style={{
                  color: state.roundState === 'Locked' ? '#ef4444' :
                         state.roundState !== 'Active' ? '#ef4444' :
                         state.myStatus === 'Answered' ? '#22c55e' : '#eab308',
                  fontWeight: 600
                }}>{state.roundState === 'Locked' ? 'Locked' :
                     state.roundState !== 'Active' ? 'Not Started' : state.myStatus}</span></span>
                {state.buzzerPosition !== null && (
                  <span className="info-label">Position: <span className="info-value">#{state.buzzerPosition}</span></span>
                )}
              </div>

            {/* Reaction Timer */}
            <div className={`reaction-timer${state.reactionTime !== null || state.teamBuzzed ? ' frozen' : ''}`}>
              {state.reactionTime !== null
                ? formatReactionTime(state.reactionTime)
                : state.teamBuzzed && state.teamBuzzTime !== null
                  ? formatReactionTime(state.teamBuzzTime)
                  : state.roundStartTime
                    ? formatReactionTime(Math.max(0, (Date.now() + state.clockOffset) - state.roundStartTime))
                    : '00:00:000'}
            </div>

              <div style={{ margin: '1.5rem 0' }}>
                <button
                  className="buzz-btn"
                  onClick={handleBuzz}
                  disabled={state.buzzerDisabled || state.roundState !== 'Active'}
                  style={{
                    backgroundColor: state.buzzerDisabled || state.roundState !== 'Active' ? 'rgba(100,116,139,0.6)' : undefined,
                  }}
                >
                  BUZZ
                </button>
              </div>

              {state.buzzerDisabled && state.roundState === 'Active' && <p className="buzzer-msg">✓ BUZZER REGISTERED</p>}
            </div>

            {/* Side Menu Overlay */}
            {state.menuOpen && (
              <div className="side-menu-overlay" onClick={() => dispatch({ type: 'CLOSE_MENU' })}>
                <div className="side-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="side-menu-header">
                    <h3>{state.teamName}</h3>
                    <button className="side-menu-close" onClick={() => dispatch({ type: 'CLOSE_MENU' })}>×</button>
                  </div>

                  {/* Team Members */}
                  {state.teamMembers.length > 0 && (
                    <div className="side-menu-section">
                      <div className="side-menu-section-title">Team ({state.teamMembers.length}/1)</div>
                      {state.teamMembers.map((m) => (
                        <div key={m} className={`menu-member-item${m === state.username ? ' is-me' : ''}`}>
                          {m === state.username ? `${m} (you)` : m}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rename Team */}
                  {!state.teamsLocked && (
                    <div className="side-menu-section">
                      {!renamingTeam ? (
                        <button className="menu-leave-btn" onClick={() => { setRenamingTeam(true); setRenameValue(state.teamName) }}>Rename Team</button>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input type="text" value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newName = renameValue.trim()
                                if (newName && newName !== state.teamName) {
                                  send({ type: 'set_team_name', team_name: state.teamName, new_name: newName })
                                }
                                setRenamingTeam(false)
                              }
                              if (e.key === 'Escape') setRenamingTeam(false)
                            }}
                            autoFocus
                            style={{ flex: 1, padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(168,139,250,0.5)', borderRadius: '6px', color: '#f1f5f9', fontSize: '0.85rem' }} />
                          <button onClick={() => {
                            const newName = renameValue.trim()
                            if (newName && newName !== state.teamName) {
                              send({ type: 'set_team_name', team_name: state.teamName, new_name: newName })
                            }
                            setRenamingTeam(false)
                          }} style={{ padding: '0.4rem 0.8rem', background: 'rgba(168,139,250,0.2)', border: '1px solid rgba(168,139,250,0.4)', borderRadius: '6px', color: '#c4b5fd', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Leave Team */}
                  <div className="side-menu-section">
                    <button className="menu-leave-btn" onClick={() => { dispatch({ type: 'CLOSE_MENU' }); setConfirmLeave(true) }}>Exit Game</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Screen 3: Eliminated */}
        {state.screen === 'eliminated' && (
          <div className="eliminated-bg">
            <div className="eliminated-glass">
              <div className="elim-icon">💀</div>
              <h2 className="elim-title">YOU GOT ELIMINATED!</h2>
              <p className="elim-sub">You can no longer participate in this round.</p>
              <button className="elim-btn" onClick={() => {
                dispatch({ type: 'RESET_SESSION' })
                clearSession()
              }}>Return to Lobby</button>
            </div>
          </div>
        )}
      </div>
      {confirmLeave && (
        <div className="confirm-overlay" onClick={() => setConfirmLeave(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Are you sure you want to exit the game?</p>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={handleLeave}>Leave</button>
              <button className="confirm-no" onClick={() => setConfirmLeave(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
