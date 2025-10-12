import React from 'react'
import ReactDOM from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string
const redirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI as string
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined

function onRedirectCallback(appState?: any) {
  try {
    const target = appState?.returnTo || window.sessionStorage.getItem('hcc:returnTo') || window.location.pathname
    window.sessionStorage.removeItem('hcc:returnTo')
    if (typeof target === 'string') window.history.replaceState({}, document.title, target)
  } catch {}
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: redirectUri, audience, scope: 'openid profile email' }}
      cacheLocation="localstorage"
      useRefreshTokens
      onRedirectCallback={onRedirectCallback}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Auth0Provider>
  </React.StrictMode>
)
