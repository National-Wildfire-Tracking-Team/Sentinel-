/**
 * radarSweepLayer.js
 * Mapbox custom WebGL2 layer that draws one radar sweep (utils/radarSweep.js)
 * as true polar gates. A single quad covers the scan's coverage circle; the
 * fragment shader turns each pixel into (azimuth, ground range) from the
 * station on the sphere and looks up that exact gate with texelFetch, so gate
 * edges follow the beam and the range rings: no north-up pixels, no
 * filtering, no blending between gates.
 *
 * With globe projection or terrain, Mapbox drapes the layer by calling
 * renderToTile once per tile; otherwise render() draws with the camera matrix.
 */

const VERTEX = `#version 300 es
in vec2 a_merc;
uniform mat4 u_matrix;
uniform vec3 u_tile;      // (2^z, x, y) when draping into a tile
uniform float u_tileMode; // 1: tile-local output, 0: camera matrix
out vec2 v_merc;
void main() {
  v_merc = a_merc;
  if (u_tileMode > 0.5) {
    vec2 t = a_merc * u_tile.x - u_tile.yz; // 0..1 across the tile, y down
    gl_Position = vec4(t * 2.0 - 1.0, 0.0, 1.0);
  } else {
    gl_Position = u_matrix * vec4(a_merc, 0.0, 1.0);
  }
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D u_data;    // R8UI: gates × radials
uniform usampler2D u_az;      // R16UI: 3600 × 1, radial index + 1 per 0.1°
uniform sampler2D u_palette;  // RGBA8: 256 × 1
uniform vec2 u_site;          // station lat, lon (radians)
uniform vec3 u_gate;          // gate km, first gate, gate count
in vec2 v_merc;
out vec4 fragColor;
const float PI = 3.141592653589793;
const float EARTH_KM = 6371.0088;
void main() {
  float lon = v_merc.x * 2.0 * PI - PI;
  float lat = 2.0 * atan(exp(PI * (1.0 - 2.0 * v_merc.y))) - 0.5 * PI;
  float dLon = lon - u_site.y;
  float sLat = sin((lat - u_site.x) * 0.5);
  float sLon = sin(dLon * 0.5);
  float a = sLat * sLat + cos(u_site.x) * cos(lat) * sLon * sLon;
  float km = 2.0 * EARTH_KM * asin(sqrt(clamp(a, 0.0, 1.0)));
  int gate = int(floor(km / u_gate.x)) - int(u_gate.y);
  if (gate < 0 || gate >= int(u_gate.z)) discard;

  float az = degrees(atan(sin(dLon) * cos(lat),
                          cos(u_site.x) * sin(lat) - sin(u_site.x) * cos(lat) * cos(dLon)));
  if (az < 0.0) az += 360.0;
  int bucket = int(floor(az * 10.0)) % 3600;
  uint row = texelFetch(u_az, ivec2(bucket, 0), 0).r;
  if (row == 0u) discard;

  uint level = texelFetch(u_data, ivec2(gate, int(row) - 1), 0).r;
  vec4 color = texelFetch(u_palette, ivec2(int(level), 0), 0);
  if (color.a == 0.0) discard;
  fragColor = color; // opaque, so already premultiplied
}`;

const lngToX = (lng) => (lng + 180) / 360;
const latToY = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Radar sweep shader: ${log}`);
  }
  return shader;
}

/**
 * @param {string} id  map layer id
 * @returns {import('mapbox-gl').CustomLayerInterface & { setSweep(sweep: object|null): void }}
 */
export function createRadarSweepLayer(id) {
  let map = null;
  let gl = null;
  let program = null;
  let vao = null;
  let buffer = null;
  let tex = null; // { data, az, palette }
  let loc = null;
  let sweep = null;
  let uploaded = null; // sweep currently in the textures
  let redrape = false;

  function upload() {
    if (uploaded === sweep) return;
    uploaded = sweep;
    if (!sweep) return;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.data);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, sweep.gates, sweep.radialCount, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, sweep.data);
    gl.bindTexture(gl.TEXTURE_2D, tex.az);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, sweep.azIndex.length, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, sweep.azIndex);
    gl.bindTexture(gl.TEXTURE_2D, tex.palette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, sweep.palette);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    const { west, east, north, south } = sweep.bounds;
    const x0 = lngToX(west);
    const x1 = lngToX(east);
    const y0 = latToY(Math.min(north, 85.05));
    const y1 = latToY(Math.max(south, -85.05));
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x1, y1]), gl.STATIC_DRAW);
  }

  function draw(matrix, tile) {
    if (!sweep || !program) return;
    gl.useProgram(program);
    gl.bindVertexArray(vao); // our own VAO, so Mapbox's vertex state is untouched
    upload();

    gl.uniformMatrix4fv(loc.matrix, false, matrix ?? new Float32Array(16));
    gl.uniform1f(loc.tileMode, tile ? 1 : 0);
    if (tile) gl.uniform3f(loc.tile, 2 ** tile.z, tile.x, tile.y);
    gl.uniform2f(loc.site, (sweep.lat * Math.PI) / 180, (sweep.lon * Math.PI) / 180);
    gl.uniform3f(loc.gate, sweep.gateKm, sweep.firstGate, sweep.gates);

    const units = [[tex.data, loc.data], [tex.az, loc.az], [tex.palette, loc.palette]];
    units.forEach(([t, l], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(l, i);
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  function makeTexture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  return {
    id,
    type: 'custom',
    renderingMode: '2d',
    wrapTileId: true,

    onAdd(m, context) {
      map = m;
      gl = context;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Radar sweep program: ${gl.getProgramInfoLog(prog)}`);
      program = prog;
      loc = {
        matrix: gl.getUniformLocation(prog, 'u_matrix'),
        tile: gl.getUniformLocation(prog, 'u_tile'),
        tileMode: gl.getUniformLocation(prog, 'u_tileMode'),
        data: gl.getUniformLocation(prog, 'u_data'),
        az: gl.getUniformLocation(prog, 'u_az'),
        palette: gl.getUniformLocation(prog, 'u_palette'),
        site: gl.getUniformLocation(prog, 'u_site'),
        gate: gl.getUniformLocation(prog, 'u_gate'),
      };
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const aMerc = gl.getAttribLocation(prog, 'a_merc');
      gl.enableVertexAttribArray(aMerc);
      gl.vertexAttribPointer(aMerc, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      tex = { data: makeTexture(), az: makeTexture(), palette: makeTexture() };
      uploaded = null;
      redrape = true;
    },

    onRemove() {
      if (!gl) return;
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(buffer);
      Object.values(tex).forEach((t) => gl.deleteTexture(t));
      program = null;
      uploaded = null;
      map = null;
    },

    render(context, matrix) {
      draw(matrix, null);
    },

    renderToTile(context, tileId) {
      draw(null, tileId);
    },

    shouldRerenderTiles() {
      const r = redrape;
      redrape = false;
      return r;
    },

    /** Swap the sweep shown (null hides it). */
    setSweep(next) {
      if (next === sweep) return;
      sweep = next;
      redrape = true;
      map?.triggerRepaint();
    },
  };
}
