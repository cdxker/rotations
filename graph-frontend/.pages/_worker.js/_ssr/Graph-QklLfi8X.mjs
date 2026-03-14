import { r as reactExports } from "../_libs/react.mjs";
import { useLoadGraph as C, useSigma as v } from "../_libs/react-sigma__core.mjs";
import { u as useGraph } from "./user._username-CxFOcS5Y.mjs";
import "../_libs/graphology.mjs";
import "events";
import "../_libs/sigma.mjs";
import "../_libs/graphology-utils.mjs";
import "../_libs/tanstack__react-router.mjs";
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
import "../_libs/tanstack__react-query.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/lucide-react.mjs";
import "../_libs/react-day-picker.mjs";
import "../_libs/date-fns.mjs";
import "../_libs/date-fns__tz.mjs";
import "../_libs/base-ui__react.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/reselect.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/tabbable.mjs";
import "../_libs/radix-ui__react-tooltip.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/radix-ui__react-popover.mjs";
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
import "../_libs/radix-ui__react-slider.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/radix-ui__react-collection.mjs";
function Graph({ layout, isDark }) {
  const loadGraph = C();
  const sigma = v();
  const { graph, filteredPlayCounts, getNodeMetrics, selectedNodes, visibleNodes, toggleSelectedNode, clearSelection } = useGraph();
  const metricKey = layout === "pagerank" ? "pageRank" : layout === "mds" ? "mdsScore" : "weightedMdsScore";
  reactExports.useEffect(() => {
    const handleClickNode = ({ node }) => {
      toggleSelectedNode(node);
    };
    const handleClickStage = () => {
      clearSelection();
    };
    sigma.on("clickNode", handleClickNode);
    sigma.on("clickStage", handleClickStage);
    return () => {
      sigma.off("clickNode", handleClickNode);
      sigma.off("clickStage", handleClickStage);
    };
  }, [sigma, toggleSelectedNode, clearSelection]);
  reactExports.useEffect(() => {
    if (graph) {
      sigma.refresh();
      loadGraph(graph);
    }
  }, [graph, layout, loadGraph]);
  const maxMetric = reactExports.useMemo(() => {
    if (!graph) return 1;
    let max = 1e-10;
    if (filteredPlayCounts) {
      for (const nodeId of filteredPlayCounts.keys()) {
        const score = getNodeMetrics(nodeId, layout)?.[metricKey] ?? 0;
        if (score > max) max = score;
      }
    } else {
      graph.forEachNode((nodeId) => {
        const score = getNodeMetrics(nodeId, layout)?.[metricKey] ?? 0;
        if (score > max) max = score;
      });
    }
    return max;
  }, [graph, filteredPlayCounts, getNodeMetrics, layout, metricKey]);
  reactExports.useEffect(() => {
    const g = sigma.getGraph();
    const edgeBase = isDark ? (a) => `rgba(68, 68, 68, ${a})` : (a) => `rgba(0, 0, 0, ${a})`;
    sigma.setSetting("labelColor", { color: isDark ? "#ffffff" : "#000000" });
    const isNodeHidden = (node) => {
      if (filteredPlayCounts && !filteredPlayCounts.has(node)) return true;
      if (visibleNodes && !visibleNodes.has(node)) return true;
      return false;
    };
    sigma.setSetting("nodeReducer", (node, data) => {
      if (isNodeHidden(node)) return { ...data, hidden: true };
      const metric = getNodeMetrics(node, layout)?.[metricKey] ?? 0;
      const size = metric > 0 && maxMetric > 0 ? 4 + 16 * Math.log1p(metric) / Math.log1p(maxMetric) : 4;
      const color = selectedNodes.size > 0 ? selectedNodes.has(node) ? "#ffffff" : "#666666" : data.color;
      return { ...data, size, color };
    });
    sigma.setSetting("edgeReducer", (edge, data) => {
      const source = g.source(edge);
      const target = g.target(edge);
      if (isNodeHidden(source) || isNodeHidden(target)) {
        return { ...data, hidden: true };
      }
      const w = data.weight ?? 1;
      return { ...data, color: edgeBase(Math.min(0.6, 0.15 + w * 0.05)) };
    });
    sigma.refresh();
  }, [filteredPlayCounts, visibleNodes, selectedNodes, getNodeMetrics, layout, metricKey, maxMetric, sigma, isDark]);
  return null;
}
export {
  Graph
};
