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
import '@material/mwc-snackbar'

type SnackBarClosingEvent = CustomEvent<{ reason?: string }>

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

  @internalProperty({})
  private chosen: Set<Client> = new Set

  @internalProperty()
  proposal?: {
    members: Client[]
    action?: (accept: boolean) => void
  }

  private readonly proposalQueue: {
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
      justify-content: center;
    }

    :host .tall {
      height: 85px;
    }

    :host form * {
      overflow: visible;
    }

    :host mwc-fab[disabled] { /** How is this not supported natively?? */
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
      if (action)
        if (this.proposal) // Add to queue
          this.proposalQueue.push({ members, action })
        else
          this.proposal = { members, action }

      // Update UI every time a client accepts or rejects the proposal
      ack.on(() => this.requestUpdate())
        // TODO remove from queue
        .catch(error => this.dispatchEvent(new ErrorEvent('p2p-error', { error })))
        .finally(() => this.requestUpdate())
    }
    this.clients = this.clients.filter(currentClient => currentClient != client)
  }

  /** Do not use form submission since that event doesn't pass through shadow dom */
  private nameChange({ target, key }: KeyboardEvent) {
    if (key == 'Enter') {
      const detail = (target as HTMLInputElement).value
      if (this.name != detail) {
        this.name = detail
        this.dispatchEvent(new CustomEvent('name-change', { detail }))
      }
      this.editing = false
    }
  }

  private selected({ detail: { index } }: MultiSelectedEvent) {
    this.chosen = new Set(this.clients.filter(({ isYou }, i) => !isYou && index.has(i)))
  }

  /** Accept/Reject proposal then remove it from list */
  private handleProposal({ detail: { reason } }: SnackBarClosingEvent) {
    if (this.proposal) { // this should be true in this function...
      this.proposal.action!(reason == 'action')
      if (reason != 'action' && this.proposalQueue.length) // refill queue
        this.proposal = this.proposalQueue.shift()
    }
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
              <mwc-textfield
                outlined
                charCounter
                fullwidth
                required
                type="text"
                label="Your Name"
                id="field"
                maxlength=${this.maxlength}
                value=${client.name}
                @keydown=${this.nameChange}
                @blur=${() => this.editing = false  /* TODO do not blur when selected again */}
              ></mwc-textfield>`
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
    ${this.proposal ? html`
      <mwc-snackbar
        open
        timeoutMs=${10000}
        labelText="Join group with ${this.proposal.members.map(({ name }) => name).join(', ')}"
        @MDCSnackbar:closing=${this.handleProposal}>
        <mwc-icon-button slot="action" icon="check" label="accept"></mwc-icon-button>
        <mwc-icon-button slot="dismiss" icon="close" label="reject"></mwc-icon-button>
      </mwc-snackbar>` : ''}
    <mwc-fab
      part="make-group"
      icon="done"
      ?disabled=${!this.canPropose}
      label="Make Group"
      @click=${() => this.canPropose
      && this.dispatchEvent(new CustomEvent('proposal', { detail: this.chosen }))
      && Promise.resolve().then(() => this.requestUpdate()) /* Update next tick to disable button */}
    ></mwc-fab>`
}
