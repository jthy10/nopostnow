"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { isStandalone } from "./push";
import { findOrphanProfile } from "./settings";

type AuthState = {
  user: User | null;
  username: string | null;
  avatarPath: string | null;
  isAdmin: boolean;
  loading: boolean;
  setAvatarPath: (path: string) => void;
  setUsername: (name: string) => void;
};

const AuthContext = createContext<AuthState>({
  user: null,
  username: null,
  avatarPath: null,
  isAdmin: false,
  loading: true,
  setAvatarPath: () => {},
  setUsername: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u || !u.email) {
        setUsername(null);
        setAvatarPath(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const token = await u.getIdTokenResult();
      if (token.claims.member !== true) {
        setUsername(null);
        setAvatarPath(null);
        setIsAdmin(false);
        setLoading(false);
        await signOut(auth);
        return;
      }
      setIsAdmin(token.claims.admin === true);

      const userRef = doc(db, "users", u.email);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        setUsername(snap.data().username || "Anonymous");
        setAvatarPath(snap.data().avatarPath ?? null);
        // Self-heal: legacy user docs predate profiles and lack uid/joinedAt.
        // Auth's creationTime is the real "date joined", but only the account
        // owner can read it — so each user backfills their own doc on sign-in.
        // appAt = first launch from the Home Screen; DMs use it to tell who
        // actually has the app installed.
        const inApp = isStandalone();
        if (!snap.data().uid || !snap.data().joinedAt || (inApp && !snap.data().appAt)) {
          const created = u.metadata.creationTime;
          void setDoc(
            userRef,
            {
              uid: u.uid,
              ...(created ? { joinedAt: Timestamp.fromDate(new Date(created)) } : {}),
              ...(inApp && !snap.data().appAt ? { appAt: serverTimestamp() } : {}),
            },
            { merge: true }
          );
        }
      } else {
        // No doc under this email. Before starting fresh as Anonymous, check
        // whether a profile keyed to an old email carries this uid — that's
        // what a verified email change leaves behind. Adopt it.
        const orphan = await findOrphanProfile(u.uid, u.email).catch(() => null);
        if (orphan) {
          await setDoc(userRef, orphan.data());
          await deleteDoc(orphan.ref).catch(() => {});
          setUsername(orphan.data().username || "Anonymous");
          setAvatarPath(orphan.data().avatarPath ?? null);
        } else {
          await setDoc(userRef, {
            username: "Anonymous",
            uid: u.uid,
            ...(u.metadata.creationTime
              ? { joinedAt: Timestamp.fromDate(new Date(u.metadata.creationTime)) }
              : {}),
            ...(isStandalone() ? { appAt: serverTimestamp() } : {}),
            createdAt: serverTimestamp(),
          });
          setUsername("Anonymous");
        }
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, username, avatarPath, isAdmin, loading, setAvatarPath, setUsername }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
