// @ts-ignore
import { svgPath, points } from "@yr/monotone-cubic-spline";
import "preact/debug";
import { h, render, Component, Fragment } from "preact";
import * as automerge from "automerge";
// @ts-ignore
import throttle from "lodash.throttle";

import {
  Doc,
  Point,
  Path,
  Label,
  init,
  updateCursor,
  updateCurrentPath,
} from "./doc";
import { patcher } from "./patcher";
import * as jsondiffpatch from "jsondiffpatch";
import { Simplify } from "simplify-ts";

const n = Math.round(Math.random() * 1000);
const colors = ["#3DE4B5", "#43B6E8", "#FFE65B", "#FF5F48", "#FFFFFF"];
const color = colors[n % colors.length];

const clone = (o: unknown) => JSON.parse(JSON.stringify(o));
const id = (type: string) =>
  `${type}-${Math.round(Math.random() * 36 ** 5).toString(36)}`;

const devicePixelRatio = window.devicePixelRatio || 1;

type State = {
  me: string | null;
  local: Doc | null;
  remote: Doc | null;
  currentPath: Path | null;
  currentLabel: Label | null;
  originOffset: { x: number; y: number };
};

class App extends Component<{}, State> {
  socket: WebSocket | null = null;

  constructor() {
    super();

    this.state = {
      me: null,
      local: null,
      remote: null,
      currentPath: null,
      currentLabel: null,
      originOffset: {
        x: 0,
        y: 0,
      },
    };
  }

  handleMouseDown = (e: MouseEvent) => {
    const point = this.fromScreen({ x: e.clientX, y: e.clientY });
    this.setState({
      currentPath: {
        id: id("p"),
        color,
        points: [point],
      },
    });
  };

  handleMouseMove = (e: MouseEvent) => {
    if (!this.state.me || !this.state.local) return;

    const point = this.fromScreen({ x: e.clientX, y: e.clientY });

    let { local, me, currentPath } = this.state;

    currentPath = currentPath && {
      ...currentPath,
      points: [...currentPath.points, point],
    };

    local = updateCursor(local, me, point, color);
    local = updateCurrentPath(local, currentPath);

    this.setState(
      {
        currentPath,
        local,
      },
      this.update
    );
  };

  handleMouseUp = (e: MouseEvent) => {
    if (!this.state.currentPath || !this.state.local) return;

    if (this.state.currentPath.points.length < 4) {
      this.setState({
        currentLabel: {
          id: id("l"),
          text: "",
          color: color,
          pos: this.fromScreen({ x: e.clientX, y: e.clientY }),
        },
        currentPath: null,
      });
      return;
    }
    const point = { x: e.clientX, y: e.clientY };

    const { currentPath, local } = this.state;

    const simplified = Simplify(currentPath.points, 0.5, true);

    this.setState({
      local: {
        ...local,
        paths: {
          ...local.paths,
          [currentPath.id]: {
            ...local.paths[currentPath.id],
            points: simplified,
          },
        },
      },
      currentPath: null,
    });
  };

  handleWheel = (e: MouseWheelEvent) => {
    const { x, y } = this.state.originOffset;
    this.setState({
      originOffset: {
        x: x + e.deltaX,
        y: y + e.deltaY,
      },
    });
  };

  handleKeyUp = (e: KeyboardEvent) => {
    // Escape - cancel current label
    if (e.code === "Escape") {
      this.setState({
        currentLabel: null,
      });
    }

    // Ctrl-N - new drawing / clear the screen
    if (e.ctrlKey && e.code === "KeyN") {
      this.setState(
        {
          local: init(),
        },
        this.update
      );
    }
  };

  componentDidMount() {
    this.connect();

    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("wheel", this.handleWheel);

    window.addEventListener("keyup", this.handleKeyUp);
  }

