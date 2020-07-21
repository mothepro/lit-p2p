import { LitElement, html, customElement, property, css, internalProperty } from 'lit-element'
import storage from 'std:kv-storage'
import { Keys } from './switch.js'
import type { SafeListener, Listener } from 'fancy-emitter'
import type { Client } from '@mothepro/fancy-p2p'
import type { MultiSelectedEvent } from '@material/mwc-list/mwc-list-foundation'
import type { NameChangeEvent, ProposalEvent } from './duo-lobby.js'
import type { Snackbar } from '@material/mwc-snackbar'

import '@material/mwc-list'
import '@material/mwc-list/mwc-list-item.js'
import '@material/mwc-list/mwc-check-list-item.js'
import '@material/mwc-icon-button'
import '@material/mwc-icon'
import '@material/mwc-fab'
import '@material/mwc-textfield'
import '@material/mwc-snackbar'

type SnackBarClosingEvent = CustomEvent<{ reason?: string }>
type Proposal<E = Client['proposals']> = E extends SafeListener<infer T> ? T : void

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

  /** Content to show in the snackbar's label given the current proposal. */
  @property({ type: Function, attribute: false })
  proposalLabel = ({ action, members, ack }: Proposal) => `
    ${action ? 'Join group with' : 'Waiting to join group with'}
    ${members.map(({name}) => name).join(', ')}
    (${ack.count + (action ? 0 : 1)} / ${1 + members.length})
    ${action ? '' : '...'}`

  /** Name of the user. An anonymous one may be set be the server if left unassigned. */
  @property({ type: Boolean, reflect: true, attribute: 'can-change-name' })
  canChangeName = false

  /** Whether to store the user's name in local kv-storage. */
  @property({ type: Boolean, attribute: 'local-storage' })
  localStorage = false

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

  /** Automatically reject active proposal in milliseconds. Disabled by default (-1) */
  @property({ type: Number })
  timeout = -1

  @internalProperty({})
  private chosen: Set<Client> = new Set

  @internalProperty()
  proposal?: Proposal

  private readonly proposalQueue: Proposal[] = []

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
      this.proposalQueue.push({ members, action, ack })
      this.maybeSetActiveProposal()
      this.bindAcks(ack)
    }
    this.clients = this.clients.filter(currentClient => currentClient != client)
  }

  /** Update UI every time a client accepts or rejects the proposal */
  private async bindAcks(clientAcks: Listener<Client>) {
    try {
      for await (const client of clientAcks)
        this.requestUpdate() // updates # in snackbar
    } catch (error) {
      error.fatal = false
      this.dispatchEvent(new ErrorEvent('p2p-error', { error }))
    }
    
    // Remove this from current proposal, or queue
    if (clientAcks == this.proposal?.ack)
      delete this.proposal
    for (const [index, { ack }] of this.proposalQueue.entries())
      if (clientAcks == ack)
        this.proposalQueue.splice(index, 1)
    
    this.maybeSetActiveProposal()
  }

  /** Accept proposal and remove buttons OR Reject proposal then remove it from list */
  private handleProposal({ detail: { reason } }: SnackBarClosingEvent) {
    this.proposal?.action!(reason == 'action')
    if (reason == 'action') {
      delete this.proposal?.action
        // Keep showing the snackbar
        ;(this.shadowRoot?.getElementById('active-proposal') as Snackbar)?.show()
      this.requestUpdate()
    } else {
      delete this.proposal
      this.maybeSetActiveProposal()
    }
  }

  private maybeSetActiveProposal() {
    if (this.proposal || !this.proposalQueue.length)
      return

    this.proposal = this.proposalQueue.shift()
    if (this.timeout > 10000) // Stupid mwc-snackbar has a limit on timeout for some reason...
      (this.shadowRoot?.getElementById('active-proposal') as Snackbar)?.close('dismiss')
  }

  /** Do not use form submission since that event doesn't pass through shadow dom */
  private nameChange({ target, key }: KeyboardEvent) {
    if (key == 'Enter') {
      const detail = (target as HTMLInputElement).value
      if (this.name != detail) {
        this.name = detail
        if (this.localStorage)
          storage.set(Keys.NAME, detail)
        this.dispatchEvent(new CustomEvent('name-change', { detail }))
      }
      this.editing = false
    }
  }

  private selected({ detail: { index } }: MultiSelectedEvent) {
    this.chosen = new Set(this.clients.filter(({ isYou }, i) => !isYou && index.has(i)))
  }

  protected readonly render = () => html`
    <mwc-list
      part="client-list"
      multi
      rootTabbable
      @selected=${this.selected}>${this.clients.map((client, index) => client.isYou
    ? html`${this.editing

      // Editing own name
      ? html`
      <mwc-textfield
        part="name-input"
        outlined
        charCounter
        type="text"
        label="Your Name"
        id="field"
        maxlength=${this.maxlength}
        value=${client.name}
        @keydown=${this.nameChange}
        @blur=${() => this.editing = false}
      ></mwc-textfield>`

      // Your name in list
      : html`
      <mwc-list-item
        part="client is-you"
        ?hasMeta=${this.canChangeName}
        ?noninteractive=${!this.canChangeName}
        @request-selected=${() => this.editing = true}>
        ${client.name}
        ${this.canChangeName ? html`<mwc-icon part="edit-button" slot="meta">create</mwc-icon>` : ''}
      </mwc-list-item>`}
      <li divider padded role="separator"></li>`

    // Other clients
    : html`
    <mwc-check-list-item part="client is-other">
      ${client.name}
    </mwc-check-list-item>`)}${

    // No one else in lobby
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
        id="active-proposal"
        timeoutMs=${this.timeout > 10000 ? -1 : this.timeout}
        labelText="${this.proposalLabel(this.proposal).trim()}"
        @MDCSnackbar:closing=${this.handleProposal}>
        ${this.proposal.action ? html` 
          <mwc-icon-button slot="action" icon="check" label="accept"></mwc-icon-button>
          <mwc-icon-button slot="dismiss" icon="close" label="reject"></mwc-icon-button>` : ''}
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
