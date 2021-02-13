import type { NameChangeEvent, ProposalEvent } from './duo-lobby.js'
import { LitElement, html, customElement, property, PropertyValues, css } from 'lit-element'
import P2P, { State } from '@mothepro/fancy-p2p'
import { MockPeer } from '@mothepro/fancy-p2p/dist/esm/src/Peer.js'

import './duo-lobby.js'
import './multi-lobby.js'

/** The useful P2P functions once the connections have been made. */
export type readyP2P = Readonly<Pick<P2P, 'broadcast' | 'random' | 'peers'>>

/** Keys for storing data in local storage */
export const enum Keys {
  /** The name of the user to connect in the lobby as. */
  NAME = 'p2p-name'
}

declare global {
  interface HTMLElementEventMap {
    'p2p-error': ErrorEvent
    'p2p-update': CustomEvent<boolean>
  }
  interface Window {
    /** Bindings from a ready `fancy-p2p` instance set on window by `lit-p2p`. */
    p2p: readyP2P
  }
  /** Bindings from a ready `fancy-p2p` instance set on window by `lit-p2p`. */
  const p2p: Window['p2p']
}

const mockPeer = new MockPeer(''),
  mockReadyP2P = {
    peers: [mockPeer],
    broadcast: mockPeer.send,
    random: (isInt = false) => isInt
      ? Math.trunc(2 ** 32 * Math.random() - 2 ** 31)
      : Math.random(),
  }

function globalBindP2P(data: readyP2P = mockReadyP2P) {
  // TODO destruct and rebuild for real private props??
  window.p2p = data
  dispatchEvent(new CustomEvent('p2p-update', { detail: data.peers.length > 1, bubbles: true, composed: true }))
}

// `window.p2p` should be accessible ASAP, Don't wait for element to load.
globalBindP2P()

@customElement('lit-p2p')
export default class extends LitElement {
  /**
   * State of the underlying P2P instance.
   * Defaults to `-1` Disconnected (not connected & not trying to).
   */
  @property({ type: Number, reflect: true })
  state = -1

  /**
   * Name of the user.
   * 
   * An anonymous one *may* be set be the server if left unassigned.
   * This attribute is updated to match what the signaling server returns as your name.
   */
  @property({ type: String, reflect: true })
  name = ''

  /** List of STUN servers to broker P2P connections. */
  @property({ type: Array })
  stuns!: string[]

  /** Address to the signaling server. */
  @property({ type: String })
  signaling!: string

  /** Version of the signaling server. */
  @property({ type: String })
  version!: string

  /** Number of times to attempt to make an RTC connection. Defaults to 1 */
  @property({ type: Number })
  retries!: number

  @property({ type: String })
  lobby!: string

  /** The number of milliseconds to wait before giving up on the direct connection. Doesn't give up by default */
  @property({ type: Number })
  timeout!: number

  /** The number of milliseconds to wait before rejecting a proposal (when maxpeers > 1). Doesn't give up by default */
  @property({ type: Number })
  proposalTimeout = -1

  /** Whether to store the user's name in local storage. */
  @property({ type: Boolean, attribute: 'local-storage' })
  localStorage = false

  /** Max length of user's name */
  @property({ type: Number, attribute: 'max-length' })
  maxlength = 50

  /** The minimum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'min-peers' })
  minPeers = 1

  /** The maximum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'max-peers' })
  maxPeers = 1

  public p2p?: P2P

  static readonly styles = css`
    :host .alone {
      justify-content: center;
    }`

  protected async updated(changed: PropertyValues) {
    if (changed.has('name'))
      // @ts-ignore Reset mock peer's name
      mockPeer.name = this.name

    if (changed.has('state'))
      switch (this.state) {
        case State.OFFLINE: // Try to get name and reconnect to server
          if (this.localStorage && !this.name)
            this.name = (localStorage.getItem(Keys.NAME) ?? '').toString()
          this.p2p?.leaveLobby()
          this.connect()
          break

        case State.READY: // Bind established p2p to the global `window.p2p`
          globalBindP2P(this.p2p)
          break
        
        case State.LOADING:
        case State.LOBBY:
          break
        
        default: // Disconnect & reset `window.p2p` to mocked
          if (this.p2p) {
            this.p2p.leaveLobby()
            globalBindP2P()
          }
          this.requestUpdate() // since render has already been called, ensure we are disconnected now.
          break
      }
  }

  /** Only called when the **user** changes their own name. */
  // TODO the only reason we do this instead of in the updater is to **not** save the random servere name in local storage.
  private saveNameAndReconnect({ detail }: NameChangeEvent) {
    this.name = detail
    if (this.localStorage && this.name)
      localStorage.setItem(Keys.NAME, this.name)
    this.p2p?.leaveLobby()
    this.connect()
  }

