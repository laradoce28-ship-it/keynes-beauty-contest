import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ParticipantView from './pages/ParticipantView'
import HostView from './pages/HostView'
import DemoView from './pages/DemoView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ParticipantView />} />
        <Route path="/host" element={<HostView />} />
        <Route path="/demo" element={<DemoView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
