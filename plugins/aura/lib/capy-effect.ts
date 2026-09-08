import { VERTEX_SHADER, DITHERING_SHADER } from "./capy-shaders.ts";
import { ANIMATED_PHOTO_SHADER } from "./photo-shader.ts";
import type { BackgroundSettings } from "./model.ts";

// Exact masks and shader parameters from capy.ai/new; see THIRD_PARTY_NOTICES.md.
const edgeMask = "radial-gradient(ellipse 150% 135% at 50% 110%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.45) 66%, rgba(0,0,0,1) 92%)";
const composerMask = "radial-gradient(ellipse 780px 520px at 50% 46%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,1) 88%)";
export const CAPY_CSS = `
.aura-capy-layer { position:absolute; inset:0; z-index:-1; pointer-events:none; overflow:hidden; border-radius:inherit; }
.aura-capy-air, .aura-capy-ink, .aura-capy-fade { position:absolute; inset:0; pointer-events:none; }
.aura-capy-air { background:linear-gradient(180deg in oklab, var(--aura-panel, #f9fafc) 0%, var(--background, #fff) 100%); }
.aura-capy-ink { background-position:center; background-repeat:no-repeat; background-size:var(--aura-fit, cover); }
.aura-capy-ink:not([data-image]) { mask-image:${edgeMask},${composerMask}; mask-size:100% 100%,100% 100%; mask-repeat:no-repeat,no-repeat; mask-composite:intersect; -webkit-mask-image:${edgeMask},${composerMask}; -webkit-mask-size:100% 100%,100% 100%; -webkit-mask-repeat:no-repeat,no-repeat; -webkit-mask-composite:source-in; }
.aura-capy-ink canvas { display:block; position:absolute; inset:0; width:100%; height:100%; image-rendering:pixelated; }
.aura-capy-focus { position:absolute; top:46%; left:50%; width:1360px; height:680px; transform:translate(-50%,-50%); }
.aura-capy-focus::after { content:""; position:absolute; inset:160px; border-radius:48px; background:rgba(255,255,255,.88); filter:blur(88px); }
.aura-capy-fade { background:linear-gradient(to bottom,rgba(255,255,255,0) 30%,rgba(255,255,255,.48) 48%,rgba(255,255,255,.86) 66%,#fff 82%); }
.dark .aura-capy-air { display:none; }
.dark .aura-capy-focus::after { background:rgba(0,0,0,.9); }
.dark .aura-capy-fade { background:linear-gradient(to bottom,rgba(0,0,0,0) 12%,rgba(0,0,0,.3) 34%,rgba(0,0,0,.68) 52%,rgba(0,0,0,.92) 70%,#000 88%); }
.aura-capy-focus[data-image] { top:50%; width:min(100%,1080px); height:clamp(280px,42%,480px); }
.aura-capy-focus[data-image]::after { inset:0 60px; border-radius:48px; background:var(--background,#fff); filter:blur(60px); }
`;

export interface CapyEffect { update(settings: BackgroundSettings, image: string | null): void; dispose(): void; }

