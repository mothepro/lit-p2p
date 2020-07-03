import storage from 'std:kv-storage'
import { render, html } from 'lit-html'
import type { NameChangeEvent } from '../index.js'

import '../index.js'

storage.get('name')
  .then(name => render(html`
  <p2p-duo-lobby
    name=${(name || '').toString()}
    @name-change=${({ detail }: NameChangeEvent) => storage.set('name', detail)}
    
    signaling="wss://ws.parkshade.com:443"
    version="0.3.2"
    lobby="p2p-duo-lobby"
    max-length=20
    timeout=20000
    .stuns=${[
      "stun:stun.stunprotocol.org",
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:stun3.l.google.com:19302",
      "stun:stun4.l.google.com:19302"
    ]}>
  
  </p2p-duo-lobby>`, document.body))
