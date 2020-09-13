// @ts-ignore
import { svgPath, points } from "@yr/monotone-cubic-spline";
import "preact/debug";
import { h, render, Component, Fragment } from "preact";
import * as automerge from "automerge";
import throttle from "lodash.throttle";

import { Doc, Point, Path, init, updateCursor, updateCurrentPath } from "./doc";
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
  socket: WebSocket | null;
  me: string | null;
  local: Doc | null;
  remote: Doc | null;
  currentPath: Path | null;
};

class App extends Component<{}, State> {
  constructor() {
    super();

    this.state = {
      socket: null,
      me: null,
      local: null,
      remote: null,
      currentPath: null,
    };
  }

  get socket() {
    return this.state.socket;
  }

  componentDidMount() {
    const socket = new WebSocket("ws://localhost:8000/sketch/ws");
    this.setState({ socket });

    socket.addEventListener("open", (event) => {
      // console.log("Open");
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

    document.addEventListener("mousedown", (e) => {
      const point = { x: e.clientX, y: e.clientY };
      this.setState({
        currentPath: {
          id: id("p"),
          color,
          points: [point],
        },
      });
    });

    window.addEventListener("keyup", (e) => {
      console.log(e);
      // Ctrl-N - new drawing
      if (e.code === "KeyN" && e.ctrlKey) {
        this.setState(
          {
            local: init(),
          },
          this.update
        );
      }
    });
    document.addEventListener("dblclick", function (e) {
      console.log("dblclick");
    });

    document.addEventListener("mouseup", (e) => {
      if (!this.state.currentPath || !this.state.local) return;

      if (this.state.currentPath.points.length < 4) {
        this.setState({
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
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.state.me || !this.state.local) return;

      const point = { x: e.clientX, y: e.clientY };

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
    });
  }

  update = throttle(() => {
    const { local, remote } = this.state;
    if (local === null || remote === null) return;

    const delta = patcher.diff(remote, local);

    if (delta.length > 0) {
      // console.log("------");
      // console.log(this.state.remote);
      // console.log(this.state.local);
      // console.log("DELTA", delta);
      this.socket?.send(JSON.stringify({ delta }));

      this.setState(({ local }) => ({
        remote: local,
      }));
    }
  }, 100);

  render() {
    if (!this.state.local) return null;

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
              d={svgPath(points(path.points.map((p) => [p.x, p.y])))}
            />
          </svg>
        ))}
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          {Object.values(this.state.local.cursors).map((cursor, i) => (
            <rect
              key={i}
              x={cursor.x - 2}
              y={cursor.y - 2}
              width={4}
              height={4}
              fill={cursor.color}
              // style="filter:url(#shadow-normal);"
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