  connect = () => {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;

    const socket = (this.socket = new WebSocket(
      `${scheme}//${host}/sketch/ws`
    ));

    socket.addEventListener("open", (event) => {
      console.log("Open");
    });

    socket.addEventListener("error", (event) => {
      console.error(event);
      setTimeout(this.connect, 500);
    });

    socket.addEventListener("close", (event) => {
      setTimeout(() => this.connect(), 1000);
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      const delta = data.delta;
      if (data.init) {
        this.setState({
          me: data.you,
          local: data.init,
          remote: data.init,
        });
      }

      if (delta) {
        const { local, remote } = this.state;
        if (local === null || remote === null) return;

        try {
          const newLocal = patcher.patch(local, delta) as unknown;
          const newRemote = patcher.patch(remote, delta) as unknown;
          this.setState({
            local: newLocal as Doc,
            remote: newRemote as Doc,
          });
        } catch (error) {
          console.error(error);
        }
      }
    });
  };

  update = throttle(() => {
    const { local, remote } = this.state;
    if (local === null || remote === null || this.socket === null) return;

    const delta = patcher.diff(remote, local);

    if (delta.length > 0) {
      try {
        this.socket.send(JSON.stringify({ delta }));
      } catch (e) {
        console.error(e);
        setTimeout(this.update, 100);
      }

      this.setState(({ local }) => ({
        remote: local,
      }));
    }
  }, 100);

  toScreen = ({ x, y }: Point): Point => {
    return {
      x: x + this.state.originOffset.x,
      y: y + this.state.originOffset.y,
    };
  };

  fromScreen = ({ x, y }: Point): Point => {
    return {
      x: x - this.state.originOffset.x,
      y: y - this.state.originOffset.y,
    };
  };

  render() {
    if (!this.state.local) return null;

    const { local, currentLabel, currentPath } = this.state;

    return (
      <>
        {Object.values(this.state.local.paths).map((path) => (
          <svg
            className="path"
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
          >
            <path
              key={path.id}
              stroke={path.color}
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="transparent"
              // style="filter:url(#line-shadow);"
              vector-effect="non-scaling-stroke"
              d={svgPath(
                points(path.points.map(this.toScreen).map((p) => [p.x, p.y]))
              )}
            />
          </svg>
        ))}
        {Object.values(this.state.local.labels).map((label) => {
          return (
            <span
              className="label"
              key={label.id}
              style={{
                left: this.toScreen(label.pos).x,
                top: this.toScreen(label.pos).y - 32,
                color: label.color,
              }}
            >
              {label.text}
            </span>
          );
        })}

        {currentLabel && (
          <input
            style={{
              left: this.toScreen(currentLabel.pos).x,
              top: this.toScreen(currentLabel.pos).y - 32,
              color: currentLabel.color,
            }}
            type="text"
            placeholder="Say something..."
            onBlur={(e) => {
              // this.setState({ currentLabel: null });
            }}
            onKeyDown={(e) => {
              if (currentLabel === null) return;
              if (e.target === null) return;

              if (e.key === "Enter") {
                this.setState(
                  {
                    local: {
                      ...local,
                      labels: {
                        ...local.labels,
                        [currentLabel.id]: {
                          ...currentLabel,
                          text: (e.target as HTMLInputElement).value,
                        },
                      },
                    },
                    currentLabel: null,
                  },
                  this.update
                );
              }
            }}
            ref={(e) => {
              if (e) e.focus();
            }}
          />
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
          style={{
            filter: currentPath
              ? "drop-shadow(0px 0px 7px #fff)"
              : "drop-shadow(0px 0px 3px #fff)",
          }}
        >
          {Object.values(this.state.local.cursors).map((cursor, i) => (
            <rect
              key={i}
              x={this.toScreen(cursor).x - 2}
              y={this.toScreen(cursor).y - 2}
              width={4}
              height={4}
              fill={cursor.color}
              rx={0}
            />
          ))}
        </svg>
      </>
    );
  }
}

const app = document.getElementById("app");
if (app) {
  render(<App />, app);
}
