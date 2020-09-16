export type Point = { x: number; y: number };

export type Path = {
  id: string;
  color: string;
  points: Point[];
};

export type Label = {
  id: string;
  color: string;
  text: string;
  pos: Point;
};

export type Doc = {
  cursors: {
    [userId: string]: { x: number; y: number; color: string };
  };
  paths: {
    [id: string]: Path;
  };
  labels: {
    [id: string]: Label;
  };
};

export const init = (): Doc => ({
  cursors: {},
  paths: {},
  labels: {},
});

export const updateCursor = (
  doc: Doc,
  userId: string,
  position: Point,
  color: string
): Doc => ({
  ...doc,
  cursors: {
    ...doc.cursors,
    [userId as string]: {
      ...position,
      color,
    },
  },
});

export const updateCurrentPath = (doc: Doc, path: Path | null): Doc =>
  path === null || path.points.length < 4
    ? doc
    : {
        ...doc,
        paths: {
          ...doc.paths,
          [path.id]: path,
        },
      };
