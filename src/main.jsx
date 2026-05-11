import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Pretendard 폰트
const link = document.createElement('link')
link.rel = 'stylesheet'
link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css'
document.head.appendChild(link)

const iconLink = document.createElement('link')
iconLink.rel = 'stylesheet'
iconLink.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css'
document.head.appendChild(iconLink)

// 공통 스타일
const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  body {
    background: #f7f8fa;
    color: #0f1117;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  button, input, textarea, select {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: #f7f8fa; }
  ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
