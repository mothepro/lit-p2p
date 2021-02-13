import { LitElement, html, customElement, property, css, internalProperty } from 'lit-element'
import type { SafeListener } from 'fancy-emitter'
import type { Client } from '@mothepro/fancy-p2p'

import '@material/mwc-button'
import '@material/mwc-list'
import '@material/mwc-icon-button'
import '@material/mwc-textfield'

export type NameChangeEvent = CustomEvent<string>
export type ProposalEvent = CustomEvent<Client[]>

declare global {
  interface HTMLElementEventMap {
    'p2p-error': ErrorEvent
    'name-change': NameChangeEvent
    proposal: ProposalEvent
  }
}

/** Lets the event loop clear. */
const microTick = () => new Promise(ok => setTimeout(ok, 6))

@customElement('p2p-duo-lobby')
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
  connection?: SafeListener<Client>

  @property({ attribute: false })
  groupExists?: (...clients: Client[]) => boolean

  /** Others connected to the lobby. */
  @internalProperty()
  private clients: {
    client: Client
    action?: (accept: boolean) => void
  }[] = []

  @property({ type: Boolean, reflect: true })
  private editing = false

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
    
    :host mwc-icon-button {
      position: absolute;
      top: 0;
      right: 0;
    }
    
    :host mwc-icon-button[part="reject"] {
      margin-right: var(--mdc-icon-button-size, 48px);
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
    this.clients = [...this.clients, { client }]
    for await (const { action, ack } of client.proposals) {
      this.clients = this.clients.map(item =>
        item.client == client
          ? { client, action }
          : item)

      // Update UI every time a client accepts or rejects the proposal
      ack.on(() => this.requestUpdate())
        .catch(error => this.dispatchEvent(new ErrorEvent('p2p-error', { error })))
        .finally(() => this.requestUpdate())
    }
    this.clients = this.clients.filter(({ client: currentClient }) => currentClient != client)
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

  protected readonly render = () => html`${this.editing
    // Editing own name textfield
    ? html`
      <mwc-textfield
        part="name-input"
        outlined
        charCounter
        type="text"
        label="Your Name"
        id="field"
        maxlength=${this.maxlength}
        value=${this.name}
        @keydown=${this.nameChange}
        @blur=${() => this.editing = false}
      ></mwc-textfield>`

    : this.canChangeName
      // Your name as an 'editable' button
      ? html`
      <mwc-button
        part="is-you can-edit"
        trailingIcon
        icon="create"
        label=${this.name}
        title="Change your name"
        @click=${() => this.editing = true}
      ></mwc-button>`

      // Your name plain-text
      : html`
      <span part="is-you can-not-edit">
        ${this.name}
      </span>`}
    <mwc-list
      part="client-list"
      rootTabbable
      activatable
    >${this.clients.filter(({ client }) => !client.isYou).map(({ client, action }, index) => html`
      <mwc-list-item
        part="client is-other"
        tabindex=${index}
        ?hasMeta=${!action}
        ?noninteractive=${!action && this.groupExists!(client)}
        @click=${() => !action && !this.groupExists!(client) && this.dispatchEvent(new CustomEvent('proposal', { detail: [client] }))}>
        ${client.name}
        ${action
        ? html`
          <mwc-icon-button
            part="accept"
            icon="check_circle"
            label="Aceept"
            @click=${() => {
              microTick().then(() => action(true)) // Ensure we don't "click" again to propose to the one we rejected
              this.clients = this.clients.map(item => item.client == client ? { client, action: undefined } : item)
            }}></mwc-icon-button>
          <mwc-icon-button
            part="reject"
            icon="cancel"
            label="Reject"
            @click=${() => {
              microTick().then(() => action(false)) // Ensure we don't "click" again to propose to the one we rejected
              this.clients = this.clients.map(item => item.client == client ? { client, action: undefined } : item)
            }}></mwc-icon-button>`
        : this.groupExists!(client)
          ? html`<mwc-icon part="waiting" slot="meta">hourglass_empty</mwc-icon>`
          : html`<mwc-icon part="invite" slot="meta">add_circle</mwc-icon>`}
        </mwc-list-item>`)}${

    // Alone slot
    this.clients.length == 1 ? html`
      <slot name="alone">
        <mwc-list-item part="client is-alone" class="alone" noninteractive>
          Waiting for others to join this lobby.
        </mwc-list-item>
      </slot>` : ''}
    </mwc-list>`
}
