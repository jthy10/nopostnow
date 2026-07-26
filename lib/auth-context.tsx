"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { isStandalone } from "./push";
import { findOrphanProfile } from "./settings";

type AuthState = {
  user: User | null;
  pendingUser: User | null;
  username: string | null;
  avatarPath: string | null;
  isAdmin: boolean;
  loading: boolean;
  setAvatarPath: (path: string) => void;
  setUsername: (name: string) => void;
};

const AuthContext = createContext<AuthState>({
  user: null,
  pendingUser: null,
  username: null,
  avatarPath: null,
  isAdmin: false,
  loading: true,
  setAvatarPath: () => {},
  setUsername: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (account) => {
      if (!account?.email) {
        setUser(null);
        setPendingUser(null);
        setUsername(null);
        setAvatarPath(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Account creation signs a user in before their verification message is
      // sent. Keep that pending Firebase user available to the login page so it
      // can send/resend the message, but never expose it to the protected app.
      if (!account.emailVerified) {
        setUser(null);
        setPendingUser(account);
        setUsername(null);
        setAvatarPath(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setUser(account);
      setPendingUser(null);

      try {
        const token = await account.getIdTokenResult();
        setIsAdmin(token.claims.admin === true);

        const userRef = doc(db, "users", account.email);
        const publicRef = doc(db, "publicProfiles", account.uid);
        const snapshot = await getDoc(userRef);
        let profile: Record<string, unknown>;

        if (snapshot.exists()) {
          profile = snapshot.data();
          // Self-heal account records that predate uid/joinedAt. appAt is the
          // first launch from a Home Screen installation.
          const inApp = isStandalone();
          if (!profile.uid || !profile.joinedAt || (inApp && !profile.appAt)) {
            const created = account.metadata.creationTime;
            const repair = {
              uid: account.uid,
              ...(created ? { joinedAt: Timestamp.fromDate(new Date(created)) } : {}),
              ...(inApp && !profile.appAt ? { appAt: serverTimestamp() } : {}),
            };
            await setDoc(userRef, repair, { merge: true });
            profile = { ...profile, ...repair };
          }
        } else {
          // A verified email change can leave the private account record under
          // the old address. Adopt it before creating a fresh profile.
          const orphan = await findOrphanProfile(account.uid, account.email).catch(
            () => null
          );
          if (orphan) {
            profile = orphan.data();
            await setDoc(userRef, profile);
            await deleteDoc(orphan.ref).catch(() => {});
          } else {
            const joinedAt = account.metadata.creationTime
              ? Timestamp.fromDate(new Date(account.metadata.creationTime))
              : Timestamp.now();
            profile = {
              username: account.displayName?.trim() || "Anonymous",
              uid: account.uid,
              joinedAt,
              ...(isStandalone() ? { appAt: serverTimestamp() } : {}),
              createdAt: serverTimestamp(),
            };
            await setDoc(userRef, profile);
          }
        }

        const profileName =
          typeof profile.username === "string" && profile.username.trim()
            ? profile.username
            : "Anonymous";
        const profileAvatar =
          typeof profile.avatarPath === "string" ? profile.avatarPath : null;

        // Social discovery reads this UID-keyed, email-free projection. The
        // email-keyed users record is private to its owner and administrators.
        await setDoc(
          publicRef,
          {
            uid: account.uid,
            username: profileName,
            ...(profileAvatar ? { avatarPath: profileAvatar } : {}),
            ...(profile.joinedAt ? { joinedAt: profile.joinedAt } : {}),
            ...(profile.appAt ? { appAt: profile.appAt } : {}),
          },
          { merge: true }
        );

        setUsername(profileName);
        setAvatarPath(profileAvatar);
      } catch (error) {
        console.error("Failed to load the signed-in profile.", error);
        setUsername(null);
        setAvatarPath(null);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        pendingUser,
        username,
        avatarPath,
        isAdmin,
        loading,
        setAvatarPath,
        setUsername,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
