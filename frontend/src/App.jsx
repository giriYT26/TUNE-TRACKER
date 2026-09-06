import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import Team from './pages/Team'
import Host from './pages/Host'
import HostLogin from './pages/HostLogin'
import './App.css'

function ProtectedRoute({ children }) {
  const isAuth = sessionStorage.getItem('hostAuth') === 'true'
  if (!isAuth) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/team" element={<Team />} />
        <Route path="/host/login" element={<HostLogin />} />
        <Route
          path="/host"
          element={
            <ProtectedRoute>
              <Host />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <h1>TUNE TRACKER</h1>
              <nav>
                <Link to="/team">Team Page</Link>
              </nav>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
