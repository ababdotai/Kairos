# Console logging

Kairos keeps routine activity out of the console by default.

| Category | Examples | Output |
| --- | --- | --- |
| Lifecycle | initialization, page navigation, player detection, fullscreen | Debug only |
| UI activity | panel mounting, timeline rendering, note preview, position restoration | Debug only |
| AI diagnostics | subtitle availability and length, scan lifecycle | Debug only; no subtitle excerpts or complete AI responses |
| Optional AI failure | automatic highlight or HUD generation unavailable | Warning |
| Data and operation failure | note loading, saving, deletion, refinement persistence, background requests | Error; retained even with debug disabled |
| Expected state | AI provider not configured, missing SidePanel target | No error; configuration guidance stays in the UI |

In DevTools, select the Kairos content-script execution context and run:

```js
window.Kairos.CONFIG.DEBUG = true;
```

Enable the console's Verbose level to see `console.debug` output. Set the value to
`false` to silence it again. This switch lasts for the current page only; refreshing
restores the default. It does not enable background-worker debug logging.

Missing SidePanel targets retry at most three times without repeated console
messages. Actual save/delete failures remain visible; do not suppress them just
to clear the extension error list. Browser- and website-generated logs are outside
Kairos's control.
