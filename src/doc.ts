export type Point = { x: number; y: number };
export type Cursor = { x: number; y: number; color: string };

export type Points = Point[] & { _path2d?: Path2D };

export type Path = {
  type: "path";
  id: string;
  color: string;
  points: Points;
};

export type Label = {
  type: "label";
  id: string;
  color: string;
  text: string;
  pos: Point;
};

export type Item = Path | Label;

export type Doc = {
  cursors: {
    [userId: string]: Cursor;
  };
  items: {
    [id: string]: Item;
  };
};

export const init = (): Doc => ({
  cursors: {},
  items: {},
});

export const updateCursor = (
  doc: Doc,
  userId: string,
  cursor: Cursor
): Doc => ({
  ...doc,
  cursors: {
    ...doc.cursors,
    [userId as string]: {
      ...cursor,
    },
  },
});
