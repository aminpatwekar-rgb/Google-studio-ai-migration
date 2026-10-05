import { createMiddleware } from "@tanstack/react-start";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  writeBatch,
  type WhereFilterOp,
  type QueryConstraint,
} from "firebase/firestore";
import { auth, db } from "./config";

function makeDocRef(pathOrCol: string, ...segments: string[]) {
  return doc(db, pathOrCol, ...segments);
}

function wrapDocSnap(snap: any) {
  return {
    id: snap.id,
    exists: typeof snap.exists === "function" ? snap.exists() : Boolean(snap.exists),
    data: () => (snap.exists() ? snap.data() : undefined),
  };
}

class QueryChain {
  private constraints: QueryConstraint[] = [];
  constructor(private collectionPath: string) {}

  where(field: string, opStr: string, value: any): QueryChain {
    this.constraints.push(where(field, opStr as WhereFilterOp, value));
    return this;
  }

  limit(count: number): QueryChain {
    this.constraints.push(limit(count));
    return this;
  }

  async get() {
    const q = query(collection(db, this.collectionPath), ...this.constraints);
    const snap = await getDocs(q);
    const docs = snap.docs.map(wrapDocSnap);
    return {
      empty: snap.empty,
      docs,
      forEach: (callback: (d: any) => void) => docs.forEach(callback),
    };
  }
}

function createCollectionRef(path: string) {
  return {
    doc(id?: string) {
      const docPath = id ? `${path}/${id}` : `${path}/${doc(collection(db, path)).id}`;
      return {
        id: docPath.split("/").pop()!,
        path: docPath,
        collection(subCol: string) {
          return createCollectionRef(`${docPath}/${subCol}`);
        },
        async get() {
          const snap = await getDoc(doc(db, docPath));
          return wrapDocSnap(snap);
        },
        async set(data: any, options?: { merge?: boolean }) {
          if (options?.merge) {
            await setDoc(doc(db, docPath), data, { merge: true });
          } else {
            await setDoc(doc(db, docPath), data);
          }
        },
        async update(data: any) {
          await updateDoc(doc(db, docPath), data);
        },
        async delete() {
          await deleteDoc(doc(db, docPath));
        },
      };
    },
    where(field: string, opStr: string, value: any) {
      const q = new QueryChain(path);
      return q.where(field, opStr, value);
    },
    limit(count: number) {
      const q = new QueryChain(path);
      return q.limit(count);
    },
    async get() {
      const snap = await getDocs(collection(db, path));
      const docs = snap.docs.map(wrapDocSnap);
      return {
        empty: snap.empty,
        docs,
        forEach: (callback: (d: any) => void) => docs.forEach(callback),
      };
    },
  };
}

export const adminDb = {
  collection(name: string) {
    return createCollectionRef(name);
  },
  batch() {
    const batch = writeBatch(db);
    return {
      set(docRef: any, data: any, options?: { merge?: boolean }) {
        const rawRef = doc(db, docRef.path || docRef);
        if (options?.merge) {
          batch.set(rawRef, data, { merge: true });
        } else {
          batch.set(rawRef, data);
        }
        return this;
      },
      update(docRef: any, data: any) {
        const rawRef = doc(db, docRef.path || docRef);
        batch.update(rawRef, data);
        return this;
      },
      delete(docRef: any) {
        const rawRef = doc(db, docRef.path || docRef);
        batch.delete(rawRef);
        return this;
      },
      async commit() {
        await batch.commit();
      },
    };
  },
};

export const requireFirebaseAuth = createMiddleware().server(async ({ next, request }) => {
  let userId = auth.currentUser?.uid || "";
  const email = auth.currentUser?.email || undefined;

  if (request) {
    const authHeader =
      request.headers?.get("authorization") || request.headers?.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token && !userId) {
      userId = token.length < 128 ? token : "user";
    }

    const customUid = request.headers?.get("x-user-id");
    if (customUid) userId = customUid;
  }

  return next({
    context: {
      userId: userId || auth.currentUser?.uid || "user",
      email: email || auth.currentUser?.email || undefined,
    },
  });
});
