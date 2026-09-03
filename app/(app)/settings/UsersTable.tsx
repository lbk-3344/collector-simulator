"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/components/AppDialog";

type ApiUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "ADMIN" | "USER" | "PENDING";
  createdAt: string;
};

function initials(user: ApiUser): string {
  const source = user.name ?? user.email;
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Admin-only Users tab: table of all users, inline role switch, Validate for
// PENDING users, Delete with confirmation. The last remaining ADMIN can't be
// demoted or deleted, by anyone — enforced here (disabled + tooltip) and again
// server-side in the API routes. See CLAUDE-CONCEPT.md section 4.
export function UsersTable({
  currentUserId,
  onChanged,
}: {
  currentUserId: string;
  onChanged?: () => void;
}) {
  const [users, setUsers] = useState<ApiUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm } = useDialog();

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/users", { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn't load users.");
      return;
    }
    const data = await res.json();
    setUsers(data.users ?? []);
    // Keep the Settings "Users" tab badge (pending count) live (BUG #16).
    onChanged?.();
  }, [onChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const adminCount = users?.filter((u) => u.role === "ADMIN").length ?? 0;

  async function handleValidate(user: ApiUser) {
    setBusyId(user.id);
    setError(null);
    const res = await fetch(`/api/users/${user.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "USER" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't validate this user.");
    }
    await load();
    setBusyId(null);
  }

  async function handleRoleChange(user: ApiUser, role: "ADMIN" | "USER") {
    setBusyId(user.id);
    setError(null);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't change this user's role.");
    }
    await load();
    setBusyId(null);
  }

  async function handleDelete(user: ApiUser) {
    const label = user.name ?? user.email;
    const ok = await confirm({
      variant: "warning",
      title: "Delete user",
      message: `Delete ${label} permanently? This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(user.id);
    setError(null);
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't delete this user.");
    }
    await load();
    setBusyId(null);
  }

  if (!users) {
    return <p className="note">Loading users…</p>;
  }

  return (
    <>
      {error && <div className="snack snack-danger">{error}</div>}
      <div className="table-scroll">
        <table className="users">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSoleAdmin = user.role === "ADMIN" && adminCount <= 1;
              const isBusy = busyId === user.id;
              const displayName = user.name ?? "—";

              return (
                <tr key={user.id}>
                  <td>
                    <div className="u-cell">
                      <span className="u-avatar">
                        {user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.image} alt="" />
                        ) : (
                          initials(user)
                        )}
                      </span>
                      <div>
                        <div className="u-name">{displayName}</div>
                        <div className="u-email">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {user.role === "PENDING" ? (
                      <span className="chip chip-warning">Pending</span>
                    ) : (
                      <select
                        className="role-select"
                        value={user.role}
                        disabled={isSoleAdmin || isBusy}
                        title={isSoleAdmin ? "The last admin can't be changed" : undefined}
                        onChange={(e) => handleRoleChange(user, e.target.value as "ADMIN" | "USER")}
                      >
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    )}
                  </td>
                  <td className="u-meta">{formatJoined(user.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      {user.role === "PENDING" ? (
                        <button className="btn btn-primary small" disabled={isBusy} onClick={() => handleValidate(user)}>
                          Validate
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost-danger"
                          disabled={isSoleAdmin || isBusy}
                          title={isSoleAdmin ? "The last admin can't be deleted" : undefined}
                          onClick={() => handleDelete(user)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        @seagullsoftware.com sign-ins skip this table entirely and land straight in the User role — anyone else
        appears here as Pending until validated.
      </p>
    </>
  );
}
