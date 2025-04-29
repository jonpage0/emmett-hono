# Plan for Creating `@event-driven-io/emmett-hono` Adapter (TDD Approach)

This document outlines the plan for building a Hono adapter for the Emmett framework, following Test-Driven Development (TDD) principles.

## Overall Goal

Create a new package `@event-driven-io/emmett-hono` that allows developers to easily integrate Emmett's event sourcing capabilities with the Hono web framework, aligning with the conventions set by existing adapters (`emmett-expressjs`, `emmett-fastify`).

## TDD Workflow

1.  **Define Tests:** Outline the required end-to-end (E2E) test scenarios in `tests.md`, covering core functionalities and integration points.
2.  **Implement Tests:** Write the E2E tests based on `tests.md` using Hono's testing utilities (e.g., `hono/testing`) and Emmett's testing helpers. These tests will initially fail.
3.  **Implement Adapter Code:** Write the minimum necessary adapter code (`src/application.ts`, `src/handler.ts`, etc.) to make the tests pass.
4.  **Refactor:** Refactor the adapter code and tests for clarity, efficiency, and maintainability.
5.  **Repeat:** Continue the cycle for each feature/scenario defined in `tests.md`.

## Implementation Steps (Driven by Tests)

1.  **Setup New Package:**

    - Create directory: `src/packages/emmett-hono`.
    - Add standard configuration files (`package.json`, `tsconfig.json`, `tsup.config.ts`, etc.).
    - Update root `package.json` workspaces and `tsconfig.json` references.

2.  **Define & Implement E2E Tests (`src/e2e/` & `tests.md`):**

        - Define scenarios covering:
          - Basic routing and request handling (GET, POST, PUT, DELETE).
          - Path, query, and body parameter handling.
          - Standard response generation (OK, Created, NoContent, etc.).
          - ETag generation and optimistic concurrency checks (`If-Match`).
          - Error handling (mapping Emmett/Hono errors to Problem Details).
          - Basic middleware integration (e.g., CORS, ETag).
        - Implement these tests using `hono/testing` and Emmett helpers.

    34a| - [x] Scenario 1.1 (GET): Implemented and passing.
    34b| - [x] Scenario 1.2 (POST): Implemented and passing.
    34c| - [ ] Scenario 1.3 (PUT): Next to implement.

3.  **Implement Core Application Logic (`src/application.ts`):**

    - Define `getApplication(options)`: Creates `Hono` instance, registers minimal necessary middleware (driven by test failures), provides route registration mechanism.
    - Define `startAPI(app, options)`: Starts the Hono server using appropriate adapters.

4.  **Implement Handler/Response Wrappers (`src/handler.ts`, `src/responses.ts`):**

    - Create helpers (`OK`, `Created`, `NoContent`, `HttpProblem`, etc.) as needed to make response tests pass.
    - Implement `on(handler)` wrapper if required by test structure or Hono integration needs.

5.  **Implement ETag Helpers (`src/etag.ts`):**

    - Define ETag constants and context interaction functions (`getETagFromIfMatch`, `setETag`) as required by ETag/optimistic concurrency tests.

6.  **Implement Error Handling (`src/application.ts` or middleware):**

    - Implement `app.onError` logic to map errors to Problem Details as dictated by error handling tests.

7.  **Refactor & Document:**
    - Refactor code for clarity and maintainability.
    - Add documentation for the new adapter.

## Diagram (Simplified Flow - Remains the Same)

```mermaid
graph TD
    A[HTTP Request] --> B(Hono Adapter: getApplication);
    B -- Creates --> C{Hono Instance};
    C -- Registers --> D[Built-in Middleware: ETag, CORS, etc.];
    C -- Registers --> E[User Routes / API Setup];
    E -- Uses --> F(Handler/Response Helpers);
    F -- Uses --> G(Hono Context Methods: c.json, c.text);
    E -- Uses --> H(Emmett Command Handler);
    H -- Uses --> I(Emmett Event Store);
    H -- Uses --> J(Emmett Business Logic);
    J -- Returns --> K[Event(s)];
    H -- Appends --> I;
    F -- Returns --> L[HTTP Response];
    C -- Uses --> M(Error Handler: app.onError);
    M -- Maps Error --> F;

    subgraph Emmett Core
        I; J; K;
    end

    subgraph Hono Adapter Package
        B; C; D; E; F; G; M;
    end

    subgraph User Code
        E; J;
    end
```
