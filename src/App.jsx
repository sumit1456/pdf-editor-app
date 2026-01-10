import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar/NavBar'
import HomePage from './pages/home/HomePage'
import EditorPage from './pages/editor/EditorPage'
import './App.css'

function App() {
  return (
    <div className="app-container">
      <NavBar />
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<EditorPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
