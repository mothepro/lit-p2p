import type { NameChangeEvent, ProposalEvent } from './duo-lobby.js'
import storage from 'std:kv-storage'
import { LitElement, html, customElement, property } from 'lit-element'
import P2P, { State } from '@mothepro/fancy-p2p'
import { MockPeer } from '@mothepro/fancy-p2p/dist/esm/src/Peer.js'

import './duo-lobby.js'
import './multi-lobby.js'

/** Keys for storing data in kv-storage */
const enum Keys {
  /** The name of the user to connect in the lobby as. */
  NAME = 'name'
}

declare global {
  interface HTMLElementEventMap {
    'p2p-error': ErrorEvent
    'p2p-update': CustomEvent<boolean>
  }
  interface Window {
    /** Bindings from `fancy-p2p` instance set on window by `lit-p2p`. */
    p2p: {
      readonly broadcast: P2P['broadcast']
      readonly random: P2P['random']
      readonly peers: P2P['peers']
      readonly online: boolean
    }
  }
  const p2p: Window['p2p']
}

function resetP2P() {
  const mockPeer = new MockPeer('')
  window.p2p = {
    peers: [mockPeer],
    broadcast: mockPeer.send,
    random: (isInt = false) => isInt ? Math.trunc(2 ** 31 * Math.random() - 2 ** 31) : Math.random(),
    online: false,
  }
}

// Bind Mock p2p to the window
resetP2P()

@customElement('p2p-switch')
export default class extends LitElement {
  /** Name of the user. An anonymous one may be set be the server if left unassigned. */
  @property({ type: String, reflect: true, noAccessor: true })
  name = ''

  /** List of STUN servers to broker P2P connections. */
  @property({ type: Array })
  stuns!: string[]

  /** Address to the signaling server. */
  @property({ type: String })
  signaling!: string

  /** Version of the signaling server. */
  @property({ type: String, reflect: true })
  version!: string

  /** Number of times to attempt to make an RTC connection. Defaults to 1 */
  @property({ type: Number, reflect: true })
  retries!: number

  @property({ type: String })
  lobby!: string

  /** The number of milliseconds to wait before giving up on the connection. Doesn't give up by default */
  @property({ type: Number, reflect: true })
  timeout!: number

  /** The number of milliseconds to wait before rejecting a proposal (when maxpeers > 1). Doesn't give up by default */
  @property({ type: Number, reflect: true })
  proposalTimeout = -1

  /** Whether to store the user's name in local kv-storage. */
  @property({ type: Boolean, attribute: 'local-storage' })
  localStorage = false

  /** Max length of user's name */
  @property({ type: Number, attribute: 'maxlength' })
  maxlength = 50

  /** The minimum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'min-peers' })
  minPeers = 1

  /** The maximum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'max-peers' })
  maxPeers = 10

  /** URL hash to go offline, be sure to prepend with # */
  @property({ type: String, attribute: 'offline-hash' })
  offlineHash = '#p2p-offline'

  @property({ type: Number, reflect: true })
  state = this.forceOffline ? -1 : State.OFFLINE

  get forceOffline() { return location.hash == this.offlineHash }

  public p2p?: P2P

  protected async firstUpdated() {
    addEventListener('hashchange', () => this.forceOffline && this.p2p?.leaveLobby())
    if (!this.forceOffline)
      this.connect(this.localStorage
        ? (await storage.get(Keys.NAME) || '').toString()
        : this.name)
  }

  private async connect(name: string) {
    this.p2p?.leaveLobby()
    this.p2p = new P2P(name, {
      retries: this.retries,
      timeout: this.timeout,
      stuns: this.stuns,
      lobby: this.lobby,
      server: {
        address: this.signaling,
        version: this.version,
      },
    })

    // Set my name on the attribute when it comes up
    this.p2p.lobbyConnection.next.then(({ name }) => this.name = name)

    try {
      for await (const state of this.p2p!.stateChange) {
        if (state == State.READY) {
          window.p2p = {
            peers: this.p2p.peers,
            broadcast: this.p2p.broadcast,
            random: this.p2p.random,
            online: true,
          }
          this.dispatchEvent(new CustomEvent('p2p-update', { detail: true, bubbles: true, composed: true }))
        }
        this.state = state
      }
    } catch (error) {
      this.dispatchEvent(new ErrorEvent('p2p-error', { error }))
    }
    resetP2P()
    this.dispatchEvent(new CustomEvent('p2p-update', { detail: false, bubbles: true, composed: true }))
    this.state = -1
  }

  private nameChanged({ detail }: NameChangeEvent) {
    if (this.localStorage)
      storage.set(Keys.NAME, this.name = detail)
    this.connect(this.name)
  }

  private proposal({ detail }: ProposalEvent) {
    try {
      this.p2p?.proposeGroup(...detail)
    } catch (error) {
      this.dispatchEvent(new ErrorEvent('p2p-error', { error }))
    }
  }

  protected readonly render = () => {
    if (!this.forceOffline && this.p2p?.stateChange.isAlive)
      switch (this.p2p!.state) {
        case State.LOBBY:
          return this.minPeers == 1 && this.maxPeers == 1
            ? html`
            <slot></slot>
            <p2p-duo-lobby
              part="lobby"
              exportparts="client-list , client , is-you , is-other , is-alone , edit-button , accept , reject , waiting , invite"
              name=${this.name}
              maxlength=${this.maxlength}
              .connection=${this.p2p.lobbyConnection}
              .groupExists=${this.p2p.groupExists}
              ?can-change-name=${this.localStorage}
              @name-change=${this.nameChanged}
              @proposal=${this.proposal}
            ></p2p-duo-lobby>`
            : html`
            <slot></slot>
            <p2p-multi-lobby
              part="lobby"
              exportparts="client-list , client , is-you , is-other , is-alone , edit-button , make-group"
              name=${this.name}
              timeout=${this.proposalTimeout}
              maxlength=${this.maxlength}
              max-peers=${this.maxPeers}
              min-peers=${this.minPeers}
              .connection=${this.p2p.lobbyConnection}
              .groupExists=${this.p2p.groupExists}
              ?can-change-name=${this.localStorage}
              @name-change=${this.nameChanged}
              @proposal=${this.proposal}
            ></p2p-multi-lobby>`

        case State.READY:
          return html`
            <slot></slot>
            <slot name="p2p" online>
              Access P2P by utilizing the variable <code>window.p2p</code>.
            </slot>`

        case State.OFFLINE:
          return html`<slot></slot><slot name="offline">Connecting</slot>`

        case State.LOADING:
          return html`<slot></slot><slot name="loading">Loading</slot>`
      }

    return html`<slot></slot><slot name="p2p" offline></slot><slot name="disconnected">Disconnected</slot>`
  }
}
