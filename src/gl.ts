export type GL = WebGL2RenderingContext
export const fullVertex = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`

export class Program {
  readonly value: WebGLProgram
  private locations = new Map<string, WebGLUniformLocation | null>()
  constructor(private gl: GL, vertex: string, fragment: string) {
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(message ?? 'Shader compile failed')
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, vertex)
    const fs = compile(gl.FRAGMENT_SHADER, fragment)
    this.value = gl.createProgram()!
    gl.attachShader(this.value, vs)
    gl.attachShader(this.value, fs)
    gl.linkProgram(this.value)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(this.value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.value) ?? 'Shader link failed')
  }
  use() { this.gl.useProgram(this.value) }
  uniform(name: string) {
    if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.value, name))
    return this.locations.get(name) ?? null
  }
  f(name: string, value: number) { this.gl.uniform1f(this.uniform(name), value) }
  i(name: string, value: number) { this.gl.uniform1i(this.uniform(name), value) }
  v2(name: string, x: number, y: number) { this.gl.uniform2f(this.uniform(name), x, y) }
  v3(name: string, x: number, y: number, z: number) { this.gl.uniform3f(this.uniform(name), x, y, z) }
  v4(name: string, x: number, y: number, z: number, w: number) { this.gl.uniform4f(this.uniform(name), x, y, z, w) }
}

export function texture(gl: GL, unit: number, handle: WebGLTexture) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, handle)
}

export function newTexture(gl: GL) {
  const handle = gl.createTexture()!
  texture(gl, 0, handle)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return handle
}
