import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Team from './pages/Team'
import Host from './pages/Host'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/team" element={<Team />} />
        <Route path="/host" element={<Host />} />
        <Route
          path="/"
          element={
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <h1>TUNE TRACKER</h1>
              <nav>
                <Link to="/team" style={{ marginRight: '1rem' }}>Team Page</Link>
                <Link to="/host">Host Dashboard</Link>
              </nav>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
