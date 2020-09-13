import * as jsondiffpatch from "jsondiffpatch";
import jsonpatch, { Operation } from "fast-json-patch";

// export const patcher = jsondiffpatch.create({
//   objectHash: (o: any, i: number) => o.id || `i-${i}`,
//   cloneDiffValues: true,
// });

export const patcher = {
  patch: (doc: Object, patch: Operation[]) => {
    const result = jsonpatch.applyPatch(doc, patch, false, false);
    return result.newDocument;
  },
  diff: (doc1: Object, doc2: Object) => jsonpatch.compare(doc1, doc2),
};