export function mountCapyEffect(parent: HTMLElement, initial: BackgroundSettings, imageUrl: string | null): CapyEffect {
  const layer = document.createElement("div"); layer.className = "aura-capy-layer"; layer.ariaHidden = "true";
  const air = document.createElement("div"); air.className = "aura-capy-air";
  const ink = document.createElement("div"); ink.className = "aura-capy-ink";
  const focus = document.createElement("div"); focus.className = "aura-capy-focus";
  const fade = document.createElement("div"); fade.className = "aura-capy-fade";
  layer.append(air, ink, focus, fade); parent.prepend(layer);
  let settings = initial;
  let currentImage: string | null | undefined;
  let disposeShader = () => {};
  let stopped = false;
  const theme = new MutationObserver(() => update(settings, currentImage ?? null, true));
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-color-theme", "data-theme"] });
  function update(next: BackgroundSettings, image: string | null, refresh = false): void {
    if (stopped) return;
    const wasEffect = settings.effect;
    const wasEnabled = settings.enabled;
    const wasTint = settings.tint;
    const wasFit = settings.fit;
    settings = next;
    const dark = document.documentElement.classList.contains("dark");
    layer.style.display = settings.enabled ? "" : "none";
    ink.style.opacity = String(image ? settings.imageOpacity : Math.min(1, settings.intensity * (dark ? 1.1 : 1)));
    ink.style.mixBlendMode = image ? "normal" : dark ? "screen" : "multiply";
    ink.style.backgroundSize = settings.fit;
    // Photos dim around the centered composer, never into a white lower half.
    // The original Capy noise-only fade remains unchanged.
    const conversation = parent.id === "thread-detail-timeline-panel";
    fade.style.opacity = conversation || image ? "0" : "1";
    focus.style.opacity = conversation ? "0" : image ? String(settings.fade) : "1";
    if (image) focus.dataset.image = ""; else delete focus.dataset.image;
    if (image) { ink.dataset.image = ""; ink.style.backgroundImage = `url("${image}")`; }
    else { delete ink.dataset.image; ink.style.backgroundImage = "none"; }
    if (image !== currentImage || refresh || wasEffect !== settings.effect || wasEnabled !== settings.enabled || wasTint !== settings.tint || wasFit !== settings.fit) {
      currentImage = image;
      disposeShader(); disposeShader = () => {};
      if (settings.enabled && settings.effect === "pixels") {
        const color = settings.tint === "theme" ? getComputedStyle(parent).getPropertyValue("--primary").trim() || "#5e6ad2" : dark ? "#606acc" : "#5e6ad2";
        disposeShader = mountShader(ink, image, color, settings.fit);
      }
    }
  }
  update(initial, imageUrl);
  return { update, dispose() { if (stopped) return; stopped = true; theme.disconnect(); disposeShader(); layer.remove(); } };
}

