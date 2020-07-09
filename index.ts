import type P2P from '@mothepro/fancy-p2p'

export { default } from './src/switch.js'
export { default as duoLobby } from './src/duo-lobby.js'
export { default as multiLobby } from './src/multi-lobby.js'
export type peers = P2P['peers']
export type broadcast = P2P['broadcast']
export type random = P2P['random']
