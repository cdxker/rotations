import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { u as useNavigate } from "../_libs/tanstack__react-router.mjs";
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
function Home() {
  const [username, setUsername] = reactExports.useState("");
  const navigate = useNavigate();
  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed) {
      navigate({
        to: "/user/$username",
        params: {
          username: trimmed
        }
      });
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "min-h-screen flex items-center justify-center bg-white dark:bg-black text-black dark:text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "flex gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "text", value: username, onChange: (e) => setUsername(e.target.value), placeholder: "Last.fm username", className: "px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400", autoFocus: true }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-4 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black hover:opacity-80", children: "View Graph" })
  ] }) });
}
export {
  Home as component
};
