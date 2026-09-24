# Prompt Log

Every input step provided to Claude Code for this project, recorded verbatim and in order, with a short note on what was produced in response.

---

## Step 1: Initial requirements (2026-09-23)

> Create an implementation plan. and document all input steps that I provide.
>
> Create a javascript note taking service that will be used and shared amongst multiple teams.
>
> Using Express.js, create a modular service with the following controllers
>
> use MongoDb for all document storage.
>
> AUTHENTICATION
> POST /register - allows the user to create a new username and passoword
> POST /login - allows the user to login to the application and issues a new JWT token
>
> GATEWAY
> - all requests should have the authenticated user's headers set from the gateway headers should include the user's username
>
> NOTES
> POST /note create a new notes are an object that has this shape {note: String, createdAt: Date, updatedAt: Date, createdBy: String (username), updatedBy: String (username), sharedWith: []}. set the updatedAt/by, createdAt/By using the request headers
> GET /notes retrieve all notes that the user has access to (retrieve using the user's userId) notes by default are shared with all users, a user can choose to make their notes private so that they can be hidden from other users, the sharedWith array should be an array of user id's, if the array is empty, then the note is shared with everyone
> PUT /note update the note's message, or sharedWith fields. updatedAt, and updatedBy should be updated by the backend service. createdBy and createdAt are immutable and should never be updated.
>
> Create class files for each of the models and keep them seperate. seperate the responsibilities of each controller with this microservice.

**Result:** Created this prompt log and the implementation plan at [docs/superpowers/plans/2026-09-23-notes-service.md](superpowers/plans/2026-09-23-notes-service.md). No application code written yet; waiting on plan review.

---

## Step 2: Approve plan; add Swagger, JSDoc, and coding-standards requirements (2026-09-23)

> I've reviewed the plan and everything looks great and ready to implement
>
> implement this using a native strategy. implement this plan using the TDD approach where failing tests are written first, then write the service code to meet the functionality.
>
> add a swagger page that documents each controller endpoint and service and ensure that the schema for every model used is available
>
> for models, code (features and tests) add documentation (JSDocs, and comments) comments should be short and easily readable.
>
> for coding standards, follow standard and easily testable conventions. avoid single line return statements

**Result:** Updated the plan (`docs/superpowers/plans/2026-09-23-notes-service.md`) to add: a Coding Standards section (JSDoc on every exported class/function, short comments, no expression-bodied/implicit-return functions for named logic), an OpenAPI/Swagger task (`swagger-jsdoc` + `swagger-ui-express`, mounted at `/api-docs`, with component schemas for every model and DTO), and revised every task's code samples to follow both. Then executed the plan natively, task by task, TDD-first.
