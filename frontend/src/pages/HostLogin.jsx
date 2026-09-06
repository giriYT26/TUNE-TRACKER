import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function HostLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = () => {
    const correct = import.meta.env.VITE_HOST_PASSWORD || 'tuneadmin'
    if (password === correct) {
      sessionStorage.setItem('hostAuth', 'true')
      navigate('/host')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Host Login</h1>
      <p>Enter host password</p>
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        style={{ padding: '0.5rem', width: '200px', marginBottom: '1rem' }}
      />
      <br />
      <button onClick={handleLogin} style={{ padding: '0.5rem 1.5rem' }}>
        LOGIN
      </button>
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
    </div>
  )
}
