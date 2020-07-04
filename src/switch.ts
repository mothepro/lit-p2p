import storage from 'std:kv-storage'
import { LitElement, html, customElement, property } from 'lit-element'
import P2P, { State } from '@mothepro/fancy-p2p'
import type { NameChangeEvent, ProposalEvent } from './duo-lobby.js'

import './duo-lobby.js'

/** Keys for storing data in kv-storage */
const enum Keys {
  /** The name of the user to connect in the lobby as. */
  NAME = 'name'
}

declare global {
  interface HTMLElementEventMap {
    'p2p-error': ErrorEvent
  }
}

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

  /** Whether to store the user's name in local kv-storage. */
  @property({ type: Boolean, attribute: 'local-storage' })
  localStorage = false

  /** Max length of user's name */
  @property({ type: Number, attribute: 'maxlength' })
  maxlength = 100

  /** The minimum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'min-peers' })
  minPeers = 1

  /** The maximum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'max-peers' })
  maxPeers = 10

  public p2p?: P2P<ArrayBuffer>

  // Connect once
  protected async firstUpdated() {
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
      for await (const _ of this.p2p!.stateChange)
        this.requestUpdate()
    } catch (error) {
      this.dispatchEvent(new ErrorEvent('p2p-error', { error }))
    }
    this.requestUpdate()
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
      this.dispatchEvent(new ErrorEvent('p2p-error', {error}))
    }
  }

  protected readonly render = () => {
    if (this.p2p?.stateChange.isAlive)
      switch (this.p2p!.state) {
        case State.LOBBY:
          return this.minPeers == 1 && this.maxPeers == 1
            ? html`
            <p2p-duo-lobby
              name=${this.name}
              .connection=${this.p2p.lobbyConnection}
              .groupExists=${this.p2p.groupExists}
              ?can-change-name=${this.localStorage}
              @name-change=${this.nameChanged}
              @proposal=${this.proposal}
            ></p2p-duo-lobby>`
            : 'not supported yet'

        case State.READY:
          return html`
            <slot
              .broadcast=${this.p2p.broadcast}
              .random=${this.p2p.random}
              .peers=${this.p2p.peers}
            >Access P2P by utilizing <code>this.parentNode.p2p</code></slot>`

        case State.OFFLINE:
          return html`<slot name="offline">Connecting</slot>`

        case State.LOADING:
          return html`<slot name="loading">Loading</slot>`
      }

    return html`<slot name="disconnected">Disconnected</slot>`
  }
}
