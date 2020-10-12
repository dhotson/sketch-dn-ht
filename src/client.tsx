// @ts-ignore
import spline from "@yr/monotone-cubic-spline";
// @ts-ignore
import throttle from "lodash.throttle";

import { Doc, Point, Points, Path, Label, init, updateCursor } from "./doc";
import { patcher } from "./patcher";
import * as jsondiffpatch from "jsondiffpatch";
import { Simplify } from "simplify-ts";

const id = (type: string) =>
  `${type}-${Math.round(Math.random() * 36 ** 5).toString(36)}`;

const toPath2D = (points: Points): Path2D => {
  return (points._path2d = new Path2D(
    spline.svgPath(spline.points(points.map((p) => [p.x, p.y])))
  ));
};

export class App {
  socket: WebSocket;
  canvas: HTMLCanvasElement;
  input: HTMLInputElement;
  ctx: CanvasRenderingContext2D;
  dpr: number = 1.0;

  me: string | null = null;
  doc: Doc | null = null;
  shadow: Doc | null = null;

  origin: Point = { x: 0, y: 0 };

  currentPath: Path | null = null;
  currentLabel: Label | null = null;

  color: string;

  reqId: number | null = null;
  idleId: number | null = null;

  constructor() {
    this.input = this.createInput();
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    document.body.appendChild(this.canvas);
    document.body.appendChild(this.input);
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;

    this.resize();
    window.addEventListener("resize", this.resize.bind(this));
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousedown", this.onMouseDown.bind(this));
    window.addEventListener("mousemove", this.onMouseMove.bind(this));
    window.addEventListener("mouseup", this.onMouseUp.bind(this));
    window.addEventListener("wheel", this.onMouseWheel.bind(this), {
      passive: false,
    });
    window.addEventListener("keydown", (e) => {
      if (!this.doc) return;

      if (e.code === "KeyA" && e.metaKey) {
        this.doc = {
          ...this.doc,
          items: {},
        };
        this.s();
        this.r();
      } else if (e.key === "Enter") {
        this.enter();
      } else if (e.key === "Escape") {
        this.escape();
      }
    });

    const colors = ["#3DE4B5", "#43B6E8", "#FFE65B", "#FF5F48", "#FFFFFF"];
    const n = Math.round(Math.random() * 1000);
    this.color = colors[n % colors.length];

    this.socket = this.connect();
  }

  createInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Say something...";
    input.style.display = "none";
    input.style.top = "0";
    input.style.left = "0";
    input.addEventListener("blur", this.escape.bind(this));
    input.addEventListener("input", (e) => {
      if (!this.doc) return;

      if (this.currentLabel) {
        this.currentLabel = {
          ...this.currentLabel,
          text: this.input.value,
        };
        this.doc = {
          ...this.doc,
          items: {
            ...this.doc.items,
            [this.currentLabel.id]: {
              ...this.currentLabel,
            },
          },
        };

        this.r();
        this.s();
      }
    });
    return input;
  }

  showInput(e: MouseEvent) {
    this.input.value = "";
    this.input.style.display = "block";
    this.input.focus();
  }

  updateInput() {
    if (this.currentLabel) {
      this.input.style.color = this.color;
      this.input.style.left = this.currentLabel.pos.x + this.origin.x + "px";
      this.input.style.top = this.currentLabel.pos.y + this.origin.y + "px";
      this.input.style.display = "block";
    } else {
      this.input.style.display = "none";
    }
  }

  enter() {
    this.currentLabel = null;
    this.currentPath = null;

    this.r();
    this.s();
  }

  escape() {
    if (!this.doc) return;

    if (this.currentLabel) delete this.doc.items[this.currentLabel.id];
    // if (this.currentPath) delete this.doc.items[this.currentPath.id];
    this.currentLabel = null;
    // this.currentPath = null;

    this.r();
    this.s();
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1.0;
    this.canvas.width = window.innerWidth * this.dpr;
    this.canvas.height = window.innerHeight * this.dpr;

    this.r();
  }

  connect() {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;

    this.socket = new WebSocket(`${scheme}//${host}/sketch/ws`);

    this.socket.addEventListener("open", (event) => {
      console.log("Open");
    });

    this.socket.addEventListener("error", (event) => {
      console.error(event);
      setTimeout(this.connect, 500);
    });

    this.socket.addEventListener("close", (event) => {
      setTimeout(() => this.connect(), 1000);
    });

    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);

      if (data.init) {
        this.me = data.you;
        this.doc = data.init;
        this.shadow = data.init;
      }

      if (!this.me || !this.doc || !this.shadow) return;

      const delta = data.delta;
      if (delta) {
        try {
          this.doc = (patcher.patch(this.doc, delta) as unknown) as Doc;
          this.shadow = (patcher.patch(this.shadow, delta) as unknown) as Doc;
        } catch (error) {
          console.error(error);
        }
      }

      this.r();
      this.s();
    });

    return this.socket;
  }

  onMouseWheel(e: WheelEvent) {
    e.stopImmediatePropagation();
    e.preventDefault();

    this.origin.x -= e.deltaX;
    this.origin.y -= e.deltaY;

    this.onMouseMove(e);
  }

  onMouseDown(e: MouseEvent) {
    e.preventDefault();
    const point = this.fromScreen({ x: e.clientX, y: e.clientY });

    this.currentLabel = null;
    this.currentPath = {
      type: "path",
      id: id("p"),
      color: this.color,
      points: [point],
    };

    this.r();
  }

  onMouseMove(e: MouseEvent) {
    if (!this.doc || !this.me) return;

    const pos = this.fromScreen({ x: e.clientX, y: e.clientY });
    const cursor = { ...pos, color: this.color };

    this.doc = {
      ...this.doc,
      cursors: {
        ...this.doc.cursors,
        [this.me]: {
          ...cursor,
        },
      },
    };

    if (this.currentPath) {
      this.currentPath = {
        ...this.currentPath,
        points: [...this.currentPath.points, pos],
      };

      if (this.currentPath.points.length > 3) {
        this.doc = {
          ...this.doc,
          items: {
            ...this.doc.items,
            [this.currentPath.id]: {
              ...this.currentPath,
            },
          },
        };
      }
    }

    this.r();
    this.s();
  }

  onMouseUp(e: MouseEvent) {
    if (!this.doc || !this.currentPath) return;

    if (this.currentPath) {
      if (this.currentPath.points.length > 3) {
        const simplified = Simplify([...this.currentPath.points], 1, true);
        this.doc = {
          ...this.doc,
          items: {
            ...this.doc.items,
            [this.currentPath.id]: {
              ...this.currentPath,
              points: Object.assign([], simplified, {
                _path2d: toPath2D(simplified),
              }),
            },
          },
        };
      } else {
        const pos = this.fromScreen({ x: e.clientX, y: e.clientY - 36 / 2 });
        this.currentLabel = {
          type: "label",
          id: id("l"),
          color: this.color,
          text: "",
          pos,
        };
        this.doc = {
          ...this.doc,
          items: {
            ...this.doc.items,
            [this.currentLabel.id]: {
              ...this.currentLabel,
            },
          },
        };
        this.showInput(e);
      }
    }

    this.currentPath = null;

    this.r();
    this.s();
  }

  toScreen(p: Point): Point {
    return {
      x: p.x,
      y: p.y,
    };
  }

  fromScreen(p: Point): Point {
    return {
      x: p.x - this.origin.x,
      y: p.y - this.origin.y,
    };
  }

  s = () => {
    if (this.idleId) cancelIdleCallback(this.idleId);
    this.idleId = requestIdleCallback(this.sync, { timeout: 1000 });
  };

  sync = () => {
    const { doc, shadow } = this;
    if (!doc || !shadow) return;

    const delta = patcher.diff(shadow, doc);
    if (delta.length) {
      try {
        this.socket.send(JSON.stringify({ delta }));
      } catch (e) {
        console.error(e);
        setTimeout(this.sync, 100);
      }
      this.shadow = this.doc;
    }
  };

  drawPath(path: Path) {
    const ctx = this.ctx;

    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const path2d = path.points._path2d || toPath2D(path.points);

    ctx.translate(0, 1);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.stroke(path2d);
    ctx.translate(0, -1);

    ctx.strokeStyle = path.color;
    ctx.stroke(path2d);

    ctx.restore();
  }

  drawLabel(label: Label) {
    const ctx = this.ctx;

    ctx.save();
    ctx.font = "32px ISO, monospace";
    ctx.textBaseline = "bottom";

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(label.text, label.pos.x, label.pos.y + 34); // Magic number

    ctx.fillStyle = label.color;
    ctx.fillText(label.text, label.pos.x, label.pos.y + 33); // Magic number

    ctx.restore();
  }

  r = () => {
    if (this.reqId) cancelAnimationFrame(this.reqId);
    this.reqId = requestAnimationFrame(this.render);
  };

  render = () => {
    const { doc } = this;
    if (!doc) return;

    const { ctx, dpr } = this;

    ctx.clearRect(0, 0, this.canvas.width * dpr, this.canvas.height * dpr);

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(this.origin.x, this.origin.y);

    Object.values(doc.items).map((item) => {
      if (item.type === "path") {
        this.drawPath(item);
      } else if (item.type === "label") {
        if (this.currentLabel && this.currentLabel.id === item.id) return;
        this.drawLabel(item);
      } else {
        //
      }
    });

    ctx.save();
    Object.values(doc.cursors).map((cursor) => {
      const p = this.toScreen(cursor);
      ctx.fillStyle = cursor.color;
      // ctx.shadowColor = "rgba(255,255,255,1)";

      // if (this.currentPath) {
      //   ctx.shadowBlur = 15 * devicePixelRatio;
      // } else {
      //   ctx.shadowBlur = 5 * devicePixelRatio;
      // }
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.restore();

    this.updateInput();

    ctx.restore();
  };
}

(window as any).app = new App();
