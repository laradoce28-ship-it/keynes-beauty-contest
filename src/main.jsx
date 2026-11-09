import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './themes.css'
import { applyPreview } from './lib/preview'
import App from './App'

applyPreview()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
