import { c as createRouter, a as createRootRoute, b as createFileRoute, l as lazyRouteComponent, H as HeadContent, S as Scripts } from "../_libs/tanstack__react-router.mjs";
import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { b as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { Q as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/tiny-invariant.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/tiny-warning.mjs";
const appCss = "/assets/styles-Ct55cw4F.css";
const queryClient = new QueryClient();
const Route$2 = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8"
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      },
      {
        title: "Graphs"
      }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
      }
    ]
  }),
  shellComponent: RootDocument
});
function RootDocument({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("html", { lang: "en", suppressHydrationWarning: true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("head", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("body", { className: "font-sans antialiased wrap-anywhere selection:bg-[rgba(79,184,178,0.24)]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(QueryClientProvider, { client: queryClient, children }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Scripts, {})
    ] })
  ] });
}
const $$splitComponentImporter$1 = () => import("./index-D91a9fRr.mjs");
const Route$1 = createFileRoute("/")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./user._username-CxFOcS5Y.mjs").then((n) => n.a);
const Route = createFileRoute("/user/$username")({
  validateSearch: (search) => ({
    q: typeof search.q === "string" ? search.q : void 0,
    artists: Array.isArray(search.artists) ? search.artists.filter((a) => typeof a === "string") : typeof search.artists === "string" ? [search.artists] : void 0,
    next: typeof search.next === "number" ? search.next : typeof search.next === "string" ? Number(search.next) || void 0 : void 0,
    prev: typeof search.prev === "number" ? search.prev : typeof search.prev === "string" ? Number(search.prev) || void 0 : void 0
  }),
  component: lazyRouteComponent($$splitComponentImporter, "component"),
  head: ({
    params
  }) => ({
    meta: [{
      title: `${params.username}'s Graph`
    }]
  })
});
const IndexRoute = Route$1.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$2
});
const UserUsernameRoute = Route.update({
  id: "/user/$username",
  path: "/user/$username",
  getParentRoute: () => Route$2
});
const rootRouteChildren = {
  IndexRoute,
  UserUsernameRoute
};
const routeTree = Route$2._addFileChildren(rootRouteChildren)._addFileTypes();
function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0
  });
  return router;
}
export {
  getRouter
};
