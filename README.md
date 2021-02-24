# `<lit-p2p>`

> A web component to simplify finding peers using fancy-p2p and material UI

[![npm](https://img.shields.io/npm/v/lit-p2p.svg)](https://www.npmjs.com/package/lit-p2p)
[![Published on webcomponents.org](https://img.shields.io/badge/webcomponents.org-published-blue.svg)](https://www.webcomponents.org/element/lit-p2p)

## Install

`yarn add lit-p2p`

## How to Use

| Attribute | Type | Default | Description |
| --------- | ---- | ------- | ----------- |
| `state` | `number` | `-1` Disconnected | State of the underlying P2P instance. **Include this attribute to start!** |

<!--
Inline demo for webcomponents.org
```
<custom-element-demo>
  <template>
    <next-code-block></next-code-block>
  </template>
</custom-element-demo>
```
-->
```html
<!-- 
  Import the element.

  The `module` query parameter expands "bare" imports to full unpkg.com urls.
  This means use of an import map isn't needed.
  @see https://unpkg.com#query-params
-->
<script type="module" src="//unpkg.com/lit-p2p/dist/esm/index.js?module"></script>


```

TODO
+ Better docs API
+ Improve method for passing `READY` state data to `<slot>`
+ Show who ack'd proposal