  /** Attempt to connect to the lobby */
  private async connect() {
    try {
      this.p2p = new P2P({
        name: this.name,
        retries: this.retries,
        timeout: this.timeout,
        stuns: this.stuns,
        lobby: this.lobby,
        server: {
          address: this.signaling,
          version: this.version,
        },
      })

      // Set the name attribute to the name of my client. This ensures that we are consistent with server.
      this.p2p.lobbyConnection.next.then(({ name }) => this.name = name)

      for await (const state of this.p2p!.stateChange)
        this.state = state
    } catch (error) {
      this.dispatchEvent(new ErrorEvent('p2p-error', { error, bubbles: true }))
    } finally {
      this.state = -1
    }
  }

  private proposal({ detail }: ProposalEvent) {
    try {
      this.p2p?.proposeGroup(...detail)
    } catch (error) {
      this.dispatchEvent(new ErrorEvent('p2p-error', { error, bubbles: true }))
    }
  }

  protected readonly render = () => {
    if (this.p2p?.stateChange.isAlive)
      switch (this.p2p.state) {
        case State.LOBBY:
          return this.minPeers == 1 && this.maxPeers == 1
            ? html`
            <slot></slot>
            <p2p-duo-lobby
              part="lobby"
              exportparts="client-list , client , is-you , is-other , can-edit , can-not-edit , name-input , accept , reject , waiting , invite"
              name=${this.name}
              maxlength=${this.maxlength}
              ?can-change-name=${this.localStorage}
              .connection=${this.p2p.lobbyConnection}
              .groupExists=${this.p2p.groupExists}
              @name-change=${this.saveNameAndReconnect}
              @proposal=${this.proposal}
            >
              <slot name="lobby"></slot>
              <slot name="alone" slot="alone">
              <mwc-list-item part="client is-alone" class="alone" noninteractive>
                Waiting for others to join this lobby.
              </mwc-list-item>
              </slot>
            </p2p-duo-lobby>`
            : html`
            <slot></slot>
            <p2p-multi-lobby
              part="lobby"
              exportparts="client-list , client , is-you , is-other , can-edit , can-not-edit , name-input , make-group"
              name=${this.name}
              timeout=${this.proposalTimeout}
              maxlength=${this.maxlength}
              max-peers=${this.maxPeers}
              min-peers=${this.minPeers}
              ?can-change-name=${this.localStorage}
              .connection=${this.p2p.lobbyConnection}
              .groupExists=${this.p2p.groupExists}
              @name-change=${this.saveNameAndReconnect}
              @proposal=${this.proposal}
            >
              <slot name="lobby"></slot>
              <slot name="alone" slot="alone">
                <mwc-list-item part="client is-alone" class="alone" noninteractive>
                  Waiting for others to join this lobby.
                </mwc-list-item>
              </slot>
            </p2p-multi-lobby>`

        case State.READY:
          return html`
            <slot></slot>
            <slot name="p2p" online></slot>
            <slot name="ready">
              Access P2P by listening to the <code>p2p-update</code> event on the <code>document</code>
              and use <code>window.p2p</code> to access peers.
            </slot>`

        case State.OFFLINE:
          return html`
            <slot></slot>
            <slot name="offline">Connecting</slot>`

        case State.LOADING:
          return html`
            <slot></slot>
            <slot name="loading">Loading</slot>`
      }

    return html`
      <slot></slot>
      <slot name="p2p" offline></slot>
      <slot name="disconnected">Disconnected</slot>`
  }
}
