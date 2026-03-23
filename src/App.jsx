import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar/NavBar'
import HomePage from './pages/home/HomePage'
import EditorPage from './pages/editor/EditorPage'
import AboutPage from './pages/about/AboutPage'
import MessageContainer from './components/PopUp/ToastMessages'
import LoadingContainer from './components/PopUp/LoadingAnimation'
import { ThemeProvider } from './context/ThemeContext'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <div className="app-container">
        <NavBar />
        <main className="content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </main>
        <MessageContainer />
        <LoadingContainer />
      </div>
    </ThemeProvider>
  )
}

export default App
