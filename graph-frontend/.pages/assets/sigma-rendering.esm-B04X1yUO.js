import{D as B,_ as A,a as y,c as W,b as k,d as b,f as z,N as X,F as Y,E as L,e as D,g as N}from"./index-236c62ad.esm-DAaW5_Mr.js";import{A as Ae,h as ye,i as ze,j as De,k as Ne,l as Le,m as Oe,n as xe,o as ke,P as Ge,p as Pe,q as Ue,r as we,s as Fe,t as He,u as Me,v as Ie,w as $e,x as Ve,y as Be,z as We,B as Xe,C as Ye}from"./index-236c62ad.esm-DAaW5_Mr.js";var K=`
precision mediump float;

varying vec4 v_color;
varying float v_border;

const float radius = 0.5;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  vec2 m = gl_PointCoord - vec2(0.5, 0.5);
  float dist = radius - length(m);

  // No antialiasing for picking mode:
  #ifdef PICKING_MODE
  if (dist > v_border)
    gl_FragColor = v_color;
  else
    gl_FragColor = transparent;

  #else
  float t = 0.0;
  if (dist > v_border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / v_border;

  gl_FragColor = mix(transparent, v_color, t);
  #endif
}
`,q=K,j=`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;

uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform mat3 u_matrix;

varying vec4 v_color;
varying float v_border;

const float bias = 255.0 / 254.0;

void main() {
  gl_Position = vec4(
    (u_matrix * vec3(a_position, 1)).xy,
    0,
    1
  );

  // Multiply the point size twice:
  //  - x SCALING_RATIO to correct the canvas scaling
  //  - x 2 to correct the formulae
  gl_PointSize = a_size / u_sizeRatio * u_pixelRatio * 2.0;

  v_border = (0.5 / a_size) * u_sizeRatio;

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`,J=j,H=WebGLRenderingContext,G=H.UNSIGNED_BYTE,P=H.FLOAT,Q=["u_sizeRatio","u_pixelRatio","u_matrix"],de=(function(l){function t(){return D(this,t),N(this,t,arguments)}return A(t,l),y(t,[{key:"getDefinition",value:function(){return{VERTICES:1,VERTEX_SHADER_SOURCE:J,FRAGMENT_SHADER_SOURCE:q,METHOD:WebGLRenderingContext.POINTS,UNIFORMS:Q,ATTRIBUTES:[{name:"a_position",size:2,type:P},{name:"a_size",size:1,type:P},{name:"a_color",size:4,type:G,normalized:!0},{name:"a_id",size:4,type:G,normalized:!0}]}}},{key:"processVisibleItem",value:function(r,e,i){var o=this.array;o[e++]=i.x,o[e++]=i.y,o[e++]=i.size,o[e++]=z(i.color),o[e++]=r}},{key:"setUniforms",value:function(r,e){var i=r.sizeRatio,o=r.pixelRatio,a=r.matrix,n=e.gl,s=e.uniformLocations,u=s.u_sizeRatio,_=s.u_pixelRatio,c=s.u_matrix;n.uniform1f(_,o),n.uniform1f(u,i),n.uniformMatrix3fv(c,!1,a)}}])})(X),Z=`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;
attribute float a_sourceRadius;
attribute float a_targetRadius;
attribute float a_sourceRadiusCoef;
attribute float a_targetRadiusCoef;

uniform mat3 u_matrix;
uniform float u_zoomRatio;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_lengthToThicknessRatio;
uniform float u_feather;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const float bias = 255.0 / 254.0;

void main() {
  float minThickness = u_minEdgeThickness;

  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;

  // These first computations are taken from edge.vert.glsl. Please read it to
  // get better comments on what's happening:
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Here, we move the point to leave space for the arrow heads:
  // Source arrow head
  float sourceRadius = a_sourceRadius * a_sourceRadiusCoef;
  float sourceDirection = sign(sourceRadius);
  float webGLSourceRadius = sourceDirection * sourceRadius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLSourceArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;
  vec2 sourceCompensationVector =
    vec2(-sourceDirection * unitNormal.y, sourceDirection * unitNormal.x)
    * (webGLSourceRadius + webGLSourceArrowHeadLength);
    
  // Target arrow head
  float targetRadius = a_targetRadius * a_targetRadiusCoef;
  float targetDirection = sign(targetRadius);
  float webGLTargetRadius = targetDirection * targetRadius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLTargetArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;
  vec2 targetCompensationVector =
  vec2(-targetDirection * unitNormal.y, targetDirection * unitNormal.x)
    * (webGLTargetRadius + webGLTargetArrowHeadLength);

  // Here is the proper position of the vertex
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness + sourceCompensationVector + targetCompensationVector, 1)).xy, 0, 1);

  v_thickness = webGLThickness / u_zoomRatio;

  v_normal = unitNormal;

  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`,ee=Z,M=WebGLRenderingContext,U=M.UNSIGNED_BYTE,E=M.FLOAT,oe=["u_matrix","u_zoomRatio","u_sizeRatio","u_correctionRatio","u_pixelRatio","u_feather","u_minEdgeThickness","u_lengthToThicknessRatio"],ne={lengthToThicknessRatio:B.lengthToThicknessRatio};function I(l){var t=b(b({},ne),l||{});return(function(f){function r(){return D(this,r),N(this,r,arguments)}return A(r,f),y(r,[{key:"getDefinition",value:function(){return{VERTICES:6,VERTEX_SHADER_SOURCE:ee,FRAGMENT_SHADER_SOURCE:Y,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:oe,ATTRIBUTES:[{name:"a_positionStart",size:2,type:E},{name:"a_positionEnd",size:2,type:E},{name:"a_normal",size:2,type:E},{name:"a_color",size:4,type:U,normalized:!0},{name:"a_id",size:4,type:U,normalized:!0},{name:"a_sourceRadius",size:1,type:E},{name:"a_targetRadius",size:1,type:E}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:E},{name:"a_normalCoef",size:1,type:E},{name:"a_sourceRadiusCoef",size:1,type:E},{name:"a_targetRadiusCoef",size:1,type:E}],CONSTANT_DATA:[[0,1,-1,0],[0,-1,1,0],[1,1,0,1],[1,1,0,1],[0,-1,1,0],[1,-1,0,-1]]}}},{key:"processVisibleItem",value:function(i,o,a,n,s){var u=s.size||1,_=a.x,c=a.y,g=n.x,d=n.y,T=z(s.color),m=g-_,h=d-c,C=a.size||1,v=n.size||1,p=m*m+h*h,O=0,x=0;p&&(p=1/Math.sqrt(p),O=-h*p*u,x=m*p*u);var R=this.array;R[o++]=_,R[o++]=c,R[o++]=g,R[o++]=d,R[o++]=O,R[o++]=x,R[o++]=T,R[o++]=i,R[o++]=C,R[o++]=v}},{key:"setUniforms",value:function(i,o){var a=o.gl,n=o.uniformLocations,s=n.u_matrix,u=n.u_zoomRatio,_=n.u_feather,c=n.u_pixelRatio,g=n.u_correctionRatio,d=n.u_sizeRatio,T=n.u_minEdgeThickness,m=n.u_lengthToThicknessRatio;a.uniformMatrix3fv(s,!1,i.matrix),a.uniform1f(u,i.zoomRatio),a.uniform1f(d,i.sizeRatio),a.uniform1f(g,i.correctionRatio),a.uniform1f(c,i.pixelRatio),a.uniform1f(_,i.antiAliasingFeather),a.uniform1f(T,i.minEdgeThickness),a.uniform1f(m,t.lengthToThicknessRatio)}}])})(L)}var ie=I(),Te=ie;function ae(l){return W([I(l),k(l),k(b(b({},l),{},{extremity:"source"}))])}var re=ae(),he=re,te=`
precision mediump float;

varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`,se=te,ue=`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;

uniform mat3 u_matrix;

varying vec4 v_color;

const float bias = 255.0 / 254.0;

void main() {
  // Scale from [[-1 1] [-1 1]] to the container:
  gl_Position = vec4(
    (u_matrix * vec3(a_position, 1)).xy,
    0,
    1
  );

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`,le=ue,$=WebGLRenderingContext,w=$.UNSIGNED_BYTE,_e=$.FLOAT,ce=["u_matrix"],pe=(function(l){function t(){return D(this,t),N(this,t,arguments)}return A(t,l),y(t,[{key:"getDefinition",value:function(){return{VERTICES:2,VERTEX_SHADER_SOURCE:le,FRAGMENT_SHADER_SOURCE:se,METHOD:WebGLRenderingContext.LINES,UNIFORMS:ce,ATTRIBUTES:[{name:"a_position",size:2,type:_e},{name:"a_color",size:4,type:w,normalized:!0},{name:"a_id",size:4,type:w,normalized:!0}]}}},{key:"processVisibleItem",value:function(r,e,i,o,a){var n=this.array,s=i.x,u=i.y,_=o.x,c=o.y,g=z(a.color);n[e++]=s,n[e++]=u,n[e++]=g,n[e++]=r,n[e++]=_,n[e++]=c,n[e++]=g,n[e++]=r}},{key:"setUniforms",value:function(r,e){var i=e.gl,o=e.uniformLocations,a=o.u_matrix;i.uniformMatrix3fv(a,!1,r.matrix)}}])})(L),me=`
precision mediump float;

varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`,fe=me,ve=`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;

const float minThickness = 1.7;
const float bias = 255.0 / 254.0;

void main() {
  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  // The only different here with edge.vert.glsl is that we need to handle null
  // input normal vector. Apart from that, you can read edge.vert.glsl more info
  // on how it works:
  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;
  if (normalLength <= 0.0) unitNormal = normal;
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`,Re=ve,V=WebGLRenderingContext,F=V.UNSIGNED_BYTE,S=V.FLOAT,ge=["u_matrix","u_sizeRatio","u_correctionRatio","u_minEdgeThickness"],Se=(function(l){function t(){return D(this,t),N(this,t,arguments)}return A(t,l),y(t,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Re,FRAGMENT_SHADER_SOURCE:fe,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:ge,ATTRIBUTES:[{name:"a_positionStart",size:2,type:S},{name:"a_positionEnd",size:2,type:S},{name:"a_normal",size:2,type:S},{name:"a_color",size:4,type:F,normalized:!0},{name:"a_id",size:4,type:F,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:S},{name:"a_normalCoef",size:1,type:S}],CONSTANT_DATA:[[0,1],[0,-1],[1,0]]}}},{key:"processVisibleItem",value:function(r,e,i,o,a){var n=a.size||1,s=i.x,u=i.y,_=o.x,c=o.y,g=z(a.color),d=_-s,T=c-u,m=d*d+T*T,h=0,C=0;m&&(m=1/Math.sqrt(m),h=-T*m*n,C=d*m*n);var v=this.array;v[e++]=s,v[e++]=u,v[e++]=_,v[e++]=c,v[e++]=h,v[e++]=C,v[e++]=g,v[e++]=r}},{key:"setUniforms",value:function(r,e){var i=e.gl,o=e.uniformLocations,a=o.u_matrix,n=o.u_sizeRatio,s=o.u_correctionRatio,u=o.u_minEdgeThickness;i.uniformMatrix3fv(a,!1,r.matrix),i.uniform1f(n,r.sizeRatio),i.uniform1f(s,r.correctionRatio),i.uniform1f(u,r.minEdgeThickness)}}])})(L);export{Ae as AbstractEdgeProgram,ye as AbstractNodeProgram,ze as AbstractProgram,B as DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS,De as DEFAULT_EDGE_CLAMPED_PROGRAM_OPTIONS,ne as DEFAULT_EDGE_DOUBLE_CLAMPED_PROGRAM_OPTIONS,Ne as EdgeArrowHeadProgram,Le as EdgeArrowProgram,Oe as EdgeClampedProgram,he as EdgeDoubleArrowProgram,Te as EdgeDoubleClampedProgram,pe as EdgeLineProgram,L as EdgeProgram,xe as EdgeRectangleProgram,Se as EdgeTriangleProgram,ke as NodeCircleProgram,de as NodePointProgram,X as NodeProgram,Ge as Program,k as createEdgeArrowHeadProgram,Pe as createEdgeArrowProgram,Ue as createEdgeClampedProgram,W as createEdgeCompoundProgram,ae as createEdgeDoubleArrowProgram,I as createEdgeDoubleClampedProgram,we as createNodeCompoundProgram,Fe as drawDiscNodeHover,He as drawDiscNodeLabel,Me as drawStraightEdgeLabel,Ie as getAttributeItemsCount,$e as getAttributesItemsCount,Ve as killProgram,Be as loadFragmentShader,We as loadProgram,Xe as loadVertexShader,Ye as numberToGLSLFloat};
