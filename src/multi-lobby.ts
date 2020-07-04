import { LitElement, html, customElement, property, css, internalProperty } from 'lit-element'
import type { SafeListener } from 'fancy-emitter'
import type { Client } from '@mothepro/fancy-p2p'
import type { MultiSelectedEvent } from '@material/mwc-list/mwc-list-foundation'
import type { NameChangeEvent, ProposalEvent } from './duo-lobby.js'

import '@material/mwc-list'
import '@material/mwc-list/mwc-list-item.js'
import '@material/mwc-list/mwc-check-list-item.js'
import '@material/mwc-icon-button'
import '@material/mwc-icon'
import '@material/mwc-fab'
import '@material/mwc-textfield'

declare global {
  interface HTMLElementEventMap {
    'p2p-error': ErrorEvent
    'name-change': NameChangeEvent
    proposal: ProposalEvent
  }
}

@customElement('p2p-multi-lobby')
export default class extends LitElement {
  /** Name of the user. An anonymous one may be set be the server if left unassigned. */
  @property({ type: String, reflect: true })
  name = ''

  /** Name of the user. An anonymous one may be set be the server if left unassigned. */
  @property({ type: Boolean, reflect: true, attribute: 'can-change-name' })
  canChangeName = false

  /** Max length of user's name */
  @property({ type: Number })
  maxlength = 100

  @property({ attribute: false })
  connection!: SafeListener<Client>

  @property({ attribute: false })
  groupExists!: (...clients: Client[]) => boolean

  /** Others connected to the lobby. */
  @internalProperty()
  private clients: Client[] = []

  @property({ type: Boolean, reflect: true })
  private editing = false

  /** The minimum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'min-peers' })
  minPeers = 1

  /** The maximum number of other connections that can be made in the lobby. */
  @property({ type: Number, attribute: 'max-peers' })
  maxPeers = 10

  @internalProperty({ })
  private chosen: Set<Client> = new Set

  @internalProperty()
  proposals: {
    members: Client[]
    action?: (accept: boolean) => void
  }[] = []

  get canPropose() {
    return this.minPeers <= this.chosen.size
      && this.chosen.size <= this.maxPeers
      && !this.groupExists(...this.chosen)
  }

  static readonly styles = css`
    :host([hidden]) {
      display: none;
    }

    :host .alone {
      text-align: center;
    }

    :host .tall {
      height: 85px;
    }

    :host mwc-fab[disabled] {
      --mdc-theme-on-secondary: white;
      --mdc-theme-secondary: lightgrey;
      --mdc-fab-box-shadow: none;
      --mdc-fab-box-shadow-hover: none;
      --mdc-fab-box-shadow-active: none;
      --mdc-ripple-fg-opacity: 0;
      cursor: default !important;
      pointer-events: none;
    }`

  protected async updated(changed: Map<string | number | symbol, unknown>) {
    if (changed.has('connection')) {
      this.clients = []
      for await (const client of this.connection!)
        this.bindClient(client)
    }

    // focus on the new textbox
    if (changed.has('editing') && this.editing) {
      await Promise.resolve() // wait a tick for material to catch up
      this.shadowRoot!.getElementById('field')!.focus()
    }
  }

  private bindClient = async (client: Client) => {
    this.clients = [...this.clients, client]
    for await (const { members, action, ack } of client.proposals) {
      this.proposals = [...this.proposals, {members, action}]

      // Update UI every time a client accepts or rejects the proposal
      ack.on(() => this.requestUpdate())
        .catch(error => this.dispatchEvent(new ErrorEvent('p2p-error', { error })))
        .finally(() => this.requestUpdate())
    }
    this.clients = this.clients.filter(currentClient => currentClient != client)
  }

  private nameChange(event: Event) {
    event.preventDefault()
    const detail = new FormData(event.target! as HTMLFormElement).get('name')?.toString() ?? ''
    console.log(this.name, detail)

    if (this.name != detail) {
      this.name = detail
      this.dispatchEvent(new CustomEvent('name-change', { detail }))
    }
    return this.editing = false
  }

  private selected({ detail: { index } }: MultiSelectedEvent) {
    this.chosen = new Set(this.clients.filter(({ isYou }, i) => !isYou && index.has(i)))
  }

  protected readonly render = () => html`
    <mwc-list
      part="client-list"
      multi
      rootTabbable
      @selected=${this.selected}>${this.clients.map((client, index) =>
    client.isYou
      ? html`
        <mwc-list-item
          part="client is-you"
          tabindex=${index}
          hasMeta
          class=${this.editing && 'tall'}
          ?noninteractive=${!this.canChangeName || this.editing}
          @request-selected=${() => this.editing = true}>${
        this.canChangeName
          ? this.editing
            ? html`
              <form @submit=${console.warn}>
                <mwc-textfield
                  outlined
                  charCounter
                  fullwidth
                  required
                  type="text"
                  name="name"
                  label="Your Name"
                  id="field"
                  maxlength=${this.maxlength}
                  value=${client.name}
                  @blur=${() => this.editing = false}
                ></mwc-textfield>
              </form>`
            : html`${client.name} <mwc-icon part="edit-button" slot="meta">create</mwc-icon>`
          : client.name}
      </mwc-list-item>
      <li divider padded role="separator"></li>`
      : html`
        <mwc-check-list-item part="client is-other" tabindex=${index}>
          ${client.name}
        </mwc-check-list-item>`)}${
    this.clients.length == 1
    ? html`
      <slot name="alone">
        <mwc-list-item part="client is-alone" class="alone" noninteractive>
          Waiting for others to join this lobby.
        </mwc-list-item>
      </slot>` : ''}
    </mwc-list>
    <mwc-fab
      icon="done"
      ?disabled=${!this.canPropose}
      label="Make Group"
      @click=${() => this.canPropose && this.dispatchEvent(new CustomEvent('proposal', { detail: this.chosen }))}
    ></mwc-fab>`
}