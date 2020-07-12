import type { NameChangeEvent, ProposalEvent } from './duo-lobby.js'
import storage from 'std:kv-storage'
import { LitElement, html, customElement, property } from 'lit-element'
import P2P, { State } from '@mothepro/fancy-p2p'
import { MockPeer } from '@mothepro/fancy-p2p/dist/esm/src/Peer.js'

import './duo-lobby.js'
import './multi-lobby.js'

interface PeerElement extends Element {
  broadcast: P2P['broadcast']
  random: P2P['random']
  peers: P2P['peers']
}

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
  maxlength = 50

  /** The minimum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'min-peers' })
  minPeers = 1

  /** The maximum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'max-peers' })
  maxPeers = 10

  @property({ type: Number, reflect: true })
  state = this.forceOffline ? -1 : State.OFFLINE

  get forceOffline() { return location.hash == '#p2p-offline' }

  public p2p?: P2P
  private peerElements: PeerElement[] = []

  protected async firstUpdated() {
    // TODO maybe this shouldn't be here...
    this.shadowRoot?.addEventListener('slotchange', this.slotChange)
    
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
      for await (const state of this.p2p!.stateChange)
        this.state = state
    } catch (error) {
      this.fail(error)
    }
    this.state = -1
  }

  /** Bind the properties to the slotted elements */
  private slotChange = () => {
    this.peerElements = []
    for (const element of (this.shadowRoot?.querySelector('slot[name="p2p"]') as HTMLSlotElement)
      ?.assignedElements() as PeerElement[] ?? []) {
      this.peerElements.push(element)
      if (this.p2p?.state == State.READY) { // We need to bind real stuff
        element.peers = this.p2p.peers
        element.broadcast = this.p2p.broadcast
        element.random = this.p2p.random
      } else {
        const mockPeer = new MockPeer('')
        element.peers = [mockPeer]
        element.broadcast = mockPeer.send
        element.random = (isInt = false) => isInt ? Math.trunc(2**31 * Math.random() - 2**31) : Math.random()
      }
    }
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
      this.fail(error)
    }
  }

  // TODO, don't think we need to dispatch for EVERY slot
  private fail(error: Error) {
    for (const element of [this, ...this.peerElements])
      element.dispatchEvent(new ErrorEvent('p2p-error', { error }))
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
              exportparts="client-list client is-you is-other is-alone edit-button accept reject waiting invite"
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
              exportparts="client-list client is-you is-other is-alone edit-button make-group"
              name=${this.name}
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
            <slot
              name="p2p"
              online
              .broadcast=${this.p2p.broadcast}
              .random=${this.p2p.random}
              .peers=${this.p2p.peers}>
              Access P2P by utilizing the properties <code>broadcast</code>, <code>random</code> & <code>peers</code>.
            </slot>`

        case State.OFFLINE:
          return html`<slot></slot><slot name="offline">Connecting</slot>`

        case State.LOADING:
          return html`<slot></slot><slot name="loading">Loading</slot>`
      }

    return html`<slot></slot><slot name="p2p" offline></slot><slot name="disconnected">Disconnected</slot>`
  }
}
