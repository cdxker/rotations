import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { d as useParams, e as useSearch, u as useNavigate } from "../_libs/tanstack__react-router.mjs";
import { u as useQueryClient, a as useQuery } from "../_libs/tanstack__react-query.mjs";
import { G as Graph } from "../_libs/graphology.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { c as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { S as Sun, M as Moon, a as Search, U as Users, P as PanelRight, C as ChevronLeft, b as ChevronRight, c as ChevronDown, d as Check, X, e as PanelRightClose } from "../_libs/lucide-react.mjs";
import { g as getDefaultClassNames, D as DayPicker } from "../_libs/react-day-picker.mjs";
import { C as ComboboxRoot, a as ComboboxInput, b as ComboboxPortal, c as ComboboxPositioner, d as ComboboxPopup, e as ComboboxEmpty$1, f as ComboboxList$1, g as ComboboxItem$1, h as ComboboxItemIndicator, i as ComboboxChips$1, j as ComboboxChip$1, k as ComboboxChipRemove } from "../_libs/base-ui__react.mjs";
import { P as Provider } from "../_libs/radix-ui__react-tooltip.mjs";
import { R as Root2, T as Trigger, P as Portal, C as Content2 } from "../_libs/radix-ui__react-popover.mjs";
import { f as format, a as addDays, b as addMonths, d as addYears } from "../_libs/date-fns.mjs";
import { S as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { R as Root, T as Track, a as Range, b as Thumb } from "../_libs/radix-ui__react-slider.mjs";
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
import "../_libs/tanstack__query-core.mjs";
import "events";
import "../_libs/date-fns__tz.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/reselect.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/tabbable.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/radix-ui__react-focus-guards.mjs";
import "../_libs/radix-ui__react-focus-scope.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/radix-ui__react-portal.mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/aria-hidden.mjs";
import "../_libs/react-remove-scroll.mjs";
import "../_libs/tslib.mjs";
import "../_libs/react-remove-scroll-bar.mjs";
import "../_libs/react-style-singleton.mjs";
import "../_libs/get-nonce.mjs";
import "../_libs/use-sidecar.mjs";
import "../_libs/use-callback-ref.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/radix-ui__react-collection.mjs";
const GRAPH_API_BASE = "https://staging-api.everysong.fm";
function toGraphology(listeningGraph, layout) {
  const graph = new Graph();
  const entries = Object.entries(listeningGraph.nodes);
  if (entries.length === 0) return graph;
  for (const [uuid, node] of entries) {
    const position = node.positions?.[layout] ?? { x: 0, y: 0 };
    graph.addNode(uuid, {
      label: `${node.artists[0] ?? "Unknown"} — ${node.name}`,
      songKey: node.songKey,
      artists: node.artists,
      albumName: node.albumName,
      lastfmUrl: node.lastfmUrl,
      imageUrl: node.imageUrl,
      totalPlays: node.totalPlays,
      sources: node.sources,
      pageRank: node.pageRank ?? 0,
      playDates: node.playDates,
      positions: node.positions,
      size: 4,
      color: "#ffffff",
      x: position.x,
      y: position.y
    });
  }
  for (const [fromUuid, node] of entries) {
    for (const [toUuid, weight] of Object.entries(node.next)) {
      if (!graph.hasNode(toUuid)) continue;
      if (graph.hasEdge(fromUuid, toUuid)) continue;
      graph.addDirectedEdge(fromUuid, toUuid, {
        weight,
        size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
        color: `rgba(0, 0, 0, ${Math.min(0.6, 0.15 + weight * 0.05)})`
      });
    }
  }
  return graph;
}
const GraphContext = reactExports.createContext(null);
function GraphProvider({ children, initialUser }) {
  const [dateRange, setDateRange] = reactExports.useState();
  const [layout, setLayout] = reactExports.useState("pagerank");
  const [manualSelections, setManualSelections] = reactExports.useState(/* @__PURE__ */ new Set());
  const [nextDepth, setNextDepth] = reactExports.useState(1);
  const [prevDepth, setPrevDepth] = reactExports.useState(1);
  const [artistFilter, setArtistFilter] = reactExports.useState(null);
  const [jobId, setJobId] = reactExports.useState(null);
  const queryClient = useQueryClient();
  const { data, isPending, isError, error: graphError } = useQuery({
    queryKey: ["graph", initialUser],
    queryFn: async () => {
      const response = await fetch(`${GRAPH_API_BASE}/graph?user=${encodeURIComponent(initialUser)}`);
      if (response.status === 404) {
        const pipelineRes = await fetch(`${GRAPH_API_BASE}/pipeline/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: initialUser })
        });
        if (pipelineRes.ok) {
          const { jobId: id } = await pipelineRes.json();
          setJobId(id);
        }
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch graph: ${response.status} ${response.statusText}`);
      }
      return response.json();
    },
    retry: false
  });
  const { data: jobData } = useQuery({
    queryKey: ["pipeline-job", jobId],
    queryFn: async () => {
      const res = await fetch(`${GRAPH_API_BASE}/pipeline/run/${jobId}`);
      if (!res.ok) throw new Error("Failed to fetch job status");
      return res.json();
    },
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "succeeded" || status === "failed" || status === "cancelled") {
        return false;
      }
      return 2e3;
    }
  });
  reactExports.useEffect(() => {
    if (jobData?.status === "succeeded") {
      setJobId(null);
      void queryClient.invalidateQueries({ queryKey: ["graph", initialUser] });
    }
  }, [jobData?.status, initialUser, queryClient]);
  const { data: metricsData } = useQuery({
    queryKey: ["graph-metrics", initialUser, layout],
    queryFn: async () => {
      const res = await fetch(
        `${GRAPH_API_BASE}/graph/metrics?user=${encodeURIComponent(initialUser)}&layout=${encodeURIComponent(layout)}`
      );
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
    enabled: !!data
  });
  const nodeMetrics = metricsData?.metrics ?? null;
  function getNodeMetrics(id, forLayout) {
    const metrics = nodeMetrics?.[id];
    if (!metrics) return null;
    const field = forLayout === "pagerank" ? "pageRank" : forLayout === "mds" ? "mdsScore" : "weightedMdsScore";
    if (metrics[field] == null) return null;
    return metrics;
  }
  const graph = reactExports.useMemo(() => {
    if (!data) return null;
    return toGraphology(data, layout);
  }, [data, layout]);
  const filteredPlayCounts = reactExports.useMemo(() => {
    if (!dateRange?.from || !graph) return null;
    const fromStr = dateRange.from.toISOString().slice(0, 10);
    const toStr = (dateRange.to ?? dateRange.from).toISOString().slice(0, 10);
    const counts = /* @__PURE__ */ new Map();
    graph.forEachNode((key, attrs) => {
      let count = 0;
      for (const d of attrs.playDates) {
        const day = d.slice(0, 10);
        if (day >= fromStr && day <= toStr) count++;
      }
      if (count > 0) counts.set(key, count);
    });
    return counts;
  }, [dateRange, graph]);
  const artistMatchingNodes = reactExports.useMemo(() => {
    if (!artistFilter || !graph) return /* @__PURE__ */ new Set();
    const matching = /* @__PURE__ */ new Set();
    graph.forEachNode((id, attrs) => {
      if (attrs.artists.some((a) => artistFilter.has(a))) {
        matching.add(id);
      }
    });
    return matching;
  }, [artistFilter, graph]);
  const selectedNodes = reactExports.useMemo(() => {
    if (artistMatchingNodes.size === 0 && manualSelections.size === 0) return /* @__PURE__ */ new Set();
    const combined = new Set(artistMatchingNodes);
    for (const id of manualSelections) combined.add(id);
    return combined;
  }, [artistMatchingNodes, manualSelections]);
  function toggleSelectedNode(nodeId) {
    setManualSelections((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }
  function addSelectedNode(nodeId) {
    setManualSelections((prev) => {
      if (prev.has(nodeId)) return prev;
      return /* @__PURE__ */ new Set([...prev, nodeId]);
    });
  }
  function clearSelection() {
    setManualSelections(/* @__PURE__ */ new Set());
  }
  const visibleNodes = reactExports.useMemo(() => {
    if (selectedNodes.size === 0 || !graph) return null;
    const visible = new Set(selectedNodes);
    const forwardQueue = [...selectedNodes].map((n) => ({ node: n, depth: 0 }));
    const visitedForward = new Set(selectedNodes);
    while (forwardQueue.length > 0) {
      const { node, depth } = forwardQueue.shift();
      if (depth >= nextDepth) continue;
      graph.forEachOutEdge(node, (_edge, _attrs, _source, target) => {
        if (!visitedForward.has(target)) {
          visible.add(target);
          visitedForward.add(target);
          forwardQueue.push({ node: target, depth: depth + 1 });
        }
      });
    }
    const backwardQueue = [...selectedNodes].map((n) => ({ node: n, depth: 0 }));
    const visitedBackward = new Set(selectedNodes);
    while (backwardQueue.length > 0) {
      const { node, depth } = backwardQueue.shift();
      if (depth >= prevDepth) continue;
      graph.forEachInEdge(node, (_edge, _attrs, source) => {
        if (!visitedBackward.has(source)) {
          visible.add(source);
          visitedBackward.add(source);
          backwardQueue.push({ node: source, depth: depth + 1 });
        }
      });
    }
    return visible;
  }, [selectedNodes, graph, nextDepth, prevDepth]);
  function selectAllVisible() {
    if (!visibleNodes) return;
    setManualSelections((prev) => {
      const next = new Set(prev);
      for (const id of visibleNodes) next.add(id);
      return next;
    });
  }
  const jobStatus = jobData?.status ?? null;
  const isBuilding = jobId !== null && jobStatus !== "failed" && jobStatus !== "cancelled";
  const state = isPending ? "loading" : isBuilding ? "building" : isError ? "error" : data === null ? "loading" : "loaded";
  const value = reactExports.useMemo(() => ({
    graph,
    raw: data ?? null,
    state,
    error: isError ? graphError.message : jobStatus === "failed" ? "Pipeline job failed" : null,
    jobStatus,
    dateRange,
    setDateRange,
    layout,
    setLayout,
    filteredPlayCounts,
    getNodeMetrics,
    selectedNodes,
    visibleNodes,
    toggleSelectedNode,
    addSelectedNode,
    clearSelection,
    selectAllVisible,
    nextDepth,
    setNextDepth,
    prevDepth,
    setPrevDepth,
    artistFilter,
    setArtistFilter
  }), [graph, data, state, isError, graphError, jobStatus, dateRange, layout, filteredPlayCounts, nodeMetrics, selectedNodes, nextDepth, prevDepth, artistFilter]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(GraphContext.Provider, { value, children });
}
function useGraph() {
  const ctx = reactExports.useContext(GraphContext);
  if (!ctx) {
    throw new Error("useGraph must be used within a <GraphProvider>");
  }
  return ctx;
}
function GraphLayout({ children }) {
  const { username } = useParams({ strict: false });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(GraphProvider, { initialUser: username, children });
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "button";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Comp,
    {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      className: cn(buttonVariants({ variant, size, className })),
      ...props
    }
  );
}
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}) {
  const defaultClassNames = getDefaultClassNames();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    DayPicker,
    {
      showOutsideDays,
      className: cn(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      ),
      captionLayout,
      formatters: {
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        ...formatters
      },
      classNames: {
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative",
          defaultClassNames.months
        ),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label" ? "text-sm" : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 text-center [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none",
          props.showWeekNumber ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-md" : "[&:first-child[data-selected=true]_button]:rounded-l-md",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-md bg-accent",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: cn(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames
      },
      components: {
        Root: ({ className: className2, rootRef, ...props2 }) => {
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              "data-slot": "calendar",
              ref: rootRef,
              className: cn(className2),
              ...props2
            }
          );
        },
        Chevron: ({ className: className2, orientation, ...props2 }) => {
          if (orientation === "left") {
            return /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: cn("size-4", className2), ...props2 });
          }
          if (orientation === "right") {
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              ChevronRight,
              {
                className: cn("size-4", className2),
                ...props2
              }
            );
          }
          return /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: cn("size-4", className2), ...props2 });
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props2 }) => {
          return /* @__PURE__ */ jsxRuntimeExports.jsx("td", { ...props2, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex size-(--cell-size) items-center justify-center text-center", children }) });
        },
        ...components
      },
      ...props
    }
  );
}
function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}) {
  const defaultClassNames = getDefaultClassNames();
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Button,
    {
      ref,
      variant: "ghost",
      size: "icon",
      "data-day": day.date.toLocaleDateString(),
      "data-selected-single": modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle,
      "data-range-start": modifiers.range_start,
      "data-range-end": modifiers.range_end,
      "data-range-middle": modifiers.range_middle,
      className: cn(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      ),
      ...props
    }
  );
}
function Popover({
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Root2, { "data-slot": "popover", ...props });
}
function PopoverTrigger({
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Trigger, { "data-slot": "popover-trigger", ...props });
}
function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Portal, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    Content2,
    {
      "data-slot": "popover-content",
      align,
      sideOffset,
      className: cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
        className
      ),
      ...props
    }
  ) });
}
const PRESETS = [
  { label: "Today", range: () => {
    const d = /* @__PURE__ */ new Date();
    return { from: d, to: d };
  } },
  { label: "Past 2 days", range: () => ({ from: addDays(/* @__PURE__ */ new Date(), -2), to: /* @__PURE__ */ new Date() }) },
  { label: "Past week", range: () => ({ from: addDays(/* @__PURE__ */ new Date(), -7), to: /* @__PURE__ */ new Date() }) },
  { label: "Past month", range: () => ({ from: addMonths(/* @__PURE__ */ new Date(), -1), to: /* @__PURE__ */ new Date() }) },
  { label: "Past 3 months", range: () => ({ from: addMonths(/* @__PURE__ */ new Date(), -3), to: /* @__PURE__ */ new Date() }) },
  { label: "Past year", range: () => ({ from: addYears(/* @__PURE__ */ new Date(), -1), to: /* @__PURE__ */ new Date() }) }
];
function formatRange(range) {
  if (!range?.from) return "";
  if (!range.to || format(range.from, "PP") === format(range.to, "PP")) return format(range.from, "LLL dd, y");
  return `${format(range.from, "LLL dd, y")} – ${format(range.to, "LLL dd, y")}`;
}
function DatePicker() {
  const { dateRange, setDateRange: onDateRangeChange } = useGraph();
  const [open, setOpen] = reactExports.useState(false);
  const [showCalendar, setShowCalendar] = reactExports.useState(false);
  const [activeLabel, setActiveLabel] = reactExports.useState("All time");
  function selectPreset(label, range) {
    setActiveLabel(label);
    onDateRangeChange(range);
    setOpen(false);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { open, onOpenChange: (v) => {
    setOpen(v);
    if (!v) setShowCalendar(false);
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "text-left cursor-pointer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-black dark:text-white text-sm font-medium", children: activeLabel }),
      dateRange?.from && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-neutral-600 dark:text-neutral-500 text-xs", children: formatRange(dateRange) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { className: "w-auto p-0 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700", align: "start", children: !showCalendar ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col p-2 gap-1", children: [
      PRESETS.map((preset) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          variant: "ghost",
          className: "justify-start text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800",
          onClick: () => selectPreset(preset.label, preset.range()),
          children: preset.label
        },
        preset.label
      )),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          variant: "ghost",
          className: "justify-start text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800",
          onClick: () => selectPreset("All time", void 0),
          children: "All time"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-neutral-200 dark:border-neutral-700 my-1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          variant: "ghost",
          className: "justify-start text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800",
          onClick: () => setShowCalendar(true),
          children: "Custom range..."
        }
      )
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Calendar,
        {
          mode: "range",
          defaultMonth: dateRange?.from,
          selected: dateRange,
          onSelect: (range) => {
            onDateRangeChange(range);
            if (range?.from && range.to) {
              setActiveLabel("Custom");
            }
          },
          numberOfMonths: 2,
          className: "bg-white dark:bg-neutral-900 text-black dark:text-white"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-2 border-t border-neutral-200 dark:border-neutral-700 flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Button,
          {
            variant: "ghost",
            className: "flex-1 text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800",
            onClick: () => setShowCalendar(false),
            children: "Back"
          }
        ),
        dateRange?.from && dateRange.to && /* @__PURE__ */ jsxRuntimeExports.jsx(
          Button,
          {
            variant: "ghost",
            className: "flex-1 text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800",
            onClick: () => {
              setActiveLabel("Custom");
              setOpen(false);
            },
            children: "Done"
          }
        )
      ] })
    ] }) })
  ] });
}
const Combobox = ComboboxRoot;
function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ComboboxPortal, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    ComboboxPositioner,
    {
      side,
      sideOffset,
      align,
      alignOffset,
      anchor,
      className: "isolate z-50",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ComboboxPopup,
        {
          "data-slot": "combobox-content",
          "data-chips": !!anchor,
          className: cn(
            "group/combobox-content relative max-h-96 w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[chips=true]:min-w-(--anchor-width) data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          ),
          ...props
        }
      )
    }
  ) });
}
function ComboboxList({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    ComboboxList$1,
    {
      "data-slot": "combobox-list",
      className: cn(
        "max-h-[min(calc(--spacing(96)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto p-1 data-empty:p-0 dark:[color-scheme:dark]",
        className
      ),
      ...props
    }
  );
}
function ComboboxItem({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    ComboboxItem$1,
    {
      "data-slot": "combobox-item",
      className: cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ComboboxItemIndicator,
          {
            "data-slot": "combobox-item-indicator",
            render: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center" }),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "pointer-events-none size-4 pointer-coarse:size-5" })
          }
        )
      ]
    }
  );
}
function ComboboxEmpty({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    ComboboxEmpty$1,
    {
      "data-slot": "combobox-empty",
      className: cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className
      ),
      ...props
    }
  );
}
function ComboboxChips({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    ComboboxChips$1,
    {
      "data-slot": "combobox-chips",
      className: cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent bg-clip-padding px-2.5 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-[3px] has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1.5 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40",
        className
      ),
      ...props
    }
  );
}
function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    ComboboxChip$1,
    {
      "data-slot": "combobox-chip",
      className: cn(
        "flex h-[calc(--spacing(5.5))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0",
        className
      ),
      ...props,
      children: [
        children,
        showRemove && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ComboboxChipRemove,
          {
            render: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon-xs" }),
            className: "-ml-1 opacity-50 hover:opacity-100",
            "data-slot": "combobox-chip-remove",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "pointer-events-none" })
          }
        )
      ]
    }
  );
}
function ComboboxChipsInput({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    ComboboxInput,
    {
      "data-slot": "combobox-chip-input",
      className: cn("min-w-16 flex-1 outline-none", className),
      ...props
    }
  );
}
function SearchBar() {
  const { graph, addSelectedNode } = useGraph();
  const { q } = useSearch({ from: "/user/$username" });
  const navigate = useNavigate();
  const items = reactExports.useMemo(() => {
    if (!graph) return [];
    const nodes = [];
    for (const node of graph.nodes()) {
      nodes.push({ key: node, ...graph.getNodeAttributes(node) });
    }
    nodes.sort((a, b) => b.totalPlays - a.totalPlays);
    return nodes;
  }, [graph]);
  function handleSelect(result) {
    if (result) addSelectedNode(result.key);
  }
  function handleInputChange(value) {
    void navigate({
      from: "/user/$username",
      search: (prev) => ({ ...prev, q: value || void 0 }),
      replace: true
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { size: 14, className: "text-white/40 shrink-0" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Combobox,
      {
        items,
        itemToStringValue: (item) => item.label,
        onValueChange: handleSelect,
        onInputValueChange: handleInputChange,
        inputValue: q ?? "",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ComboboxInput,
            {
              placeholder: "Search tracks...",
              className: "bg-transparent text-white/80 text-xs font-mono placeholder:text-white/30 outline-none w-56 max-w-[60vw]"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(ComboboxContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ComboboxEmpty, { children: "No tracks found." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ComboboxList, { children: (item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(ComboboxItem, { value: item, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 flex-1 truncate text-xs font-mono", children: item.label }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-muted-foreground text-[10px] font-mono shrink-0 ml-2", children: [
                item.totalPlays,
                " plays"
              ] })
            ] }, item.key) })
          ] })
        ]
      }
    )
  ] });
}
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}) {
  const _values = reactExports.useMemo(
    () => Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max],
    [value, defaultValue, min, max]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Root,
    {
      "data-slot": "slider",
      defaultValue,
      value,
      min,
      max,
      className: cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      ),
      ...props,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Track,
          {
            "data-slot": "slider-track",
            className: cn(
              "relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
            ),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              Range,
              {
                "data-slot": "slider-range",
                className: cn(
                  "absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
                )
              }
            )
          }
        ),
        Array.from({ length: _values.length }, (_, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          Thumb,
          {
            "data-slot": "slider-thumb",
            className: "block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          },
          index
        ))
      ]
    }
  );
}
function DepthSliders() {
  const { selectedNodes, nextDepth, setNextDepth, prevDepth, setPrevDepth } = useGraph();
  const { next: urlNext, prev: urlPrev } = useSearch({ from: "/user/$username" });
  const navigate = useNavigate();
  reactExports.useEffect(() => {
    if (urlNext != null && urlNext !== nextDepth) setNextDepth(urlNext);
    if (urlPrev != null && urlPrev !== prevDepth) setPrevDepth(urlPrev);
  }, []);
  if (selectedNodes.size === 0) return null;
  function handlePrevChange([v]) {
    setPrevDepth(v);
    void navigate({
      from: "/user/$username",
      search: (prev) => ({ ...prev, prev: v !== 1 ? v : void 0 }),
      replace: true
    });
  }
  function handleNextChange([v]) {
    setNextDepth(v);
    void navigate({
      from: "/user/$username",
      search: (prev) => ({ ...prev, next: v !== 1 ? v : void 0 }),
      replace: true
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-white/60 text-xs font-mono whitespace-nowrap", children: "Prev" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Slider,
      {
        min: 0,
        max: 20,
        step: 1,
        value: [prevDepth],
        onValueChange: handlePrevChange,
        className: "w-20"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-white/80 text-xs font-mono w-3 text-center", children: prevDepth }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-px h-4 bg-white/20" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-white/60 text-xs font-mono whitespace-nowrap", children: "Next" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Slider,
      {
        min: 0,
        max: 20,
        step: 1,
        value: [nextDepth],
        onValueChange: handleNextChange,
        className: "w-20"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-white/80 text-xs font-mono w-3 text-center", children: nextDepth })
  ] });
}
function ArtistFilter() {
  const { graph, setArtistFilter } = useGraph();
  const { artists: urlArtists } = useSearch({ from: "/user/$username" });
  const navigate = useNavigate();
  const anchorRef = reactExports.useRef(null);
  const artists = reactExports.useMemo(() => {
    if (!graph) return [];
    const counts = /* @__PURE__ */ new Map();
    graph.forEachNode((_id, attrs) => {
      for (const artist of attrs.artists) {
        counts.set(artist, (counts.get(artist) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [graph]);
  const selected = reactExports.useMemo(() => {
    if (!urlArtists?.length) return [];
    const urlSet = new Set(urlArtists);
    return artists.filter((a) => urlSet.has(a.name));
  }, [urlArtists, artists]);
  reactExports.useEffect(() => {
    if (!artists.length) return;
    if (selected.length === 0) {
      setArtistFilter(null);
    } else {
      setArtistFilter(new Set(selected.map((a) => a.name)));
    }
  }, [selected, setArtistFilter, artists.length]);
  function handleValueChange(value) {
    const names = value.map((a) => a.name);
    void navigate({
      from: "/user/$username",
      search: (prev) => ({ ...prev, artists: names.length ? names : void 0 }),
      replace: true
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { size: 14, className: "text-white/40 shrink-0" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      ComboboxRoot,
      {
        multiple: true,
        items: artists,
        itemToStringValue: (item) => item.name,
        value: selected,
        onValueChange: handleValueChange,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            ComboboxChips,
            {
              ref: anchorRef,
              className: "min-h-0 flex-wrap items-center gap-1 rounded-none border-none bg-transparent p-0 shadow-none focus-within:ring-0",
              children: [
                selected.map((artist) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                  ComboboxChip,
                  {
                    className: "bg-white/10 text-white/80 text-[10px] font-mono",
                    children: artist.name
                  },
                  artist.name
                )),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  ComboboxChipsInput,
                  {
                    placeholder: selected.length === 0 ? "Filter artists..." : "",
                    className: "bg-transparent text-white/80 text-xs font-mono placeholder:text-white/30 outline-none w-28 min-w-8"
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(ComboboxContent, { anchor: anchorRef, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ComboboxEmpty, { children: "No artists found." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ComboboxList, { children: (item) => /* @__PURE__ */ jsxRuntimeExports.jsx(ComboboxItem, { value: item, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 flex-1 truncate text-xs font-mono", children: item.name }) }, item.name) })
          ] })
        ]
      }
    )
  ] });
}
const MOBILE_BREAKPOINT = 768;
function useIsMobile() {
  const [isMobile, setIsMobile] = reactExports.useState(void 0);
  reactExports.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return !!isMobile;
}
function TooltipProvider({
  delayDuration = 0,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Provider,
    {
      "data-slot": "tooltip-provider",
      delayDuration,
      ...props
    }
  );
}
const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SidebarContext = reactExports.createContext(null);
function useSidebar() {
  const context = reactExports.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = reactExports.useState(false);
  const [_open, _setOpen] = reactExports.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = reactExports.useCallback(
    (value) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );
  const toggleSidebar = reactExports.useCallback(() => {
    return isMobile ? setOpenMobile((open2) => !open2) : setOpen((open2) => !open2);
  }, [isMobile, setOpen, setOpenMobile]);
  reactExports.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);
  const state = open ? "expanded" : "collapsed";
  const contextValue = reactExports.useMemo(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SidebarContext.Provider, { value: contextValue, children: /* @__PURE__ */ jsxRuntimeExports.jsx(TooltipProvider, { delayDuration: 0, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "sidebar-wrapper",
      style: {
        "--sidebar-width": SIDEBAR_WIDTH,
        "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
        ...style
      },
      className: cn(
        "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
        className
      ),
      ...props,
      children
    }
  ) }) });
}
function SidebarHeader({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "sidebar-header",
      "data-sidebar": "header",
      className: cn("flex flex-col gap-2 p-2", className),
      ...props
    }
  );
}
function SidebarContent({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "sidebar-content",
      "data-sidebar": "content",
      className: cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      ),
      ...props
    }
  );
}
function SidebarGroup({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "sidebar-group",
      "data-sidebar": "group",
      className: cn("relative flex w-full min-w-0 flex-col p-2", className),
      ...props
    }
  );
}
function SidebarGroupContent({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "sidebar-group-content",
      "data-sidebar": "group-content",
      className: cn("w-full text-sm", className),
      ...props
    }
  );
}
function SelectionPanel() {
  const { graph, selectedNodes, visibleNodes, toggleSelectedNode, clearSelection, selectAllVisible } = useGraph();
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const items = reactExports.useMemo(() => {
    if (!graph || selectedNodes.size === 0) return [];
    return [...selectedNodes].filter((id) => graph.hasNode(id)).map((id) => {
      const attrs = graph.getNodeAttributes(id);
      return { id, label: attrs.label, imageUrl: attrs.imageUrl };
    });
  }, [graph, selectedNodes]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(SidebarHeader, { className: "border-b border-sidebar-border", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: toggleSidebar,
            className: "text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(PanelRightClose, { className: "size-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sidebar-foreground/60 text-xs font-mono", children: [
          items.length,
          " selected"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        visibleNodes && visibleNodes.size > selectedNodes.size && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: selectAllVisible,
            className: "text-sidebar-foreground/40 hover:text-sidebar-foreground/80 text-xs font-mono transition-colors",
            children: "Select visible"
          }
        ),
        items.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              clearSelection();
              void navigate({
                from: "/user/$username",
                search: (prev) => ({ ...prev, artists: void 0 }),
                replace: true
              });
            },
            className: "text-sidebar-foreground/40 hover:text-sidebar-foreground/80 text-xs font-mono transition-colors",
            children: "Clear all"
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SidebarContent, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SidebarGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SidebarGroupContent, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1", children: items.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent group",
        children: [
          item.imageUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: item.imageUrl,
              alt: "",
              className: "w-6 h-6 rounded object-cover shrink-0"
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-6 h-6 rounded bg-sidebar-foreground/10 shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sidebar-foreground/80 text-[11px] font-mono truncate flex-1 min-w-0", children: item.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => toggleSelectedNode(item.id),
              className: "text-sidebar-foreground/20 hover:text-sidebar-foreground/60 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 12 })
            }
          )
        ]
      },
      item.id
    )) }) }) }) })
  ] });
}
function SidebarToggle() {
  const { toggleSidebar } = useSidebar();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      className: "px-3 py-1.5 text-sm bg-neutral-800 dark:bg-white text-white dark:text-black",
      onClick: toggleSidebar,
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(PanelRight, { className: "size-4" })
    }
  );
}
function RightSidebar() {
  const { open } = useSidebar();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed top-0 right-0 h-screen z-20 overflow-hidden transition-[width] duration-200 ease-linear bg-sidebar text-sidebar-foreground",
      style: { width: open ? "16rem" : "0" },
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-64 h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectionPanel, {}) })
    }
  );
}
function useContainerSize(ref) {
  const [size, setSize] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
function MusicGraph() {
  const { state, error, layout } = useGraph();
  const [isDark, setIsDark] = reactExports.useState(true);
  const [sigmaRuntime, setSigmaRuntime] = reactExports.useState(null);
  const mainRef = reactExports.useRef(null);
  useContainerSize(mainRef);
  reactExports.useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);
  reactExports.useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") return;
    void Promise.all([
      import("../_libs/react-sigma__core.mjs"),
      import("../_libs/sigma.mjs").then(function(n) {
        return n.a;
      }),
      import("./Graph-QklLfi8X.mjs")
    ]).then(([sigmaCore, sigmaRendering, graphModule]) => {
      if (cancelled) return;
      setSigmaRuntime({
        SigmaContainer: sigmaCore.SigmaContainer,
        Graph: graphModule.Graph,
        EdgeArrowProgram: sigmaRendering.EdgeArrowProgram,
        NodePointProgram: sigmaRendering.NodePointProgram
      });
    }).catch((err) => {
      console.error("Failed to load sigma runtime", err);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (state === "loading") return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center", children: "Loading graph…" });
  if (state === "building") return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center", children: "Building your graph…" });
  if (state === "error") return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center", children: [
    "Error: ",
    error
  ] });
  if (!sigmaRuntime) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center", children: "Loading renderer…" });
  const { SigmaContainer, Graph: Graph2, EdgeArrowProgram, NodePointProgram } = sigmaRuntime;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(SidebarProvider, { defaultOpen: false, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "bg-white dark:bg-black text-black dark:text-white min-h-screen", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-4 left-4 z-10 flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DatePicker, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SearchBar, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ArtistFilter, {})
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DepthSliders, {})
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-4 right-4 z-10 flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "px-3 py-1.5  text-sm bg-neutral-800 dark:bg-white text-white dark:text-black",
            onClick: () => setIsDark(!isDark),
            children: isDark ? /* @__PURE__ */ jsxRuntimeExports.jsx(Sun, { className: "size-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Moon, { className: "size-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SidebarToggle, {})
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SigmaContainer,
        {
          style: { height: "100vh", width: "100vw", backgroundColor: "transparent" },
          settings: {
            labelRenderedSizeThreshold: 0,
            maxCameraRatio: 4,
            minCameraRatio: 0.1,
            defaultNodeType: "point",
            defaultEdgeType: "arrow",
            nodeProgramClasses: { point: NodePointProgram },
            edgeProgramClasses: { arrow: EdgeArrowProgram },
            defaultDrawNodeHover: () => {
            },
            labelColor: { color: isDark ? "#ffffff" : "#000000" }
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Graph2, { layout, isDark })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(RightSidebar, {})
  ] });
}
const SplitComponent = () => /* @__PURE__ */ jsxRuntimeExports.jsx(GraphLayout, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(MusicGraph, {}) });
const user_$username = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  component: SplitComponent
}, Symbol.toStringTag, { value: "Module" }));
export {
  user_$username as a,
  useGraph as u
};
