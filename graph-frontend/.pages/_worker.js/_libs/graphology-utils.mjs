var isGraph;
var hasRequiredIsGraph;
function requireIsGraph() {
  if (hasRequiredIsGraph) return isGraph;
  hasRequiredIsGraph = 1;
  isGraph = function isGraph2(value) {
    return value !== null && typeof value === "object" && typeof value.addUndirectedEdgeWithKey === "function" && typeof value.dropNode === "function" && typeof value.multi === "boolean";
  };
  return isGraph;
}
export {
  requireIsGraph as r
};
