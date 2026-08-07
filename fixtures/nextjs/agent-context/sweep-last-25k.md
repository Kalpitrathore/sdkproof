---
title: headers
description: API reference for the headers function.
url: "https://nextjs.org/docs/app/api-reference/functions/headers"
docs_index: /docs/llms.txt
version: 16.3.0
lastUpdated: 2026-06-09
prerequisites:
  - "API Reference: /docs/app/api-reference"
  - "Functions: /docs/app/api-reference/functions"
---


> For an index of all Next.js documentation, see [/docs/llms.txt](/docs/llms.txt).
`headers` is an **async** function that allows you to **read** the HTTP incoming request headers from a [Server Component](/docs/app/getting-started/server-and-client-components).

```tsx filename="app/page.tsx" switcher
import { headers } from 'next/headers'

export default async function Page() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent')
}
```

```jsx filename="app/page.js" switcher
import { headers } from 'next/headers'

export default async function Page() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent')
}
```

## Reference

### Parameters

`headers` does not take any parameters.

### Returns

`headers` returns a **read-only** [Web Headers](https://developer.mozilla.org/docs/Web/API/Headers) object.

* [`Headers.entries()`](https://developer.mozilla.org/docs/Web/API/Headers/entries): Returns an [`iterator`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Iteration_protocols) allowing to go through all key/value pairs contained in this object.
* [`Headers.forEach()`](https://developer.mozilla.org/docs/Web/API/Headers/forEach): Executes a provided function once for each key/value pair in this `Headers` object.
* [`Headers.get()`](https://developer.mozilla.org/docs/Web/API/Headers/get): Returns a [`String`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) sequence of all the values of a header within a `Headers` object with a given name.
* [`Headers.has()`](https://developer.mozilla.org/docs/Web/API/Headers/has): Returns a boolean stating whether a `Headers` object contains a certain header.
* [`Headers.keys()`](https://developer.mozilla.org/docs/Web/API/Headers/keys): Returns an [`iterator`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Iteration_protocols) allowing you to go through all keys of the key/value pairs contained in this object.
* [`Headers.values()`](https://developer.mozilla.org/docs/Web/API/Headers/values): Returns an [`iterator`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Iteration_protocols) allowing you to go through all values of the key/value pairs contained in this object.

## Good to know

* `headers` is an **asynchronous** function that returns a promise. You must use `async/await` or React's [`use`](https://react.dev/reference/react/use) function.
  * In version 14 and earlier, `headers` was a synchronous function. To help with backwards compatibility, you can still access it synchronously in Next.js 15, but this behavior will be deprecated in the future.
* Since `headers` is read-only, you cannot `set` or `delete` the outgoing request headers.
* `headers` is a [Request-time API](/docs/app/glossary#request-time-apis) whose returned values cannot be known ahead of time. Using it in will opt a route into **[dynamic rendering](/docs/app/glossary#dynamic-rendering)**.
* With [Cache Components](/docs/app/getting-started/caching), calling `headers()` outside of a [`<Suspense>`](https://react.dev/reference/react/Suspense) boundary prevents the route from being prerendered. See [Next.js encountered runtime data during prerendering](/docs/messages/blocking-prerender-runtime) for fix options.

## Examples

### Using the Authorization header

```jsx filename="app/page.js"
import { headers } from 'next/headers'

export default async function Page() {
  const authorization = (await headers()).get('authorization')
  const res = await fetch('...', {
    headers: { authorization }, // Forward the authorization header
  })
  const user = await res.json()

  return <h1>{user.name}</h1>
}
```

## Version History

| Version      | Changes                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `v15.0.0-RC` | `headers` is now an async function. A [codemod](/docs/app/guides/upgrading/codemods#150) is available. |
| `v13.0.0`    | `headers` introduced.                                                                                  |
---

For a semantic overview of all documentation, see [/docs/sitemap.md](/docs/sitemap.md)

For an index of all available documentation, see [/docs/llms.txt](/docs/llms.txt)

---
title: redirect
description: API Reference for the redirect function.
url: "https://nextjs.org/docs/app/api-reference/functions/redirect"
docs_index: /docs/llms.txt
version: 16.3.0
lastUpdated: 2026-07-28
prerequisites:
  - "API Reference: /docs/app/api-reference"
  - "Functions: /docs/app/api-reference/functions"
related:
  - app/api-reference/functions/permanentRedirect
  - app/guides/server-actions
---


> For an index of all Next.js documentation, see [/docs/llms.txt](/docs/llms.txt).
The `redirect` function allows you to redirect the user to another URL. `redirect` can be used while rendering in [Server and Client Components](/docs/app/getting-started/server-and-client-components), [Route Handlers](/docs/app/api-reference/file-conventions/route), and [Server Functions](/docs/app/getting-started/mutating-data).

When used in a [streaming context](/docs/app/getting-started/linking-and-navigating#streaming), this will insert a meta tag to emit the redirect on the client side. In a Server Action, `redirect` performs a client-side navigation when JavaScript is available. For progressive enhancement form submissions, it serves a 303 HTTP redirect response. Otherwise, it serves a 307 HTTP redirect response.

If a resource doesn't exist, you can use the [`notFound` function](/docs/app/api-reference/functions/not-found) instead.

## Reference

### Parameters

The `redirect` function accepts two arguments:

```js
redirect(path, type)
```

| Parameter | Type                                                          | Description                                                 |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `path`    | `string`                                                      | The URL to redirect to. Can be a relative or absolute path. |
| `type`    | `'replace'` (default) or `'push'` (default in Server Actions) | The type of redirect to perform.                            |

By default, `redirect` will use `push` (adding a new entry to the browser history stack) in [Server Actions](/docs/app/getting-started/mutating-data) and `replace` (replacing the current URL in the browser history stack) everywhere else. You can override this behavior by specifying the `type` parameter.

The `RedirectType` object contains the available options for the `type` parameter.

```ts
import { redirect, RedirectType } from 'next/navigation'

redirect('/redirect-to', RedirectType.replace)
// or
redirect('/redirect-to', RedirectType.push)
```

The `type` parameter has no effect when used in Server Components.

### Returns

`redirect` does not return a value.

## Behavior

* In Server Actions and Route Handlers, redirect should be called **outside** the `try` block when using `try/catch` statements.
* If you prefer to return a 308 (Permanent) HTTP redirect instead of 307 (Temporary), you can use the [`permanentRedirect` function](/docs/app/api-reference/functions/permanentRedirect) instead.
* `redirect` throws an error so it should be called **outside** the `try` block when using `try/catch` statements.
* `redirect` can be called in Client Components during the rendering process but not in event handlers. You can use the [`useRouter` hook](/docs/app/api-reference/functions/use-router) instead.
* `redirect` also accepts absolute URLs and can be used to redirect to external links.
* If you'd like to redirect before the render process, use [`next.config.js`](/docs/app/guides/redirecting#redirects-in-nextconfigjs) or [Proxy](/docs/app/guides/redirecting#nextresponseredirect-in-proxy).

## Example

### Server Component

Invoking the `redirect()` function throws a `NEXT_REDIRECT` error and terminates rendering of the route segment in which it was thrown.

```tsx filename="app/team/[id]/page.tsx" switcher
import { redirect } from 'next/navigation'

async function fetchTeam(id: string) {
  const res = await fetch('https://...')
  if (!res.ok) return undefined
  return res.json()
}

export default async function Profile({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const team = await fetchTeam(id)

  if (!team) {
    redirect('/login')
  }

  // ...
}
```

```jsx filename="app/team/[id]/page.js" switcher
import { redirect } from 'next/navigation'

async function fetchTeam(id) {
  const res = await fetch('https://...')
  if (!res.ok) return undefined
  return res.json()
}

export default async function Profile({ params }) {
  const { id } = await params
  const team = await fetchTeam(id)

  if (!team) {
    redirect('/login')
  }

  // ...
}
```

> **Good to know**: `redirect` does not require you to use `return redirect()` as it uses the TypeScript [`never`](https://www.typescriptlang.org/docs/handbook/2/functions.html#never) type.

### Client Component

`redirect` can be directly used in a Client Component.

```tsx filename="components/client-redirect.tsx" switcher
'use client'

import { redirect, usePathname } from 'next/navigation'

export function ClientRedirect() {
  const pathname = usePathname()

  if (pathname.startsWith('/admin') && !pathname.includes('/login')) {
    redirect('/admin/login')
  }

  return <div>Login Page</div>
}
```

```jsx filename="components/client-redirect.jsx" switcher
'use client'

import { redirect, usePathname } from 'next/navigation'

export function ClientRedirect() {
  const pathname = usePathname()

  if (pathname.startsWith('/admin') && !pathname.includes('/login')) {
    redirect('/admin/login')
  }

  return <div>Login Page</div>
}
```

> **Good to know**: When using `redirect` in a Client Component on initial page load during Server-Side Rendering (SSR), it will perform a server-side redirect.

`redirect` can be used in a Client Component through a Server Action. If you need to use an event handler to redirect the user, you can use the [`useRouter`](/docs/app/api-reference/functions/use-router) hook.

```tsx filename="app/client-redirect.tsx" switcher
'use client'

import { navigate } from './actions'

export function ClientRedirect() {
  return (
    <form action={navigate}>
      <input type="text" name="id" />
      <button>Submit</button>
    </form>
  )
}
```

```jsx filename="app/client-redirect.jsx" switcher
'use client'

import { navigate } from './actions'

export function ClientRedirect() {
  return (
    <form action={navigate}>
      <input type="text" name="id" />
      <button>Submit</button>
    </form>
  )
}
```

```ts filename="app/actions.ts" switcher
'use server'

import { redirect } from 'next/navigation'

export async function navigate(data: FormData) {
  redirect(`/posts/${data.get('id')}`)
}
```

```js filename="app/actions.js" switcher
'use server'

import { redirect } from 'next/navigation'

export async function navigate(data) {
  redirect(`/posts/${data.get('id')}`)
}
```

## FAQ

### Why does `redirect` use 307 and 308?

When using `redirect()` you may notice that the status codes used are `307` for a temporary redirect, and `308` for a permanent redirect. While traditionally a `302` was used for a temporary redirect, and a `301` for a permanent redirect, many browsers changed the request method of the redirect, from a `POST` to `GET` request when using a `302`, regardless of the origins request method.

Taking the following example of a redirect from `/users` to `/people`, if you make a `POST` request to `/users` to create a new user, and are conforming to a `302` temporary redirect, the request method will be changed from a `POST` to a `GET` request. This doesn't make sense, as to create a new user, you should be making a `POST` request to `/people`, and not a `GET` request.

The introduction of the `307` status code means that the request method is preserved as `POST`.

* `302` - Temporary redirect, will change the request method from `POST` to `GET`
* `307` - Temporary redirect, will preserve the request method as `POST`

The `redirect()` method uses a `307` by default, instead of a `302` temporary redirect, meaning the request method is preserved. Server Action form submissions are an exception: they use a `303` response so the browser follows the redirect with a `GET` request. When JavaScript is available, Server Actions perform a client-side navigation instead of an HTTP redirect.

[Learn more](https://developer.mozilla.org/docs/Web/HTTP/Redirections) about HTTP Redirects.

## Version History

| Version   | Changes                |
| --------- | ---------------------- |
| `v13.0.0` | `redirect` introduced. |
- [permanentRedirect](/docs/app/api-reference/functions/permanentRedirect)
  - API Reference for the permanentRedirect function.
- [Server Actions](/docs/app/guides/server-actions)
  - How Server Actions work in Next.js, including the single-roundtrip response model, sequential dispatch, security, and caching integration.

---

For a semantic overview of all documentation, see [/docs/sitemap.md](/docs/sitemap.md)

For an index of all available documentation, see [/docs/llms.txt](/docs/llms.txt)

---
title: route.js
description: API reference for the route.js special file.
url: "https://nextjs.org/docs/app/api-reference/file-conventions/route"
docs_index: /docs/llms.txt
version: 16.3.0
lastUpdated: 2026-04-30
prerequisites:
  - "API Reference: /docs/app/api-reference"
  - "File-system conventions: /docs/app/api-reference/file-conventions"
---


> For an index of all Next.js documentation, see [/docs/llms.txt](/docs/llms.txt).
Route Handlers allow you to create custom request handlers for a given route using the Web [Request](https://developer.mozilla.org/docs/Web/API/Request) and [Response](https://developer.mozilla.org/docs/Web/API/Response) APIs.

```ts filename="route.ts" switcher
export async function GET() {
  return Response.json({ message: 'Hello World' })
}
```

```js filename="route.js" switcher
export async function GET() {
  return Response.json({ message: 'Hello World' })
}
```

## Reference

### HTTP Methods

A **route** file allows you to create custom request handlers for a given route. The following [HTTP methods](https://developer.mozilla.org/docs/Web/HTTP/Methods) are supported: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.

```ts filename="route.ts" switcher
export async function GET(request: Request) {}

export async function HEAD(request: Request) {}

export async function POST(request: Request) {}

export async function PUT(request: Request) {}

export async function DELETE(request: Request) {}

export async function PATCH(request: Request) {}

// If `OPTIONS` is not defined, Next.js will automatically implement `OPTIONS` and set the appropriate Response `Allow` header depending on the other methods defined in the Route Handler.
export async function OPTIONS(request: Request) {}
```

```js filename="route.js" switcher
export async function GET(request) {}

export async function HEAD(request) {}

export async function POST(request) {}

export async function PUT(request) {}

export async function DELETE(request) {}

export async function PATCH(request) {}

// If `OPTIONS` is not defined, Next.js will automatically implement `OPTIONS` and set the appropriate Response `Allow` header depending on the other methods defined in the Route Handler.
export async function OPTIONS(request) {}
```

### Parameters

#### `request` (optional)

The `request` object is a [NextRequest](/docs/app/api-reference/functions/next-request) object, which is an extension of the Web [Request](https://developer.mozilla.org/docs/Web/API/Request) API. `NextRequest` gives you further control over the incoming request, including easily accessing `cookies` and an extended, parsed, URL object `nextUrl`.

```ts filename="route.ts" switcher
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl
}
```

```js filename="route.js" switcher
export async function GET(request) {
  const url = request.nextUrl
}
```

#### `context` (optional)

* **`params`**: a promise that resolves to an object containing the [dynamic route parameters](/docs/app/api-reference/file-conventions/dynamic-routes) for the current route.

```ts filename="app/dashboard/[team]/route.ts" switcher
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string }> }
) {
  const { team } = await params
}
```

```js filename="app/dashboard/[team]/route.js" switcher
export async function GET(request, { params }) {
  const { team } = await params
}
```

| Example                          | URL            | `params`                           |
| -------------------------------- | -------------- | ---------------------------------- |
| `app/dashboard/[team]/route.js`  | `/dashboard/1` | `Promise<{ team: '1' }>`           |
| `app/shop/[tag]/[item]/route.js` | `/shop/1/2`    | `Promise<{ tag: '1', item: '2' }>` |
| `app/blog/[...slug]/route.js`    | `/blog/1/2`    | `Promise<{ slug: ['1', '2'] }>`    |

### Route Context Helper

You can type the Route Handler context using `RouteContext` to get strongly typed `params` from a route literal. `RouteContext` is a globally available helper.

```ts filename="app/users/[id]/route.ts"
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, ctx: RouteContext<'/users/[id]'>) {
  const { id } = await ctx.params
  return Response.json({ id })
}
```

> **Good to know**
>
> * Types are generated during `next dev`, `next build` or `next typegen`.
> * After type generation, the `RouteContext` helper is globally available. It doesn't need to be imported.

## Examples

### Cookies

You can read or set cookies with [`cookies`](/docs/app/api-reference/functions/cookies) from `next/headers`.

```ts filename="route.ts" switcher
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()

  const a = cookieStore.get('a')
  const b = cookieStore.set('b', '1')
  const c = cookieStore.delete('c')
}
```

```js filename="route.js" switcher
import { cookies } from 'next/headers'

export async function GET(request) {
  const cookieStore = await cookies()

  const a = cookieStore.get('a')
  const b = cookieStore.set('b', '1')
  const c = cookieStore.delete('c')
}
```

Alternatively, you can return a new `Response` using the [`Set-Cookie`](https://developer.mozilla.org/docs/Web/HTTP/Headers/Set-Cookie) header.

```ts filename="app/api/route.ts" switcher
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token.value}` },
  })
}
```

```js filename="app/api/route.js" switcher
import { cookies } from 'next/headers'

export async function GET(request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token.value}` },
  })
}
```

You can also use the underlying Web APIs to read cookies from the request ([`NextRequest`](/docs/app/api-reference/functions/next-request)):

```ts filename="app/api/route.ts" switcher
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')
}
```

```js filename="app/api/route.js" switcher
export async function GET(request) {
  const token = request.cookies.get('token')
}
```

### Headers

You can read headers with [`headers`](/docs/app/api-reference/functions/headers) from `next/headers`.

```ts filename="route.ts" switcher
import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const headersList = await headers()
  const referer = headersList.get('referer')
}
```

```js filename="route.js" switcher
import { headers } from 'next/headers'

export async function GET(request) {
  const headersList = await headers()
  const referer = headersList.get('referer')
}
```

This `headers` instance is read-only. To set headers, you need to return a new `Response` with new `headers`.

```ts filename="app/api/route.ts" switcher
import { headers } from 'next/headers'

export async function GET(request: Request) {
  const headersList = await headers()
  const referer = headersList.get('referer')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { referer: referer },
  })
}
```

```js filename="app/api/route.js" switcher
import { headers } from 'next/headers'

export async function GET(request) {
  const headersList = await headers()
  const referer = headersList.get('referer')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { referer: referer },
  })
}
```

You can also use the underlying Web APIs to read headers from the request ([`NextRequest`](/docs/app/api-reference/functions/next-request)):

```ts filename="app/api/route.ts" switcher
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
}
```

```js filename="app/api/route.js" switcher
export async function GET(request) {
  const requestHeaders = new Headers(request.headers)
}
```

### Revalidating Cached Data

You can [revalidate cached data](/docs/app/guides/incremental-static-regeneration) using the `revalidate` route segment config option.

```ts filename="app/posts/route.ts" switcher
export const revalidate = 60

export async function GET() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()

  return Response.json(posts)
}
```

```js filename="app/posts/route.js" switcher
export const revalidate = 60

export async function GET() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()

  return Response.json(posts)
}
```

### Redirects

```ts filename="app/api/route.ts" switcher
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  redirect('https://nextjs.org/')
}
```

```js filename="app/api/route.js" switcher
import { redirect } from 'next/navigation'

export async function GET(request) {
  redirect('https://nextjs.org/')
}
```

### Dynamic Route Segments

Route Handlers can use [Dynamic Segments](/docs/app/api-reference/file-conventions/dynamic-routes) to create request handlers from dynamic data.

```ts filename="app/items/[slug]/route.ts" switcher
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params // 'a', 'b', or 'c'
}
```

```js filename="app/items/[slug]/route.js" switcher
export async function GET(request, { params }) {
  const { slug } = await params // 'a', 'b', or 'c'
}
```

| Route                       | Example URL | `params`                 |
| --------------------------- | ----------- | ------------------------ |
| `app/items/[slug]/route.js` | `/items/a`  | `Promise<{ slug: 'a' }>` |
| `app/items/[slug]/route.js` | `/items/b`  | `Promise<{ slug: 'b' }>` |
| `app/items/[slug]/route.js` | `/items/c`  | `Promise<{ slug: 'c' }>` |

#### Static Generation with `generateStaticParams`

You can use [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params) with dynamic Route Handlers to statically generate responses at build time for specified params, while handling other params dynamically at request time.

When using [Cache Components](/docs/app/getting-started/caching), you can combine `generateStaticParams` with `use cache` to enable data caching for both prerendered and runtime params.

See the [generateStaticParams with Route Handlers](/docs/app/api-reference/functions/generate-static-params#with-route-handlers) documentation for examples and details.

### URL Query Parameters

The request object passed to the Route Handler is a `NextRequest` instance, which includes [some additional convenience methods](/docs/app/api-reference/functions/next-request#nexturl), such as those for more easily handling query parameters.


In Next.js 16 the signature is `revalidateTag(tag: string, profile: string | { expire?: number })` — the profile argument is required.
