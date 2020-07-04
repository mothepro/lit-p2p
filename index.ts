import { LitElement, html, customElement, property, css, internalProperty } from 'lit-element'
import P2P, { State, Client } from '@mothepro/fancy-p2p'
import type { RequestSelectedDetail } from '@material/mwc-list/mwc-list-item.js'

import '@material/mwc-list'
import '@material/mwc-list/mwc-list-item.js'
import '@material/mwc-icon-button'
import '@material/mwc-icon'

export type NameChangeEvent = CustomEvent<string>

declare global {
  interface HTMLElementEventMap {
    'p2p-error': ErrorEvent
    'name-change': NameChangeEvent
  }
}

@customElement('p2p-duo-lobby')
export default class extends LitElement {
  /** Name of the user. An anonymous one may be set be the server if left unassigned. */
  @property({ type: String, reflect: true })
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

  /** Max length of user's name */
  @property({ type: Number, attribute: 'max-length' })
  maxLength = 100

  /** Others connected to the lobby. */
  @internalProperty()
  private clients: {
    client: Client
    action?: (accept: boolean) => void
  }[] = []

  @internalProperty()
  private editing = false

  private p2p?: P2P<ArrayBuffer>

  static readonly styles = css`
    :host([hidden]) {
      display: none;
    }
    
    :host mwc-icon-button {
      position: absolute;
      top: 0;
      right: 0;
    }
    
    :host mwc-icon-button[part="reject"] {
      margin-right: var(--mdc-icon-button-size, 48px);
    }`

  protected async updated(changed: Map<string | number | symbol, unknown>) {
    if (changed.has('name')) { // Reconnect when name changes
      this.p2p?.leaveLobby()
      this.p2p = new P2P(this.name, {
        retries: this.retries,
        timeout: this.timeout,
        stuns: this.stuns,
        lobby: this.lobby,
        server: {
          address: this.signaling,
          version: this.version,
        },
      })

      try {
        this.clients = []
        this.p2p.lobbyConnection.on(this.bindClient)
        for await (const _ of this.p2p!.stateChange)
          this.requestUpdate() // Bind state changes to the DOM
      } catch (error) {
        this.dispatchEvent(new ErrorEvent('p2p-error', { error }))
      }
      this.requestUpdate()
    }
  }

  private bindClient = async (client: Client) => {
    this.clients = [...this.clients, { client }]
    for await (const { action, ack } of client.proposals) {
      this.clients = this.clients.map(item =>
        item.client == client
          ? { client, action }
          : item)

      // Update UI every time a client accepts or rejects the proposal
      ack.on(() => this.requestUpdate())
        .catch(console.warn)
        .finally(() => this.requestUpdate())
    }
    this.clients = this.clients.filter(({ client: currentClient }) => currentClient != client)
  }

  private nameChange(event: Event) {
    event.preventDefault()
    const detail = new FormData(event.target! as HTMLFormElement).get('name')?.toString() ?? ''
    if (this.name != detail) {
      this.name = detail
      this.dispatchEvent(new CustomEvent('name-change', { detail }))
    }
    return this.editing = false
  }

  protected readonly render = () => {
    if (this.p2p?.stateChange.isAlive)
      switch (this.p2p!.state) {
        case State.OFFLINE:
          return html`<slot name="offline">Connecting</slot>`
        
        case State.LOBBY:
          return html`
            <mwc-list part="client-list" rootTabbable activatable>${this.clients.map(({ client, action }, index) =>
              client.isYou
                ? html`
                <mwc-list-item
                  part="client is-you"
                  tabindex=${index}
                  hasMeta
                  @request-selected=${() => this.editing = true}>
                  ${this.editing
                    ? html`
                    <form @submit=${this.nameChange}>
                      <input
                        part="edit-name"
                        type="text"
                        autofocus 
                        name="name"
                        placeholder="Your name"
                        maxlength=${this.maxLength}
                        value=${client.name} />
                    </form>`
                    : client.name}
                  <mwc-icon part="edit-button" slot="meta">create</mwc-icon>
                </mwc-list-item>`
                : html`
                <mwc-list-item
                  part="client is-other"
                  tabindex=${index}
                  ?hasMeta=${!action}
                  ?noninteractive=${!action && this.p2p!.groupExists(client)}
                  @request-selected=${({ detail: { selected } }: CustomEvent<RequestSelectedDetail>) => console.log(selected, !action, !this.p2p!.groupExists(client), selected && !action && !this.p2p!.groupExists(client) && this.p2p!.proposeGroup(client))}
                  >
                  ${client.name}
                  ${action
                  ? html`
                    <mwc-icon-button
                      part="accept"
                      icon="check_circle"
                      label="Aceept"
                      @click=${() => {
                        action(true)
                        this.clients = this.clients.map(item => item.client == client ? { client, action: undefined } : item)
                      }}></mwc-icon-button>
                    <mwc-icon-button
                      part="reject"
                      icon="cancel"
                      label="Reject"
                      @click=${() => {
                        action(false)
                        this.clients = this.clients.map(item => item.client == client ? { client, action: undefined } : item)
                      }}></mwc-icon-button>`
                  : this.p2p!.groupExists(client)
                    ? html`<mwc-icon part="waiting" slot="meta">hourglass_empty</mwc-icon>`
                    : html`<mwc-icon part="invite" slot="meta">add_circle</mwc-icon>`}
                </mwc-list-item>`)}
            </mwc-list>`

        case State.LOADING:
          return html`<slot name="loading">Loading</slot>`

        case State.READY:
          return html`
            <slot
              .broadcast=${this.p2p.broadcast}
              .random=${this.p2p.random}
              .peers=${this.p2p.peers}
            ></slot>`
      }

    return html`<slot name="disconnected">Disconnected</slot>`
  }
}
