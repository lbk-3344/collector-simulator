"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/AppDialog";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type Announcement = {
  id: string;
  title: string;
  body: string;
  imageData: string | null;
  publishedAt: string | null;
  emailSentAt: string | null;
  createdAt: string;
  author: { name: string | null; email: string };
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Admin-only announcement authoring (BL-075, CLAUDE-CONCEPT.md section 18).
// Create/edit a draft, then Publish (which emails every USER/ADMIN once).
export function AnnouncementsTab() {
  const { confirm } = useDialog();
  const [list, setList] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // Form state — `editing` null while closed, "new" for a create, or an id.
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/announcements");
    if (!res.ok) {
      setError("Couldn't load announcements.");
      return;
    }
    setList((await res.json()).announcements ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing("new");
    setTitle("");
    setBody("");
    setImageData(null);
    setFormError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function openEdit(a: Announcement) {
    setEditing(a.id);
    setTitle(a.title);
    setBody(a.body);
    setImageData(a.imageData);
    setFormError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function closeForm() {
    setEditing(null);
    setFormError(null);
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setFormError("That image is larger than 2MB — pick a smaller one.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(typeof reader.result === "string" ? reader.result : null);
      setFormError(null);
    };
    reader.onerror = () => setFormError("Couldn't read that image.");
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!title.trim() || !body.trim()) {
      setFormError("Title and body are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/announcements" : `/api/announcements/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), imageData }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setFormError(data?.error ?? "Couldn't save this announcement.");
      return;
    }
    closeForm();
    await load();
  }

  async function publish(a: Announcement) {
    const ok = await confirm({
      variant: "warning",
      title: "Publish announcement",
      message: "This emails every user and can't be undone. Continue?",
      confirmLabel: "Publish & email",
    });
    if (!ok) return;
    setBusyId(a.id);
    setError(null);
    setSendResult(null);
    const res = await fetch(`/api/announcements/${a.id}/publish`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't publish this announcement.");
    } else {
      setSendResult(
        data?.alreadyEmailed
          ? "Published (email had already been sent)."
          : `Published — emailed ${data.emailed} of ${data.total} users.`
      );
    }
    await load();
    setBusyId(null);
  }

  async function remove(a: Announcement) {
    const ok = await confirm({
      variant: "warning",
      title: "Delete announcement",
      message: `Delete "${a.title}" permanently? This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(a.id);
    setError(null);
    const res = await fetch(`/api/announcements/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't delete this announcement.");
    }
    await load();
    setBusyId(null);
  }

  if (!list) return <p className="note">Loading announcements…</p>;

  return (
    <>
      {error && <div className="snack snack-danger">{error}</div>}
      {sendResult && <div className="snack snack-info">{sendResult}</div>}

      {editing ? (
        <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>
            {editing === "new" ? "New announcement" : "Edit announcement"}
          </h3>
          {formError && <div className="snack snack-danger">{formError}</div>}
          <div className="field-block">
            <label htmlFor="annTitle">Title</label>
            <input id="annTitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </div>
          <div className="field-block">
            <label htmlFor="annBody">Body</label>
            <textarea id="annBody" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="field-block">
            <label htmlFor="annImage">Image (optional, max 2MB)</label>
            <input id="annImage" ref={fileRef} type="file" accept="image/*" onChange={onPickImage} />
            {imageData && (
              <div style={{ marginTop: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageData}
                  alt=""
                  style={{ maxWidth: "100%", borderRadius: 7, border: "1px solid var(--border-strong)" }}
                />
                <div>
                  <button className="btn btn-secondary small" onClick={() => setImageData(null)}>
                    Remove image
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="modal-foot" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <button className="btn btn-secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {editing === "new" ? "Create draft" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={openNew}>
            + New announcement
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="note">No announcements yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th>Announcement</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const isBusy = busyId === a.id;
                const published = a.publishedAt != null;
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="u-name">{a.title}</div>
                      <div className="u-email">by {a.author.name ?? a.author.email}</div>
                    </td>
                    <td>
                      {published ? (
                        <span className="chip chip-success">Published</span>
                      ) : (
                        <span className="chip chip-warning">Draft</span>
                      )}
                      {published && (
                        <div className="u-meta" style={{ marginTop: 4 }}>
                          {a.emailSentAt ? `Emailed ${fmt(a.emailSentAt)}` : "not yet sent"}
                        </div>
                      )}
                    </td>
                    <td className="u-meta">{fmt(a.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-secondary small"
                          disabled={isBusy}
                          onClick={() => openEdit(a)}
                        >
                          Edit
                        </button>
                        {!published && (
                          <button
                            className="btn btn-primary small"
                            disabled={isBusy}
                            onClick={() => publish(a)}
                          >
                            Publish
                          </button>
                        )}
                        <button
                          className="btn btn-secondary small"
                          disabled={isBusy}
                          onClick={() => remove(a)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
