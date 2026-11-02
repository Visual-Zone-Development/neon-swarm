// The warping background grid: a spring mesh that ripples from explosions and sinks into gravity wells.

export class Grid {
  constructor(x0, y0, x1, y1, spacing) {
    this.cols = Math.round((x1 - x0) / spacing) + 1
    this.rows = Math.round((y1 - y0) / spacing) + 1
    const n = this.cols * this.rows
    this.rx = new Float32Array(n)
    this.ry = new Float32Array(n)
    this.dx = new Float32Array(n)
    this.dy = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c
        this.rx[i] = x0 + ((x1 - x0) * c) / (this.cols - 1)
        this.ry[i] = y0 + ((y1 - y0) * r) / (this.rows - 1)
      }
    }
    this.acc = 0
  }

  /** Push points away from (x, y). Negative force pulls them in. */
  force(x, y, strength, radius) {
    const r2 = radius * radius
    const { rx, ry, dx, dy, vx, vy } = this
    for (let i = 0; i < rx.length; i++) {
      const ox = rx[i] + dx[i] - x
      const oy = ry[i] + dy[i] - y
      const d2 = ox * ox + oy * oy
      if (d2 > r2 || d2 < 1) continue
      const d = Math.sqrt(d2)
      const f = (strength * (1 - d / radius)) / d
      vx[i] += ox * f
      vy[i] += oy * f
    }
  }

  update(dt) {
    this.acc = Math.min(this.acc + dt, 0.1)
    const step = 1 / 60
    const { cols, rows, dx, dy, vx, vy } = this
    while (this.acc >= step) {
      this.acc -= step
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) {
            dx[i] = dy[i] = vx[i] = vy[i] = 0
            continue
          }
          const ax = (dx[i - 1] + dx[i + 1] + dx[i - cols] + dx[i + cols]) * 0.25 - dx[i]
          const ay = (dy[i - 1] + dy[i + 1] + dy[i - cols] + dy[i + cols]) * 0.25 - dy[i]
          vx[i] = (vx[i] + ax * 1.6 - dx[i] * 0.06) * 0.93
          vy[i] = (vy[i] + ay * 1.6 - dy[i] * 0.06) * 0.93
        }
      }
      for (let i = 0; i < dx.length; i++) {
        dx[i] += vx[i]
        dy[i] += vy[i]
        // Keep the mesh from folding over itself.
        if (dx[i] > 60) dx[i] = 60
        else if (dx[i] < -60) dx[i] = -60
        if (dy[i] > 60) dy[i] = 60
        else if (dy[i] < -60) dy[i] = -60
      }
    }
  }

  draw(ctx, color, accent) {
    const { cols, rows, rx, ry, dx, dy } = this
    ctx.lineWidth = 1
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? color : accent
      ctx.globalAlpha = pass === 0 ? 0.28 : 0.55
      ctx.beginPath()
      for (let r = 0; r < rows; r++) {
        if ((r % 4 === 0) !== (pass === 1)) continue
        let i = r * cols
        ctx.moveTo(rx[i] + dx[i], ry[i] + dy[i])
        for (let c = 1; c < cols; c++) {
          i++
          ctx.lineTo(rx[i] + dx[i], ry[i] + dy[i])
        }
      }
      for (let c = 0; c < cols; c++) {
        if ((c % 4 === 0) !== (pass === 1)) continue
        let i = c
        ctx.moveTo(rx[i] + dx[i], ry[i] + dy[i])
        for (let r = 1; r < rows; r++) {
          i += cols
          ctx.lineTo(rx[i] + dx[i], ry[i] + dy[i])
        }
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}
