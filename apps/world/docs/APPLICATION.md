# Standalone application lifecycle

`src/main.js` is the browser entry point. It loads the MasterEarth extension,
creates the standalone application, and reports startup errors in the loading
screen. `src/standalone/application.js` resolves the locale before initializing
the interface, then composes the application through `src/app/application.js`.

## Ownership and startup

The application starts four phases in order:

1. `scene` creates the viewer and scene operations.
2. `controls` creates the user-interface controllers.
3. `data` registers and owns the data layers.
4. `tools` creates annotations, voice, and other application tools.

Each phase receives earlier components, an `AbortSignal`, and `defer(cleanup)`.
Register cleanup immediately after acquiring a resource, while the component is
being constructed and before awaiting more work. Cleanup runs in reverse phase
order and in reverse registration order within each phase.

The application owns startup and teardown; components own their resources.
Components must not import the application entry point to reach one another.
Pass the required dependency through the phase context instead.

## State and teardown

`createApplication()` returns `start()`, `destroy()`, `subscribe()`,
`getState()`, and `getComponents()`. Startup reports `created`, `starting`,
`ready`, or `failed`; teardown reports `destroying`, then `destroyed` or
`failed`. Repeated `start()` calls share the startup promise. Repeated
`destroy()` calls share the teardown promise. A destroyed application cannot be
started again; reload the page to create a new standalone instance.

Startup failure aborts the shared signal and releases every resource already
acquired. Cleanup errors are reported as an aggregate failure rather than
silently replacing the original startup error.

## Validation

Run the application from `apps/world` with `npm run dev`. The browser
integration gate `node scripts/qa-application.mjs --url http://localhost:4173`
checks startup, data registration, annotations, visible attribution, and
terminal teardown. The development server must already be running.
