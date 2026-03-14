import { t, r as reactExports } from "./react.mjs";
import { G as Graph } from "./graphology.mjs";
import { s as sigma_cjsExports } from "./sigma.mjs";
import "events";
import "./graphology-utils.mjs";
const d = reactExports.createContext(null), f = d.Provider;
function h() {
  const e = reactExports.useContext(d);
  if (null == e) throw new Error("No context provided: useSigmaContext() can only be used in a descendant of <SigmaContainer>");
  return e;
}
function v() {
  return h().sigma;
}
function p() {
  const { sigma: e } = h();
  return reactExports.useCallback(((t2) => {
    e && Object.keys(t2).forEach(((n) => {
      e.setSetting(n, t2[n]);
    }));
  }), [e]);
}
function w(e) {
  return new Set(Object.keys(e));
}
const b = w({ clickNode: true, rightClickNode: true, downNode: true, enterNode: true, leaveNode: true, doubleClickNode: true, wheelNode: true, clickEdge: true, rightClickEdge: true, downEdge: true, enterEdge: true, leaveEdge: true, doubleClickEdge: true, wheelEdge: true, clickStage: true, rightClickStage: true, downStage: true, doubleClickStage: true, wheelStage: true, beforeRender: true, afterRender: true, kill: true, upStage: true, upEdge: true, upNode: true, enterStage: true, leaveStage: true, resize: true, afterClear: true, afterProcess: true, beforeClear: true, beforeProcess: true, moveBody: true }), E = w({ click: true, rightClick: true, doubleClick: true, mouseup: true, mousedown: true, mousemove: true, mousemovebody: true, mouseleave: true, mouseenter: true, wheel: true }), _ = w({ touchup: true, touchdown: true, touchmove: true, touchmovebody: true, tap: true, doubletap: true }), O = w({ updated: true });
function y() {
  const e = v(), t2 = p(), [n, r] = reactExports.useState({});
  return reactExports.useEffect((() => {
    if (!e || !n) return;
    const t3 = n, r2 = Object.keys(t3);
    return r2.forEach(((n2) => {
      const r3 = t3[n2];
      b.has(n2) && e.on(n2, r3), E.has(n2) && e.getMouseCaptor().on(n2, r3), _.has(n2) && e.getTouchCaptor().on(n2, r3), O.has(n2) && e.getCamera().on(n2, r3);
    })), () => {
      e && r2.forEach(((n2) => {
        const r3 = t3[n2];
        b.has(n2) && e.off(n2, r3), E.has(n2) && e.getMouseCaptor().off(n2, r3), _.has(n2) && e.getTouchCaptor().off(n2, r3), O.has(n2) && e.getCamera().off(n2, r3);
      }));
    };
  }), [e, n, t2]), r;
}
function C() {
  const e = v();
  return reactExports.useCallback(((t2, n = true) => {
    e && t2 && (n && e.getGraph().order > 0 && e.getGraph().clear(), e.getGraph().import(t2), e.refresh());
  }), [e]);
}
function j(e, t2) {
  if (e === t2) return true;
  if ("object" == typeof e && null != e && "object" == typeof t2 && null != t2) {
    if (Object.keys(e).length != Object.keys(t2).length) return false;
    for (const n in e) {
      if (!Object.hasOwn(t2, n)) return false;
      if (!j(e[n], t2[n])) return false;
    }
    return true;
  }
  return false;
}
function x(e, t2) {
  let n;
  return (r) => new Promise(((a) => {
    n && clearTimeout(n), n = setTimeout((() => {
      a(e(r));
    }), t2);
  }));
}
function N(e) {
  const t2 = v(), [n, r] = reactExports.useState(e || {});
  reactExports.useEffect((() => {
    r(((t3) => j(t3, e || {}) ? t3 : e || {}));
  }), [e]);
  const s = reactExports.useCallback(((e2) => {
    t2.getCamera().animatedZoom(Object.assign(Object.assign({}, n), e2));
  }), [t2, n]), l = reactExports.useCallback(((e2) => {
    t2.getCamera().animatedUnzoom(Object.assign(Object.assign({}, n), e2));
  }), [t2, n]), i = reactExports.useCallback(((e2) => {
    t2.getCamera().animatedReset(Object.assign(Object.assign({}, n), e2));
  }), [t2, n]), u = reactExports.useCallback(((e2, r2) => {
    t2.getCamera().animate(e2, Object.assign(Object.assign({}, n), r2));
  }), [t2, n]), m = reactExports.useCallback(((e2, r2) => {
    const a = t2.getNodeDisplayData(e2);
    a ? t2.getCamera().animate(a, Object.assign(Object.assign({}, n), r2)) : console.warn(`Node ${e2} not found`);
  }), [t2, n]);
  return { zoomIn: s, zoomOut: l, reset: i, goto: u, gotoNode: m };
}
function k(e) {
  const t2 = h(), [n, r] = reactExports.useState(false), [s, l] = reactExports.useState(e || t2.container), i = reactExports.useCallback((() => r(((e2) => !e2))), []);
  reactExports.useEffect((() => (document.addEventListener("fullscreenchange", i), () => document.removeEventListener("fullscreenchange", i))), [i]), reactExports.useEffect((() => {
    l(e || t2.container);
  }), [e, t2.container]);
  return { toggle: reactExports.useCallback((() => {
    var e2;
    e2 = s, document.fullscreenElement !== e2 ? e2.requestFullscreen() : document.exitFullscreen && document.exitFullscreen();
  }), [s]), isFullScreen: n };
}
const S = reactExports.forwardRef((({ graph: e, id: n, className: r, style: a, settings: s = {}, children: d2 }, h2) => {
  const v2 = reactExports.useRef(null), p2 = reactExports.useRef(null), w2 = { className: `react-sigma ${r || ""}`, id: n, style: a }, [b2, E2] = reactExports.useState(null), [_2, O2] = reactExports.useState(s);
  reactExports.useEffect((() => {
    O2(((e2) => j(e2, s) ? e2 : s));
  }), [s]), reactExports.useEffect((() => {
    let t2 = null;
    if (null !== p2.current) {
      let n2 = new Graph();
      e && (n2 = "function" == typeof e ? new e() : e), t2 = new sigma_cjsExports.Sigma(n2, p2.current, _2), E2(((e2) => {
        let n3 = null;
        return e2 && (n3 = e2.getCamera().getState()), n3 && t2.getCamera().setState(n3), t2;
      }));
    }
    return () => {
      t2 && t2.kill();
    };
  }), [p2, e, _2]), reactExports.useImperativeHandle(h2, (() => b2), [b2]);
  const y2 = reactExports.useMemo((() => b2 && v2.current ? { sigma: b2, container: v2.current } : null), [b2, v2]), C2 = null !== y2 ? t.createElement(f, { value: y2 }, d2) : null;
  return t.createElement("div", Object.assign({}, w2, { ref: v2 }), t.createElement("div", { className: "sigma-container", ref: p2 }), C2);
}));
const H = ({ id: e, className: n, style: r, children: a, position: c = "bottom-left" }) => {
  const o = { className: `react-sigma-controls ${n || ""} ${c}`, id: e, style: r };
  return t.createElement("div", Object.assign({}, o), a);
};
var M;
function P() {
  return P = Object.assign ? Object.assign.bind() : function(e) {
    for (var t2 = 1; t2 < arguments.length; t2++) {
      var n = arguments[t2];
      for (var r in n) ({}).hasOwnProperty.call(n, r) && (e[r] = n[r]);
    }
    return e;
  }, P.apply(null, arguments);
}
var z, V = function(t2) {
  return reactExports.createElement("svg", P({ xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", className: "dot-circle-regular_svg__svg-inline--fa dot-circle-regular_svg__fa-dot-circle dot-circle-regular_svg__fa-w-16", "data-icon": "dot-circle", "data-prefix": "far", viewBox: "0 0 512 512", width: "1em", height: "1em" }, t2), M || (M = reactExports.createElement("path", { fill: "currentColor", d: "M256 56c110.532 0 200 89.451 200 200 0 110.532-89.451 200-200 200-110.532 0-200-89.451-200-200 0-110.532 89.451-200 200-200m0-48C119.033 8 8 119.033 8 256s111.033 248 248 248 248-111.033 248-248S392.967 8 256 8m0 168c-44.183 0-80 35.817-80 80s35.817 80 80 80 80-35.817 80-80-35.817-80-80-80" })));
};
function B() {
  return B = Object.assign ? Object.assign.bind() : function(e) {
    for (var t2 = 1; t2 < arguments.length; t2++) {
      var n = arguments[t2];
      for (var r in n) ({}).hasOwnProperty.call(n, r) && (e[r] = n[r]);
    }
    return e;
  }, B.apply(null, arguments);
}
var F, $ = function(t2) {
  return reactExports.createElement("svg", B({ xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", className: "minus-solid_svg__svg-inline--fa minus-solid_svg__fa-minus minus-solid_svg__fa-w-14", "data-icon": "minus", "data-prefix": "fas", viewBox: "0 0 448 512", width: "1em", height: "1em" }, t2), z || (z = reactExports.createElement("path", { fill: "currentColor", d: "M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32" })));
};
function I() {
  return I = Object.assign ? Object.assign.bind() : function(e) {
    for (var t2 = 1; t2 < arguments.length; t2++) {
      var n = arguments[t2];
      for (var r in n) ({}).hasOwnProperty.call(n, r) && (e[r] = n[r]);
    }
    return e;
  }, I.apply(null, arguments);
}
var T = function(t2) {
  return reactExports.createElement("svg", I({ xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", className: "plus-solid_svg__svg-inline--fa plus-solid_svg__fa-plus plus-solid_svg__fa-w-14", "data-icon": "plus", "data-prefix": "fas", viewBox: "0 0 448 512", width: "1em", height: "1em" }, t2), F || (F = reactExports.createElement("path", { fill: "currentColor", d: "M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32" })));
};
const D = ({ className: e, style: n, animationDuration: r = 200, children: a, labels: c = {} }) => {
  const { zoomIn: o, zoomOut: s, reset: l } = N({ duration: r, factor: 1.5 }), i = { style: n, className: `react-sigma-control ${e || ""}` };
  return t.createElement(t.Fragment, null, t.createElement("div", Object.assign({}, i), t.createElement("button", { onClick: () => o(), title: c.zoomIn || "Zoom In" }, a ? a[0] : t.createElement(T, { style: { width: "1em" } }))), t.createElement("div", Object.assign({}, i), t.createElement("button", { onClick: () => s(), title: c.zoomOut || "Zoom Out" }, a ? a[1] : t.createElement($, { style: { width: "1em" } }))), t.createElement("div", Object.assign({}, i), t.createElement("button", { onClick: () => l(), title: c.reset || "See whole graph" }, a ? a[2] : t.createElement(V, { style: { width: "1em" } }))));
};
var G;
function R() {
  return R = Object.assign ? Object.assign.bind() : function(e) {
    for (var t2 = 1; t2 < arguments.length; t2++) {
      var n = arguments[t2];
      for (var r in n) ({}).hasOwnProperty.call(n, r) && (e[r] = n[r]);
    }
    return e;
  }, R.apply(null, arguments);
}
var Z, L = function(t2) {
  return reactExports.createElement("svg", R({ xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", className: "compress-solid_svg__svg-inline--fa compress-solid_svg__fa-compress compress-solid_svg__fa-w-14", "data-icon": "compress", "data-prefix": "fas", viewBox: "0 0 448 512", width: "1em", height: "1em" }, t2), G || (G = reactExports.createElement("path", { fill: "currentColor", d: "M436 192H312c-13.3 0-24-10.7-24-24V44c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v84h84c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12m-276-24V44c0-6.6-5.4-12-12-12h-40c-6.6 0-12 5.4-12 12v84H12c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12h124c13.3 0 24-10.7 24-24m0 300V344c0-13.3-10.7-24-24-24H12c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12h84v84c0 6.6 5.4 12 12 12h40c6.6 0 12-5.4 12-12m192 0v-84h84c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12H312c-13.3 0-24 10.7-24 24v124c0 6.6 5.4 12 12 12h40c6.6 0 12-5.4 12-12" })));
};
function q() {
  return q = Object.assign ? Object.assign.bind() : function(e) {
    for (var t2 = 1; t2 < arguments.length; t2++) {
      var n = arguments[t2];
      for (var r in n) ({}).hasOwnProperty.call(n, r) && (e[r] = n[r]);
    }
    return e;
  }, q.apply(null, arguments);
}
var U = function(t2) {
  return reactExports.createElement("svg", q({ xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", className: "expand-solid_svg__svg-inline--fa expand-solid_svg__fa-expand expand-solid_svg__fa-w-14", "data-icon": "expand", "data-prefix": "fas", viewBox: "0 0 448 512", width: "1em", height: "1em" }, t2), Z || (Z = reactExports.createElement("path", { fill: "currentColor", d: "M0 180V56c0-13.3 10.7-24 24-24h124c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H64v84c0 6.6-5.4 12-12 12H12c-6.6 0-12-5.4-12-12M288 44v40c0 6.6 5.4 12 12 12h84v84c0 6.6 5.4 12 12 12h40c6.6 0 12-5.4 12-12V56c0-13.3-10.7-24-24-24H300c-6.6 0-12 5.4-12 12m148 276h-40c-6.6 0-12 5.4-12 12v84h-84c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12h124c13.3 0 24-10.7 24-24V332c0-6.6-5.4-12-12-12M160 468v-40c0-6.6-5.4-12-12-12H64v-84c0-6.6-5.4-12-12-12H12c-6.6 0-12 5.4-12 12v124c0 13.3 10.7 24 24 24h124c6.6 0 12-5.4 12-12" })));
};
const A = ({ id: e, className: n, style: r, container: a, children: c, labels: o = {} }) => {
  const { isFullScreen: s, toggle: l } = k(null == a ? void 0 : a.current), i = { className: `react-sigma-control ${n || ""}`, id: e, style: r };
  return document.fullscreenEnabled ? t.createElement("div", Object.assign({}, i), t.createElement("button", { onClick: l, title: s ? o.exit || "Exit fullscreen" : o.enter || "Enter fullscreen" }, c && !s && c[0], c && s && c[1], !c && !s && t.createElement(U, { style: { width: "1em" } }), !c && s && t.createElement(L, { style: { width: "1em" } }))) : null;
};
export {
  H as ControlsContainer,
  A as FullScreenControl,
  S as SigmaContainer,
  d as SigmaContext,
  f as SigmaProvider,
  D as ZoomControl,
  x as debounce,
  j as isEqual,
  N as useCamera,
  k as useFullScreen,
  C as useLoadGraph,
  y as useRegisterEvents,
  p as useSetSettings,
  v as useSigma,
  h as useSigmaContext
};