function mountShader(parent: HTMLElement, imageUrl: string | null, color: string, fit: BackgroundSettings["fit"]): () => void {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { alpha:true, antialias:false, depth:false, stencil:false, premultipliedAlpha:true, preserveDrawingBuffer:false });
  if (!gl) return () => {}; // Keep the source image/gradient when WebGL is unavailable.
  let disposed = false;
  let frame = 40000;
  let raf = 0;
  let previous: number | null = null;
  let lastDraw = 0;
  let visible = true;
  let lost = false;
  let imageReady = imageUrl === null;
  let image: HTMLImageElement | null = null;
  let texture: WebGLTexture | null = null;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  function releaseGl() {
    if (texture) gl!.deleteTexture(texture);
    if (buffer) gl!.deleteBuffer(buffer);
    if (program) gl!.deleteProgram(program);
    shaders.forEach(shader => gl!.deleteShader(shader));
  }
  try {
    if (!program || !buffer) throw new Error("WebGL allocation failed");
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX_SHADER], [gl.FRAGMENT_SHADER, imageUrl ? ANIMATED_PHOTO_SHADER : DITHERING_SHADER]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Shader allocation failed");
      shaders.push(shader);
      const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
      gl.shaderSource(shader, precision && precision.precision < 23 ? source.replace(/precision mediump float/g, "precision highp float") : source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed");
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const values: Record<string, number> = { u_originX:.5,u_originY:.5,u_worldWidth:0,u_worldHeight:0,u_fit:imageUrl ? (fit === "cover" ? 2 : 1) : 0,u_scale:imageUrl ? 1 : 2,u_rotation:0,u_offsetX:0,u_offsetY:0,u_shape:1,u_type:4,u_pxSize:imageUrl ? 2 : 3,u_colorSteps:4 };
    for (const [key, value] of Object.entries(values)) gl.uniform1f(gl.getUniformLocation(program, key), value);
    const probe = document.createElement("canvas"); probe.width = probe.height = 1;
    const ctx = probe.getContext("2d");
    let rgba = [94/255,106/255,210/255,1];
    if (ctx) { ctx.fillStyle = color; ctx.fillRect(0,0,1,1); rgba = Array.from(ctx.getImageData(0,0,1,1).data).map(v=>v/255); }
    gl.uniform4fv(gl.getUniformLocation(program,"u_colorFront"),rgba);
    gl.uniform4f(gl.getUniformLocation(program,"u_colorBack"),0,0,0,0);
    if (imageUrl) {
      gl.uniform1i(gl.getUniformLocation(program,"u_originalColors"),1);
      gl.uniform1i(gl.getUniformLocation(program,"u_inverted"),0);
      gl.uniform4f(gl.getUniformLocation(program,"u_colorHighlight"),1,1,1,1);
    }
  } catch (error) {
    console.warn("Aura: Capy shader unavailable", error);
    releaseGl(); gl.getExtension("WEBGL_lose_context")?.loseContext(); return () => {};
  }
  parent.append(canvas);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  function draw(): void {
    if (disposed || lost || !imageReady || !canvas.width || !canvas.height) return;
    gl!.useProgram(program);
    gl!.uniform1f(gl!.getUniformLocation(program!,"u_time"),frame * .001);
    gl!.clear(gl!.COLOR_BUFFER_BIT); gl!.drawArrays(gl!.TRIANGLES,0,6);
    if (canvas.dataset.rendered !== "true") canvas.dataset.rendered = "true";
  }
  function tick(now: number) {
    raf = 0;
    if (disposed || lost || document.hidden || !visible || reduced.matches) return;
    if (previous !== null) frame += Math.min(now-previous, 1000/15) * .5;
    previous = now;
    if (now-lastDraw >= 1000/30) { draw(); lastDraw = now; }
    raf = requestAnimationFrame(tick);
  }
  function schedule() {
    cancelAnimationFrame(raf); raf = 0; previous = null;
    if (!disposed && !lost && !document.hidden && visible) {
      draw();
      if (!reduced.matches) raf = requestAnimationFrame(tick);
    }
  }
  function resize() {
    const {width,height} = parent.getBoundingClientRect();
    if (disposed || lost || width <= 0 || height <= 0) return;
    // Match Capy's bounded noise renderer: width*height / (3*3) framebuffer pixels.
    const scale = imageUrl ? Math.min(1/2, Math.sqrt(2073600/(width*height))) : 1/3;
    canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
    gl!.viewport(0,0,canvas.width,canvas.height);
    gl!.useProgram(program);
    gl!.uniform2f(gl!.getUniformLocation(program!,"u_resolution"),canvas.width,canvas.height);
    gl!.uniform1f(gl!.getUniformLocation(program!,"u_pixelRatio"),canvas.width/width);
    draw();
  }
  if (imageUrl) {
    image = new Image();
    image.onload = () => {
      if (disposed || lost || !image) return;
      texture = gl!.createTexture(); gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D,texture);
      gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE); gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR); gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);
      gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,gl!.RGBA,gl!.UNSIGNED_BYTE,image);
      gl!.useProgram(program); gl!.uniform1i(gl!.getUniformLocation(program!,"u_image"),0);
      gl!.uniform1f(gl!.getUniformLocation(program!,"u_imageAspectRatio"),image.naturalWidth/image.naturalHeight);
      imageReady = true; resize();
    };
    image.onerror = () => { canvas.style.visibility = "hidden"; };
    image.src = imageUrl;
  }
  function onLost(event: Event) { event.preventDefault(); lost = true; cancelAnimationFrame(raf); canvas.style.visibility = "hidden"; }
  // A context loss falls back to the original image/gradient. A plugin reload
  // or appearance change retries with a fresh context.
  canvas.addEventListener("webglcontextlost",onLost);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(parent);
  const intersection = new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;schedule();}); intersection.observe(parent);
  document.addEventListener("visibilitychange",schedule); reduced.addEventListener("change",schedule);
  resize(); schedule();
  return () => {
    if (disposed) return; disposed = true; cancelAnimationFrame(raf);
    resizeObserver.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange",schedule); reduced.removeEventListener("change",schedule);
    canvas.removeEventListener("webglcontextlost",onLost);
    if (image) { image.onload = null; image.onerror = null; image.src = ""; }
    releaseGl(); gl!.getExtension("WEBGL_lose_context")?.loseContext(); canvas.remove();
  };
}
