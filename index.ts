import type { default as P2P, Sendable } from '@mothepro/fancy-p2p'

export { default } from './src/switch.js'
export { default as duoLobby } from './src/duo-lobby.js'
export { default as multiLobby } from './src/multi-lobby.js'
export type peers<T extends Sendable = Sendable> = P2P<T>['peers']
export type broadcast<T extends Sendable = Sendable> = P2P<T>['broadcast']
export type random = P2P['random']
