"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { apiFetch } from "@/lib/api";

interface GradeMeta { id: string; label: string; lessonCount: number; }
interface LessonSummary {
  id: string; title: string; grade: string;
  chapterId: string; estimatedMinutes: number; locked: boolean;
  hasFile: boolean; duplicateOf: string | null; sharesTitle: boolean;
}

function LessonsContent() {
  const searchParams  = useSearchParams();
  const initialGrade  = searchParams.get("grade") ?? "";

  const [grades, setGrades]     = useState<GradeMeta[]>([]);
  const [selected, setSelected] = useState(initialGrade);
  const [lessons, setLessons]   = useState<LessonSummary[]>([]);
  const [loading, setLoading]   = useState(false);

  // New lesson form state
  const [form, setForm] = useState({
    id: "", title: "", chapterId: "chap_1", estimatedMinutes: "20",
    architectureUrl: "", practiceUrl: "", videoUrl: "", locked: false,
  });
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");
  const [formOk, setFormOk]   = useState("");
  const [clashId, setClashId] = useState("");

  const [merging, setMerging]   = useState(false);
  const [mergeMsg, setMergeMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const refreshGrades = useCallback(() => {
    apiFetch("/api/editor/grades")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data.length > 0) {
          setGrades(j.data);
          setSelected((current) => current || j.data[0].id);
        }
      });
  }, []);

  useEffect(() => { refreshGrades(); }, [refreshGrades]);

  const loadLessons = useCallback((gradeId: string) => {
    if (!gradeId) return;
    setLoading(true);
    apiFetch(`/api/editor/lessons/${gradeId}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setLessons(j.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadLessons(selected); }, [selected, loadLessons]);

  const duplicates = lessons.filter((l) => l.duplicateOf);

  async function deleteLesson(lessonId: string) {
    if (!confirm(`Delete lesson "${lessonId}"?`)) return;
    const r = await apiFetch(`/api/editor/lessons/${selected}/${lessonId}`, { method: "DELETE" }).then((r) => r.json());
    if (r.success) { loadLessons(selected); refreshGrades(); } else alert(r.message);
  }

  async function mergeDuplicates() {
    const count = duplicates.length;
    if (!confirm(`Merge ${count} duplicate lesson${count === 1 ? "" : "s"}? Each lesson stays in its original place with the newest links, and the extra copy is removed for students.`)) return;
    setMerging(true); setMergeMsg(null);
    try {
      const r = await apiFetch(`/api/editor/lessons/${selected}/merge-duplicates`, { method: "POST" }).then((r) => r.json());
      setMergeMsg({ type: r.success ? "ok" : "err", text: r.message });
      if (r.success) { loadLessons(selected); refreshGrades(); }
    } catch {
      setMergeMsg({ type: "err", text: "Network error — nothing was merged." });
    } finally {
      setMerging(false);
    }
  }

  async function createLesson(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(""); setFormOk(""); setClashId(""); setSaving(true);
    const r = await apiFetch(`/api/editor/lessons/${selected}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        estimatedMinutes: parseInt(form.estimatedMinutes, 10) || 20,
      }),
    }).then((r) => r.json());
    setSaving(false);
    if (r.success) {
      setFormOk(`Lesson "${form.id}" created!`);
      setForm({ id: "", title: "", chapterId: "chap_1", estimatedMinutes: "20", architectureUrl: "", practiceUrl: "", videoUrl: "", locked: false });
      loadLessons(selected);
      refreshGrades();
    } else {
      setFormErr(r.message);
      setClashId(r.data?.id ?? "");
    }
  }

  function field(key: keyof typeof form, label: string, placeholder: string, type = "text") {
    return (
      <div className="ed-field">
        <label className="ed-label">{label}</label>
        <input
          className="ed-input"
          type={type}
          placeholder={placeholder}
          value={String(form[key])}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <div className="ed-page">
      <div className="ed-page-header">
        <div>
          <h2 className="ed-page-title">Lessons</h2>
          <p className="ed-page-sub">Create and manage individual lessons within each grade.</p>
        </div>
      </div>

      {/* Grade tabs */}
      <div className="ed-grade-tabs">
        {grades.map((g) => (
          <button
            key={g.id}
            className={`ed-grade-tab${selected === g.id ? " active" : ""}`}
            onClick={() => { setSelected(g.id); setMergeMsg(null); }}
          >
            {g.label} <span className="ed-grade-tab-count">{g.lessonCount}</span>
          </button>
        ))}
      </div>

      {/* Create form */}
      <div className="ed-panel">
        <div className="ed-panel-header">
          <span className="ed-panel-title">➕ New Lesson — {selected.replace("grade", "Grade ")}</span>
        </div>
        <div className="ed-panel-body">
          <form className="ed-form-grid" onSubmit={createLesson}>
            {field("id",    "Lesson ID",    "place-value-tens-and-ones")}
            {field("title", "Title",        "Place Value: Tens and Ones")}
            {field("chapterId", "Chapter ID", "chap_1")}
            {field("estimatedMinutes", "Est. Minutes", "20", "number")}
            {field("architectureUrl", "Architecture URL", "https://...")}
            {field("practiceUrl",    "Practice URL",     "https://...")}
            {field("videoUrl",       "Video URL",        "https://...")}
            <div className="ed-field ed-field-check">
              <label className="ed-check-label">
                <input type="checkbox" checked={form.locked}
                  onChange={(e) => setForm((f) => ({ ...f, locked: e.target.checked }))} />
                Start as locked
              </label>
            </div>
            <div className="ed-form-actions">
              <button className="ed-btn-primary" disabled={saving}>
                {saving ? "Creating…" : "Create Lesson"}
              </button>
            </div>
          </form>
          {formErr && (
            <p className="ed-error-msg">
              {formErr}{" "}
              {clashId && <Link href={`/editor/lessons/${selected}/${clashId}`}>Edit that lesson →</Link>}
            </p>
          )}
          {formOk  && <p className="ed-success-txt">{formOk}</p>}
        </div>
      </div>

      {/* Lessons added twice before duplicates were refused */}
      {duplicates.length > 0 && (
        <div className="ed-notice">
          <div>
            <strong>⚠️ {duplicates.length} duplicate lesson{duplicates.length === 1 ? "" : "s"} in {selected.replace("grade", "Grade ")}</strong>
            Students see these twice. Merging keeps each lesson in its original place with the newest links.
          </div>
          <button type="button" className="ed-btn-primary" onClick={mergeDuplicates} disabled={merging}>
            {merging ? "Merging…" : "Merge duplicates"}
          </button>
        </div>
      )}
      {mergeMsg && <p className={mergeMsg.type === "ok" ? "ed-success-txt" : "ed-error-msg"} role="status">{mergeMsg.text}</p>}

      {/* Lessons table */}
      <div className="ed-panel">
        <div className="ed-panel-header">
          <span className="ed-panel-title">
            📝 Lessons — {selected.replace("grade", "Grade ")} ({lessons.length})
          </span>
          <button className="ed-panel-link" onClick={() => loadLessons(selected)}>↻ Refresh</button>
        </div>
        <div className="ed-table-wrap">
          {loading ? (
            <div className="ed-empty">Loading…</div>
          ) : lessons.length === 0 ? (
            <div className="ed-empty">No lessons yet — create one above.</div>
          ) : (
            <table className="ed-table">
              <thead>
                <tr>
                  <th>ID</th><th>Title</th><th>Chapter</th><th>Time</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.id}>
                    <td><code className="ed-code">{l.id}</code></td>
                    <td>
                      {l.title}
                      {l.duplicateOf && <span className="ed-tag warn" title={`Repeats ${l.duplicateOf}`}>Duplicate</span>}
                      {l.sharesTitle && (
                        <span className="ed-tag warn" title="Several lessons have this title, so this one can't be merged automatically. Rename or delete it.">
                          Same title
                        </span>
                      )}
                    </td>
                    <td><span className="ed-tag">{l.chapterId}</span></td>
                    <td>{l.estimatedMinutes} min</td>
                    <td>
                      <span className={`ed-tag${l.locked ? " locked" : " active"}`}>
                        {l.locked ? "🔒 Locked" : "✅ Active"}
                      </span>
                    </td>
                    <td className="ed-actions-cell">
                      <Link href={`/editor/lessons/${selected}/${l.id}`} className="ed-btn-sm">✏️ Edit</Link>
                      {/* A lesson never saved here is only in the curriculum: nothing to delete yet. */}
                      {l.hasFile && <button className="ed-btn-sm danger" onClick={() => deleteLesson(l.id)}>🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LessonsPage() {
  return (
    <Suspense fallback={<div className="ed-empty">Loading…</div>}>
      <LessonsContent />
    </Suspense>
  );
}
