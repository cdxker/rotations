function Ee(e,r){if(typeof e!="object"||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var t=n.call(e,r);if(typeof t!="object")return t;throw new TypeError("@@toPrimitive must return a primitive value.")}return(r==="string"?String:Number)(e)}function re(e){var r=Ee(e,"string");return typeof r=="symbol"?r:r+""}function y(e,r){if(!(e instanceof r))throw new TypeError("Cannot call a class as a function")}function $(e,r){for(var n=0;n<r.length;n++){var t=r[n];t.enumerable=t.enumerable||!1,t.configurable=!0,"value"in t&&(t.writable=!0),Object.defineProperty(e,re(t.key),t)}}function p(e,r,n){return r&&$(e.prototype,r),n&&$(e,n),Object.defineProperty(e,"prototype",{writable:!1}),e}function O(e){return O=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(r){return r.__proto__||Object.getPrototypeOf(r)},O(e)}function ne(){try{var e=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch{}return(ne=function(){return!!e})()}function Te(e){if(e===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}function Re(e,r){if(r&&(typeof r=="object"||typeof r=="function"))return r;if(r!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return Te(e)}function C(e,r,n){return r=O(r),Re(e,ne()?Reflect.construct(r,n||[],O(e).constructor):r.apply(e,n))}function H(e,r){return H=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(n,t){return n.__proto__=t,n},H(e,r)}function w(e,r){if(typeof r!="function"&&r!==null)throw new TypeError("Super expression must either be null or a function");e.prototype=Object.create(r&&r.prototype,{constructor:{value:e,writable:!0,configurable:!0}}),Object.defineProperty(e,"prototype",{writable:!1}),r&&H(e,r)}function be(e){if(Array.isArray(e))return e}function Ae(e,r){var n=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(n!=null){var t,i,o,a,s=[],l=!0,u=!1;try{if(o=(n=n.call(e)).next,r===0){if(Object(n)!==n)return;l=!1}else for(;!(l=(t=o.call(n)).done)&&(s.push(t.value),s.length!==r);l=!0);}catch(c){u=!0,i=c}finally{try{if(!l&&n.return!=null&&(a=n.return(),Object(a)!==a))return}finally{if(u)throw i}}return s}}function Y(e,r){(r==null||r>e.length)&&(r=e.length);for(var n=0,t=Array(r);n<r;n++)t[n]=e[n];return t}function ye(e,r){if(e){if(typeof e=="string")return Y(e,r);var n={}.toString.call(e).slice(8,-1);return n==="Object"&&e.constructor&&(n=e.constructor.name),n==="Map"||n==="Set"?Array.from(e):n==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?Y(e,r):void 0}}function pe(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Fe(e,r){return be(e)||Ae(e,r)||ye(e,r)||pe()}var G={black:"#000000",silver:"#C0C0C0",gray:"#808080",grey:"#808080",white:"#FFFFFF",maroon:"#800000",red:"#FF0000",purple:"#800080",fuchsia:"#FF00FF",green:"#008000",lime:"#00FF00",olive:"#808000",yellow:"#FFFF00",navy:"#000080",blue:"#0000FF",teal:"#008080",aqua:"#00FFFF",darkblue:"#00008B",mediumblue:"#0000CD",darkgreen:"#006400",darkcyan:"#008B8B",deepskyblue:"#00BFFF",darkturquoise:"#00CED1",mediumspringgreen:"#00FA9A",springgreen:"#00FF7F",cyan:"#00FFFF",midnightblue:"#191970",dodgerblue:"#1E90FF",lightseagreen:"#20B2AA",forestgreen:"#228B22",seagreen:"#2E8B57",darkslategray:"#2F4F4F",darkslategrey:"#2F4F4F",limegreen:"#32CD32",mediumseagreen:"#3CB371",turquoise:"#40E0D0",royalblue:"#4169E1",steelblue:"#4682B4",darkslateblue:"#483D8B",mediumturquoise:"#48D1CC",indigo:"#4B0082",darkolivegreen:"#556B2F",cadetblue:"#5F9EA0",cornflowerblue:"#6495ED",rebeccapurple:"#663399",mediumaquamarine:"#66CDAA",dimgray:"#696969",dimgrey:"#696969",slateblue:"#6A5ACD",olivedrab:"#6B8E23",slategray:"#708090",slategrey:"#708090",lightslategray:"#778899",lightslategrey:"#778899",mediumslateblue:"#7B68EE",lawngreen:"#7CFC00",chartreuse:"#7FFF00",aquamarine:"#7FFFD4",skyblue:"#87CEEB",lightskyblue:"#87CEFA",blueviolet:"#8A2BE2",darkred:"#8B0000",darkmagenta:"#8B008B",saddlebrown:"#8B4513",darkseagreen:"#8FBC8F",lightgreen:"#90EE90",mediumpurple:"#9370DB",darkviolet:"#9400D3",palegreen:"#98FB98",darkorchid:"#9932CC",yellowgreen:"#9ACD32",sienna:"#A0522D",brown:"#A52A2A",darkgray:"#A9A9A9",darkgrey:"#A9A9A9",lightblue:"#ADD8E6",greenyellow:"#ADFF2F",paleturquoise:"#AFEEEE",lightsteelblue:"#B0C4DE",powderblue:"#B0E0E6",firebrick:"#B22222",darkgoldenrod:"#B8860B",mediumorchid:"#BA55D3",rosybrown:"#BC8F8F",darkkhaki:"#BDB76B",mediumvioletred:"#C71585",indianred:"#CD5C5C",peru:"#CD853F",chocolate:"#D2691E",tan:"#D2B48C",lightgray:"#D3D3D3",lightgrey:"#D3D3D3",thistle:"#D8BFD8",orchid:"#DA70D6",goldenrod:"#DAA520",palevioletred:"#DB7093",crimson:"#DC143C",gainsboro:"#DCDCDC",plum:"#DDA0DD",burlywood:"#DEB887",lightcyan:"#E0FFFF",lavender:"#E6E6FA",darksalmon:"#E9967A",violet:"#EE82EE",palegoldenrod:"#EEE8AA",lightcoral:"#F08080",khaki:"#F0E68C",aliceblue:"#F0F8FF",honeydew:"#F0FFF0",azure:"#F0FFFF",sandybrown:"#F4A460",wheat:"#F5DEB3",beige:"#F5F5DC",whitesmoke:"#F5F5F5",mintcream:"#F5FFFA",ghostwhite:"#F8F8FF",salmon:"#FA8072",antiquewhite:"#FAEBD7",linen:"#FAF0E6",lightgoldenrodyellow:"#FAFAD2",oldlace:"#FDF5E6",magenta:"#FF00FF",deeppink:"#FF1493",orangered:"#FF4500",tomato:"#FF6347",hotpink:"#FF69B4",coral:"#FF7F50",darkorange:"#FF8C00",lightsalmon:"#FFA07A",orange:"#FFA500",lightpink:"#FFB6C1",pink:"#FFC0CB",gold:"#FFD700",peachpuff:"#FFDAB9",navajowhite:"#FFDEAD",moccasin:"#FFE4B5",bisque:"#FFE4C4",mistyrose:"#FFE4E1",blanchedalmond:"#FFEBCD",papayawhip:"#FFEFD5",lavenderblush:"#FFF0F5",seashell:"#FFF5EE",cornsilk:"#FFF8DC",lemonchiffon:"#FFFACD",floralwhite:"#FFFAF0",snow:"#FFFAFA",lightyellow:"#FFFFE0",ivory:"#FFFFF0"},ie=new Int8Array(4),U=new Int32Array(ie.buffer,0,1),Se=new Float32Array(ie.buffer,0,1),Ce=/^\s*rgba?\s*\(/,we=/^\s*rgba?\s*\(\s*([0-9]*)\s*,\s*([0-9]*)\s*,\s*([0-9]*)(?:\s*,\s*(.*)?)?\)\s*$/;function ke(e){var r=0,n=0,t=0,i=1;if(e[0]==="#")e.length===4?(r=parseInt(e.charAt(1)+e.charAt(1),16),n=parseInt(e.charAt(2)+e.charAt(2),16),t=parseInt(e.charAt(3)+e.charAt(3),16)):(r=parseInt(e.charAt(1)+e.charAt(2),16),n=parseInt(e.charAt(3)+e.charAt(4),16),t=parseInt(e.charAt(5)+e.charAt(6),16)),e.length===9&&(i=parseInt(e.charAt(7)+e.charAt(8),16)/255);else if(Ce.test(e)){var o=e.match(we);o&&(r=+o[1],n=+o[2],t=+o[3],o[4]&&(i=+o[4]))}return{r,g:n,b:t,a:i}}var N={};for(var I in G)N[I]=P(G[I]),N[G[I]]=N[I];function te(e,r,n,t,i){return U[0]=t<<24|n<<16|r<<8|e,U[0]=U[0]&4278190079,Se[0]}function P(e){if(e=e.toLowerCase(),typeof N[e]<"u")return N[e];var r=ke(e),n=r.r,t=r.g,i=r.b,o=r.a;o=o*255|0;var a=te(n,t,i,o);return N[e]=a,a}var z={};function oe(e){if(typeof z[e]<"u")return z[e];var r=(e&16711680)>>>16,n=(e&65280)>>>8,t=e&255,i=255,o=te(r,n,t,i);return z[e]=o,o}function sr(e,r,n,t){return n+(r<<8)+(e<<16)}function lr(e,r,n,t,i,o){var a=Math.floor(n/o*i),s=Math.floor(e.drawingBufferHeight/o-t/o*i),l=new Uint8Array(4);e.bindFramebuffer(e.FRAMEBUFFER,r),e.readPixels(a,s,1,1,e.RGBA,e.UNSIGNED_BYTE,l);var u=Fe(l,4),c=u[0],h=u[1],_=u[2],d=u[3];return[c,h,_,d]}function R(e,r,n){return(r=re(r))in e?Object.defineProperty(e,r,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[r]=n,e}function X(e,r){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var t=Object.getOwnPropertySymbols(e);r&&(t=t.filter(function(i){return Object.getOwnPropertyDescriptor(e,i).enumerable})),n.push.apply(n,t)}return n}function D(e){for(var r=1;r<arguments.length;r++){var n=arguments[r]!=null?arguments[r]:{};r%2?X(Object(n),!0).forEach(function(t){R(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):X(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function Ne(e,r){for(;!{}.hasOwnProperty.call(e,r)&&(e=O(e))!==null;);return e}function V(){return V=typeof Reflect<"u"&&Reflect.get?Reflect.get.bind():function(e,r,n){var t=Ne(e,r);if(t){var i=Object.getOwnPropertyDescriptor(t,r);return i.get?i.get.call(arguments.length<3?e:n):i.value}},V.apply(null,arguments)}function ae(e,r,n,t){var i=V(O(e.prototype),r,n);return typeof i=="function"?function(o){return i.apply(n,o)}:i}function Oe(e){return e.normalized?1:e.size}function x(e){var r=0;return e.forEach(function(n){return r+=Oe(n)}),r}function se(e,r,n){var t=e==="VERTEX"?r.VERTEX_SHADER:r.FRAGMENT_SHADER,i=r.createShader(t);if(i===null)throw new Error("loadShader: error while creating the shader");r.shaderSource(i,n),r.compileShader(i);var o=r.getShaderParameter(i,r.COMPILE_STATUS);if(!o){var a=r.getShaderInfoLog(i);throw r.deleteShader(i),new Error(`loadShader: error while compiling the shader:
`.concat(a,`
`).concat(n))}return i}function De(e,r){return se("VERTEX",e,r)}function Le(e,r){return se("FRAGMENT",e,r)}function Pe(e,r){var n=e.createProgram();if(n===null)throw new Error("loadProgram: error while creating the program.");var t,i;for(t=0,i=r.length;t<i;t++)e.attachShader(n,r[t]);e.linkProgram(n);var o=e.getProgramParameter(n,e.LINK_STATUS);if(!o)throw e.deleteProgram(n),new Error("loadProgram: error while linking the program.");return n}function q(e){var r=e.gl,n=e.buffer,t=e.program,i=e.vertexShader,o=e.fragmentShader;r.deleteShader(i),r.deleteShader(o),r.deleteProgram(t),r.deleteBuffer(n)}function ur(e){return e%1===0?e.toFixed(1):e.toString()}var K=`#define PICKING_MODE
`,Ie=R(R(R(R(R(R(R(R({},WebGL2RenderingContext.BOOL,1),WebGL2RenderingContext.BYTE,1),WebGL2RenderingContext.UNSIGNED_BYTE,1),WebGL2RenderingContext.SHORT,2),WebGL2RenderingContext.UNSIGNED_SHORT,2),WebGL2RenderingContext.INT,4),WebGL2RenderingContext.UNSIGNED_INT,4),WebGL2RenderingContext.FLOAT,4),le=p(function e(r,n,t){y(this,e)}),ue=(function(){function e(r,n,t){y(this,e),R(this,"array",new Float32Array),R(this,"constantArray",new Float32Array),R(this,"capacity",0),R(this,"verticesCount",0);var i=this.getDefinition();if(this.VERTICES=i.VERTICES,this.VERTEX_SHADER_SOURCE=i.VERTEX_SHADER_SOURCE,this.FRAGMENT_SHADER_SOURCE=i.FRAGMENT_SHADER_SOURCE,this.UNIFORMS=i.UNIFORMS,this.ATTRIBUTES=i.ATTRIBUTES,this.METHOD=i.METHOD,this.CONSTANT_ATTRIBUTES="CONSTANT_ATTRIBUTES"in i?i.CONSTANT_ATTRIBUTES:[],this.CONSTANT_DATA="CONSTANT_DATA"in i?i.CONSTANT_DATA:[],this.isInstanced="CONSTANT_ATTRIBUTES"in i,this.ATTRIBUTES_ITEMS_COUNT=x(this.ATTRIBUTES),this.STRIDE=this.VERTICES*this.ATTRIBUTES_ITEMS_COUNT,this.renderer=t,this.normalProgram=this.getProgramInfo("normal",r,i.VERTEX_SHADER_SOURCE,i.FRAGMENT_SHADER_SOURCE,null),this.pickProgram=n?this.getProgramInfo("pick",r,K+i.VERTEX_SHADER_SOURCE,K+i.FRAGMENT_SHADER_SOURCE,n):null,this.isInstanced){var o=x(this.CONSTANT_ATTRIBUTES);if(this.CONSTANT_DATA.length!==this.VERTICES)throw new Error("Program: error while getting constant data (expected ".concat(this.VERTICES," items, received ").concat(this.CONSTANT_DATA.length," instead)"));this.constantArray=new Float32Array(this.CONSTANT_DATA.length*o);for(var a=0;a<this.CONSTANT_DATA.length;a++){var s=this.CONSTANT_DATA[a];if(s.length!==o)throw new Error("Program: error while getting constant data (one vector has ".concat(s.length," items instead of ").concat(o,")"));for(var l=0;l<s.length;l++)this.constantArray[a*o+l]=s[l]}this.STRIDE=this.ATTRIBUTES_ITEMS_COUNT}}return p(e,[{key:"kill",value:function(){q(this.normalProgram),this.pickProgram&&(q(this.pickProgram),this.pickProgram=null)}},{key:"getProgramInfo",value:function(n,t,i,o,a){var s=this.getDefinition(),l=t.createBuffer();if(l===null)throw new Error("Program: error while creating the WebGL buffer.");var u=De(t,i),c=Le(t,o),h=Pe(t,[u,c]),_={};s.UNIFORMS.forEach(function(m){var E=t.getUniformLocation(h,m);E&&(_[m]=E)});var d={};s.ATTRIBUTES.forEach(function(m){d[m.name]=t.getAttribLocation(h,m.name)});var v;if("CONSTANT_ATTRIBUTES"in s&&(s.CONSTANT_ATTRIBUTES.forEach(function(m){d[m.name]=t.getAttribLocation(h,m.name)}),v=t.createBuffer(),v===null))throw new Error("Program: error while creating the WebGL constant buffer.");return{name:n,program:h,gl:t,frameBuffer:a,buffer:l,constantBuffer:v||{},uniformLocations:_,attributeLocations:d,isPicking:n==="pick",vertexShader:u,fragmentShader:c}}},{key:"bindProgram",value:function(n){var t=this,i=0,o=n.gl,a=n.buffer;this.isInstanced?(o.bindBuffer(o.ARRAY_BUFFER,n.constantBuffer),i=0,this.CONSTANT_ATTRIBUTES.forEach(function(s){return i+=t.bindAttribute(s,n,i,!1)}),o.bufferData(o.ARRAY_BUFFER,this.constantArray,o.STATIC_DRAW),o.bindBuffer(o.ARRAY_BUFFER,n.buffer),i=0,this.ATTRIBUTES.forEach(function(s){return i+=t.bindAttribute(s,n,i,!0)}),o.bufferData(o.ARRAY_BUFFER,this.array,o.DYNAMIC_DRAW)):(o.bindBuffer(o.ARRAY_BUFFER,a),i=0,this.ATTRIBUTES.forEach(function(s){return i+=t.bindAttribute(s,n,i)}),o.bufferData(o.ARRAY_BUFFER,this.array,o.DYNAMIC_DRAW)),o.bindBuffer(o.ARRAY_BUFFER,null)}},{key:"unbindProgram",value:function(n){var t=this;this.isInstanced?(this.CONSTANT_ATTRIBUTES.forEach(function(i){return t.unbindAttribute(i,n,!1)}),this.ATTRIBUTES.forEach(function(i){return t.unbindAttribute(i,n,!0)})):this.ATTRIBUTES.forEach(function(i){return t.unbindAttribute(i,n)})}},{key:"bindAttribute",value:function(n,t,i,o){var a=Ie[n.type];if(typeof a!="number")throw new Error('Program.bind: yet unsupported attribute type "'.concat(n.type,'"'));var s=t.attributeLocations[n.name],l=t.gl;if(s!==-1){l.enableVertexAttribArray(s);var u=this.isInstanced?(o?this.ATTRIBUTES_ITEMS_COUNT:x(this.CONSTANT_ATTRIBUTES))*Float32Array.BYTES_PER_ELEMENT:this.ATTRIBUTES_ITEMS_COUNT*Float32Array.BYTES_PER_ELEMENT;if(l.vertexAttribPointer(s,n.size,n.type,n.normalized||!1,u,i),this.isInstanced&&o)if(l instanceof WebGL2RenderingContext)l.vertexAttribDivisor(s,1);else{var c=l.getExtension("ANGLE_instanced_arrays");c&&c.vertexAttribDivisorANGLE(s,1)}}return n.size*a}},{key:"unbindAttribute",value:function(n,t,i){var o=t.attributeLocations[n.name],a=t.gl;if(o!==-1&&(a.disableVertexAttribArray(o),this.isInstanced&&i))if(a instanceof WebGL2RenderingContext)a.vertexAttribDivisor(o,0);else{var s=a.getExtension("ANGLE_instanced_arrays");s&&s.vertexAttribDivisorANGLE(o,0)}}},{key:"reallocate",value:function(n){n!==this.capacity&&(this.capacity=n,this.verticesCount=this.VERTICES*n,this.array=new Float32Array(this.isInstanced?this.capacity*this.ATTRIBUTES_ITEMS_COUNT:this.verticesCount*this.ATTRIBUTES_ITEMS_COUNT))}},{key:"hasNothingToRender",value:function(){return this.verticesCount===0}},{key:"renderProgram",value:function(n,t){var i=t.gl,o=t.program;i.enable(i.BLEND),i.useProgram(o),this.setUniforms(n,t),this.drawWebGL(this.METHOD,t)}},{key:"render",value:function(n){this.hasNothingToRender()||(this.pickProgram&&(this.pickProgram.gl.viewport(0,0,n.width*n.pixelRatio/n.downSizingRatio,n.height*n.pixelRatio/n.downSizingRatio),this.bindProgram(this.pickProgram),this.renderProgram(D(D({},n),{},{pixelRatio:n.pixelRatio/n.downSizingRatio}),this.pickProgram),this.unbindProgram(this.pickProgram)),this.normalProgram.gl.viewport(0,0,n.width*n.pixelRatio,n.height*n.pixelRatio),this.bindProgram(this.normalProgram),this.renderProgram(n,this.normalProgram),this.unbindProgram(this.normalProgram))}},{key:"drawWebGL",value:function(n,t){var i=t.gl,o=t.frameBuffer;if(i.bindFramebuffer(i.FRAMEBUFFER,o),!this.isInstanced)i.drawArrays(n,0,this.verticesCount);else if(i instanceof WebGL2RenderingContext)i.drawArraysInstanced(n,0,this.VERTICES,this.capacity);else{var a=i.getExtension("ANGLE_instanced_arrays");a&&a.drawArraysInstancedANGLE(n,0,this.VERTICES,this.capacity)}}}])})(),cr=(function(e){function r(){return y(this,r),C(this,r,arguments)}return w(r,e),p(r)})(le),Be=(function(e){function r(){return y(this,r),C(this,r,arguments)}return w(r,e),p(r,[{key:"kill",value:function(){ae(r,"kill",this)([])}},{key:"process",value:function(t,i,o){var a=i*this.STRIDE;if(o.hidden){for(var s=a+this.STRIDE;a<s;a++)this.array[a]=0;return}return this.processVisibleItem(oe(t),a,o)}}])})(ue);function fr(e,r,n){return(function(){function t(i,o,a){y(this,t),R(this,"drawLabel",r),R(this,"drawHover",n),this.programs=e.map(function(s){return new s(i,o,a)})}return p(t,[{key:"reallocate",value:function(o){this.programs.forEach(function(a){return a.reallocate(o)})}},{key:"process",value:function(o,a,s){this.programs.forEach(function(l){return l.process(o,a,s)})}},{key:"render",value:function(o){this.programs.forEach(function(a){return a.render(o)})}},{key:"kill",value:function(){this.programs.forEach(function(o){return o.kill()})}}])})()}var hr=(function(e){function r(){return y(this,r),C(this,r,arguments)}return w(r,e),p(r)})(le),W=(function(e){function r(){var n;y(this,r);for(var t=arguments.length,i=new Array(t),o=0;o<t;o++)i[o]=arguments[o];return n=C(this,r,[].concat(i)),R(n,"drawLabel",void 0),n}return w(r,e),p(r,[{key:"kill",value:function(){ae(r,"kill",this)([])}},{key:"process",value:function(t,i,o,a,s){var l=i*this.STRIDE;if(s.hidden||o.hidden||a.hidden){for(var u=l+this.STRIDE;l<u;l++)this.array[l]=0;return}return this.processVisibleItem(oe(t),l,o,a,s)}}])})(ue);function Ge(e,r){return(function(){function n(t,i,o){y(this,n),R(this,"drawLabel",r),this.programs=e.map(function(a){return new a(t,i,o)})}return p(n,[{key:"reallocate",value:function(i){this.programs.forEach(function(o){return o.reallocate(i)})}},{key:"process",value:function(i,o,a,s,l){this.programs.forEach(function(u){return u.process(i,o,a,s,l)})}},{key:"render",value:function(i){this.programs.forEach(function(o){return o.render(i)})}},{key:"kill",value:function(){this.programs.forEach(function(i){return i.kill()})}}])})()}function _r(e,r,n,t,i){var o=i.edgeLabelSize,a=i.edgeLabelFont,s=i.edgeLabelWeight,l=i.edgeLabelColor.attribute?r[i.edgeLabelColor.attribute]||i.edgeLabelColor.color||"#000":i.edgeLabelColor.color,u=r.label;if(u){e.fillStyle=l,e.font="".concat(s," ").concat(o,"px ").concat(a);var c=n.size,h=t.size,_=n.x,d=n.y,v=t.x,m=t.y,E=(_+v)/2,F=(d+m)/2,T=v-_,f=m-d,g=Math.sqrt(T*T+f*f);if(!(g<c+h)){_+=T*c/g,d+=f*c/g,v-=T*h/g,m-=f*h/g,E=(_+v)/2,F=(d+m)/2,T=v-_,f=m-d,g=Math.sqrt(T*T+f*f);var S=e.measureText(u).width;if(S>g){var b="…";for(u=u+b,S=e.measureText(u).width;S>g&&u.length>1;)u=u.slice(0,-2)+b,S=e.measureText(u).width;if(u.length<4)return}var A;T>0?f>0?A=Math.acos(T/g):A=Math.asin(f/g):f>0?A=Math.acos(T/g)+Math.PI:A=Math.asin(T/g)+Math.PI/2,e.save(),e.translate(E,F),e.rotate(A),e.fillText(u,-S/2,r.size/2+o),e.restore()}}}function Ue(e,r,n){if(r.label){var t=n.labelSize,i=n.labelFont,o=n.labelWeight,a=n.labelColor.attribute?r[n.labelColor.attribute]||n.labelColor.color||"#000":n.labelColor.color;e.fillStyle=a,e.font="".concat(o," ").concat(t,"px ").concat(i),e.fillText(r.label,r.x+r.size+3,r.y+t/3)}}function mr(e,r,n){var t=n.labelSize,i=n.labelFont,o=n.labelWeight;e.font="".concat(o," ").concat(t,"px ").concat(i),e.fillStyle="#FFF",e.shadowOffsetX=0,e.shadowOffsetY=0,e.shadowBlur=8,e.shadowColor="#000";var a=2;if(typeof r.label=="string"){var s=e.measureText(r.label).width,l=Math.round(s+5),u=Math.round(t+2*a),c=Math.max(r.size,t/2)+a,h=Math.asin(u/2/c),_=Math.sqrt(Math.abs(Math.pow(c,2)-Math.pow(u/2,2)));e.beginPath(),e.moveTo(r.x+_,r.y+u/2),e.lineTo(r.x+c+l,r.y+u/2),e.lineTo(r.x+c+l,r.y-u/2),e.lineTo(r.x+_,r.y-u/2),e.arc(r.x,r.y,c,h,-h),e.closePath(),e.fill()}else e.beginPath(),e.arc(r.x,r.y,r.size+a,0,Math.PI*2),e.closePath(),e.fill();e.shadowOffsetX=0,e.shadowOffsetY=0,e.shadowBlur=0,Ue(e,r,n)}var ze=`
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = length(v_diffVector) - v_radius + border;

  // No antialiasing for picking mode:
  #ifdef PICKING_MODE
  if (dist > border)
    gl_FragColor = transparent;
  else
    gl_FragColor = v_color;

  #else
  float t = 0.0;
  if (dist > border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / border;

  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`,xe=ze,Me=`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_diffVector = diffVector;
  v_radius = size / 2.0;

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`,He=Me,ce=WebGLRenderingContext,J=ce.UNSIGNED_BYTE,M=ce.FLOAT,Ve=["u_sizeRatio","u_correctionRatio","u_matrix"],j=(function(e){function r(){return y(this,r),C(this,r,arguments)}return w(r,e),p(r,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:He,FRAGMENT_SHADER_SOURCE:xe,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Ve,ATTRIBUTES:[{name:"a_position",size:2,type:M},{name:"a_size",size:1,type:M},{name:"a_color",size:4,type:J,normalized:!0},{name:"a_id",size:4,type:J,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_angle",size:1,type:M}],CONSTANT_DATA:[[r.ANGLE_1],[r.ANGLE_2],[r.ANGLE_3]]}}},{key:"processVisibleItem",value:function(t,i,o){var a=this.array,s=P(o.color);a[i++]=o.x,a[i++]=o.y,a[i++]=o.size,a[i++]=s,a[i++]=t}},{key:"setUniforms",value:function(t,i){var o=i.gl,a=i.uniformLocations,s=a.u_sizeRatio,l=a.u_correctionRatio,u=a.u_matrix;o.uniform1f(l,t.correctionRatio),o.uniform1f(s,t.sizeRatio),o.uniformMatrix3fv(u,!1,t.matrix)}}])})(Be);R(j,"ANGLE_1",0);R(j,"ANGLE_2",2*Math.PI/3);R(j,"ANGLE_3",4*Math.PI/3);var We=`
precision mediump float;

varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`,je=We,$e=`
attribute vec2 a_position;
attribute vec2 a_normal;
attribute float a_radius;
attribute vec3 a_barycentric;

#ifdef PICKING_MODE
attribute vec4 a_id;
#else
attribute vec4 a_color;
#endif

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_lengthToThicknessRatio;
uniform float u_widenessToThicknessRatio;

varying vec4 v_color;

const float bias = 255.0 / 254.0;

void main() {
  float minThickness = u_minEdgeThickness;

  float normalLength = length(a_normal);
  vec2 unitNormal = a_normal / normalLength;

  // These first computations are taken from edge.vert.glsl and
  // edge.clamped.vert.glsl. Please read it to get better comments on what's
  // happening:
  float pixelsThickness = max(normalLength / u_sizeRatio, minThickness);
  float webGLThickness = pixelsThickness * u_correctionRatio;
  float webGLNodeRadius = a_radius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;
  float webGLArrowHeadThickness = webGLThickness * u_widenessToThicknessRatio;

  float da = a_barycentric.x;
  float db = a_barycentric.y;
  float dc = a_barycentric.z;

  vec2 delta = vec2(
      da * (webGLNodeRadius * unitNormal.y)
    + db * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y + webGLArrowHeadThickness * unitNormal.x)
    + dc * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y - webGLArrowHeadThickness * unitNormal.x),

      da * (-webGLNodeRadius * unitNormal.x)
    + db * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x + webGLArrowHeadThickness * unitNormal.y)
    + dc * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x - webGLArrowHeadThickness * unitNormal.y)
  );

  vec2 position = (u_matrix * vec3(a_position + delta, 1)).xy;

  gl_Position = vec4(position, 0, 1);

  #ifdef PICKING_MODE
  // For picking mode, we use the ID as the color:
  v_color = a_id;
  #else
  // For normal mode, we use the color:
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`,Ye=$e,fe=WebGLRenderingContext,Z=fe.UNSIGNED_BYTE,B=fe.FLOAT,Xe=["u_matrix","u_sizeRatio","u_correctionRatio","u_minEdgeThickness","u_lengthToThicknessRatio","u_widenessToThicknessRatio"],he={extremity:"target",lengthToThicknessRatio:2.5,widenessToThicknessRatio:2};function _e(e){var r=D(D({},he),e||{});return(function(n){function t(){return y(this,t),C(this,t,arguments)}return w(t,n),p(t,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Ye,FRAGMENT_SHADER_SOURCE:je,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Xe,ATTRIBUTES:[{name:"a_position",size:2,type:B},{name:"a_normal",size:2,type:B},{name:"a_radius",size:1,type:B},{name:"a_color",size:4,type:Z,normalized:!0},{name:"a_id",size:4,type:Z,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_barycentric",size:3,type:B}],CONSTANT_DATA:[[1,0,0],[0,1,0],[0,0,1]]}}},{key:"processVisibleItem",value:function(o,a,s,l,u){if(r.extremity==="source"){var c=[l,s];s=c[0],l=c[1]}var h=u.size||1,_=l.size||1,d=s.x,v=s.y,m=l.x,E=l.y,F=P(u.color),T=m-d,f=E-v,g=T*T+f*f,S=0,b=0;g&&(g=1/Math.sqrt(g),S=-f*g*h,b=T*g*h);var A=this.array;A[a++]=m,A[a++]=E,A[a++]=-S,A[a++]=-b,A[a++]=_,A[a++]=F,A[a++]=o}},{key:"setUniforms",value:function(o,a){var s=a.gl,l=a.uniformLocations,u=l.u_matrix,c=l.u_sizeRatio,h=l.u_correctionRatio,_=l.u_minEdgeThickness,d=l.u_lengthToThicknessRatio,v=l.u_widenessToThicknessRatio;s.uniformMatrix3fv(u,!1,o.matrix),s.uniform1f(c,o.sizeRatio),s.uniform1f(h,o.correctionRatio),s.uniform1f(_,o.minEdgeThickness),s.uniform1f(d,r.lengthToThicknessRatio),s.uniform1f(v,r.widenessToThicknessRatio)}}])})(W)}var qe=_e(),dr=qe,Ke=`
precision mediump float;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  // We only handle antialiasing for normal mode:
  #ifdef PICKING_MODE
  gl_FragColor = v_color;
  #else
  float dist = length(v_normal) * v_thickness;

  float t = smoothstep(
    v_thickness - v_feather,
    v_thickness,
    dist
  );

  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`,me=Ke,Je=`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;
attribute float a_radius;
attribute float a_radiusCoef;

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

  float radius = a_radius * a_radiusCoef;
  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;

  // These first computations are taken from edge.vert.glsl. Please read it to
  // get better comments on what's happening:
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Here, we move the point to leave space for the arrow head:
  float direction = sign(radius);
  float webGLNodeRadius = direction * radius * 2.0 * u_correctionRatio / u_sizeRatio;
  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;

  vec2 compensationVector = vec2(-direction * unitNormal.y, direction * unitNormal.x) * (webGLNodeRadius + webGLArrowHeadLength);

  // Here is the proper position of the vertex
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness + compensationVector, 1)).xy, 0, 1);

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
`,Ze=Je,de=WebGLRenderingContext,Q=de.UNSIGNED_BYTE,k=de.FLOAT,Qe=["u_matrix","u_zoomRatio","u_sizeRatio","u_correctionRatio","u_pixelRatio","u_feather","u_minEdgeThickness","u_lengthToThicknessRatio"],er={lengthToThicknessRatio:he.lengthToThicknessRatio};function ve(e){var r=D(D({},er),e||{});return(function(n){function t(){return y(this,t),C(this,t,arguments)}return w(t,n),p(t,[{key:"getDefinition",value:function(){return{VERTICES:6,VERTEX_SHADER_SOURCE:Ze,FRAGMENT_SHADER_SOURCE:me,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Qe,ATTRIBUTES:[{name:"a_positionStart",size:2,type:k},{name:"a_positionEnd",size:2,type:k},{name:"a_normal",size:2,type:k},{name:"a_color",size:4,type:Q,normalized:!0},{name:"a_id",size:4,type:Q,normalized:!0},{name:"a_radius",size:1,type:k}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:k},{name:"a_normalCoef",size:1,type:k},{name:"a_radiusCoef",size:1,type:k}],CONSTANT_DATA:[[0,1,0],[0,-1,0],[1,1,1],[1,1,1],[0,-1,0],[1,-1,-1]]}}},{key:"processVisibleItem",value:function(o,a,s,l,u){var c=u.size||1,h=s.x,_=s.y,d=l.x,v=l.y,m=P(u.color),E=d-h,F=v-_,T=l.size||1,f=E*E+F*F,g=0,S=0;f&&(f=1/Math.sqrt(f),g=-F*f*c,S=E*f*c);var b=this.array;b[a++]=h,b[a++]=_,b[a++]=d,b[a++]=v,b[a++]=g,b[a++]=S,b[a++]=m,b[a++]=o,b[a++]=T}},{key:"setUniforms",value:function(o,a){var s=a.gl,l=a.uniformLocations,u=l.u_matrix,c=l.u_zoomRatio,h=l.u_feather,_=l.u_pixelRatio,d=l.u_correctionRatio,v=l.u_sizeRatio,m=l.u_minEdgeThickness,E=l.u_lengthToThicknessRatio;s.uniformMatrix3fv(u,!1,o.matrix),s.uniform1f(c,o.zoomRatio),s.uniform1f(v,o.sizeRatio),s.uniform1f(d,o.correctionRatio),s.uniform1f(_,o.pixelRatio),s.uniform1f(h,o.antiAliasingFeather),s.uniform1f(m,o.minEdgeThickness),s.uniform1f(E,r.lengthToThicknessRatio)}}])})(W)}var rr=ve(),vr=rr;function nr(e){return Ge([ve(e),_e(e)])}var ir=nr(),gr=ir,tr=`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
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

  // We require edges to be at least "minThickness" pixels thick *on screen*
  // (so we need to compensate the size ratio):
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);

  // Then, we need to retrieve the normalized thickness of the edge in the WebGL
  // referential (in a ([0, 1], [0, 1]) space), using our "magic" correction
  // ratio:
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Here is the proper position of the vertex
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);

  // For the fragment shader though, we need a thickness that takes the "magic"
  // correction ratio into account (as in webGLThickness), but so that the
  // antialiasing effect does not depend on the zoom level. So here's yet
  // another thickness version:
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
`,or=tr,ge=WebGLRenderingContext,ee=ge.UNSIGNED_BYTE,L=ge.FLOAT,ar=["u_matrix","u_zoomRatio","u_sizeRatio","u_correctionRatio","u_pixelRatio","u_feather","u_minEdgeThickness"],Er=(function(e){function r(){return y(this,r),C(this,r,arguments)}return w(r,e),p(r,[{key:"getDefinition",value:function(){return{VERTICES:6,VERTEX_SHADER_SOURCE:or,FRAGMENT_SHADER_SOURCE:me,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:ar,ATTRIBUTES:[{name:"a_positionStart",size:2,type:L},{name:"a_positionEnd",size:2,type:L},{name:"a_normal",size:2,type:L},{name:"a_color",size:4,type:ee,normalized:!0},{name:"a_id",size:4,type:ee,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:L},{name:"a_normalCoef",size:1,type:L}],CONSTANT_DATA:[[0,1],[0,-1],[1,1],[1,1],[0,-1],[1,-1]]}}},{key:"processVisibleItem",value:function(t,i,o,a,s){var l=s.size||1,u=o.x,c=o.y,h=a.x,_=a.y,d=P(s.color),v=h-u,m=_-c,E=v*v+m*m,F=0,T=0;E&&(E=1/Math.sqrt(E),F=-m*E*l,T=v*E*l);var f=this.array;f[i++]=u,f[i++]=c,f[i++]=h,f[i++]=_,f[i++]=F,f[i++]=T,f[i++]=d,f[i++]=t}},{key:"setUniforms",value:function(t,i){var o=i.gl,a=i.uniformLocations,s=a.u_matrix,l=a.u_zoomRatio,u=a.u_feather,c=a.u_pixelRatio,h=a.u_correctionRatio,_=a.u_sizeRatio,d=a.u_minEdgeThickness;o.uniformMatrix3fv(s,!1,t.matrix),o.uniform1f(l,t.zoomRatio),o.uniform1f(_,t.sizeRatio),o.uniform1f(h,t.correctionRatio),o.uniform1f(c,t.pixelRatio),o.uniform1f(u,t.antiAliasingFeather),o.uniform1f(d,t.minEdgeThickness)}}])})(W);export{hr as A,De as B,ur as C,he as D,W as E,me as F,Fe as G,R as H,re as I,lr as J,sr as K,ye as L,Y as M,Be as N,ue as P,w as _,p as a,_e as b,Ge as c,D as d,y as e,P as f,C as g,cr as h,le as i,er as j,dr as k,gr as l,vr as m,Er as n,j as o,nr as p,ve as q,fr as r,mr as s,Ue as t,_r as u,Oe as v,x as w,q as x,Le as y,Pe as z};
