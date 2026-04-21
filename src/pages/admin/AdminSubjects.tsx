// AdminSubjects.tsx
// Manage school subjects + their strands and sub-strands.
// Admin can: create/edit/delete subjects, create/edit/delete strands per subject,
//            create/edit/delete sub-strands per strand.

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, BookOpen, AlertCircle, CheckCircle, Search,
  ChevronDown, ChevronRight, Pencil, X, Layers, Atom, Save,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Subject, Strand, SubStrand } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Inline editable name row ──────────────────────────────────────────────────

function EditableRow({
  name, onSave, onDelete, indent = 0,
  addChildLabel, onAddChild, children, defaultOpen = false,
}: {
  name: string;
  onSave: (newName: string) => Promise<void>;
  onDelete: () => Promise<void>;
  indent?: number;
  addChildLabel?: string;
  onAddChild?: () => void;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(name);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  async function commitEdit() {
    const trimmed = editVal.trim();
    if (!trimmed || trimmed === name) { setEditing(false); setEditVal(name); return; }
    setSaving(true);
    await onSave(trimmed);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2.5 px-3 rounded-xl group hover:bg-slate-50 transition ${
          indent === 1 ? 'ml-4' : indent === 2 ? 'ml-8' : ''
        }`}
      >
        {children && (
          <button onClick={() => setOpen(o => !o)} className="p-0.5 text-slate-400 hover:text-slate-600 transition shrink-0">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
        {!children && <div className="w-4 shrink-0" />}

        {editing ? (
          <input
            autoFocus
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(false); setEditVal(name); } }}
            className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        ) : (
          <span className={`flex-1 text-sm font-medium text-slate-900 truncate ${indent > 0 ? 'text-slate-700' : ''}`}>{name}</span>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
          {editing ? (
            <>
              <button onClick={commitEdit} disabled={saving} className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50">
                {saving ? <div className="w-3.5 h-3.5 border border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setEditing(false); setEditVal(name); }} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg transition">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              {addChildLabel && onAddChild && (
                <button onClick={onAddChild} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title={`Add ${addChildLabel}`}>
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => { setEditing(true); setEditVal(name); }} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {children && open && <div>{children}</div>}
    </div>
  );
}

// ── Inline add form ───────────────────────────────────────────────────────────

function AddForm({
  placeholder, onAdd, indent = 0,
}: {
  placeholder: string;
  onAdd: (name: string) => Promise<void>;
  indent?: number;
}) {
  const [val, setVal] = useState('');
  const [adding, setAdding] = useState(false);

  async function submit() {
    const trimmed = val.trim();
    if (!trimmed) return;
    setAdding(true);
    await onAdd(trimmed);
    setVal('');
    setAdding(false);
  }

  return (
    <div className={`flex items-center gap-2 py-2 px-3 ${indent === 1 ? 'ml-4' : indent === 2 ? 'ml-8' : ''}`}>
      <div className="w-4 shrink-0" />
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
      />
      <button
        onClick={submit}
        disabled={adding || !val.trim()}
        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition"
      >
        {adding ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3 h-3" />}
        Add
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminSubjects() {
  const { profile } = useAuth();
  const schoolId = profile?.school_id!;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [strands, setStrands] = useState<Strand[]>([]);
  const [subStrands, setSubStrands] = useState<SubStrand[]>([]);
  const [loading, setLoading] = useState(true);

  const [newSubjectName, setNewSubjectName] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);
  const [search, setSearch] = useState('');

  // Which subjects have their strand list expanded
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  // Which strands have their sub-strand add form visible
  const [addSubStrandFor, setAddSubStrandFor] = useState<string | null>(null);
  // Which subjects have their add-strand form visible
  const [addStrandFor, setAddStrandFor] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [subjectsRes, strandsRes, subStrandsRes] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('strands').select('*').eq('school_id', schoolId).order('sort_order'),
      supabase.from('sub_strands').select('*').eq('school_id', schoolId).order('sort_order'),
    ]);
    setSubjects(subjectsRes.data ?? []);
    setStrands(strandsRes.data ?? []);
    setSubStrands(subStrandsRes.data ?? []);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  function showFlash(type: 'success' | 'error', msg: string) {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 3000);
  }

  // ── Subject CRUD ──────────────────────────────────────────────────────────

  async function addSubject() {
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    setAddingSubject(true);
    const { data, error } = await supabase
      .from('subjects').insert({ name: trimmed, school_id: schoolId }).select().single();
    if (error) {
      showFlash('error', error.message.includes('unique') ? `"${trimmed}" already exists.` : error.message);
    } else if (data) {
      setSubjects(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSubjectName('');
      showFlash('success', 'Subject added.');
    }
    setAddingSubject(false);
  }

  async function editSubject(id: string, name: string) {
    const { error } = await supabase.from('subjects').update({ name }).eq('id', id);
    if (error) { showFlash('error', error.message); return; }
    setSubjects(prev => prev.map(s => s.id === id ? { ...s, name } : s));
    showFlash('success', 'Subject updated.');
  }

  async function deleteSubject(id: string, name: string) {
    if (!confirm(`Delete subject "${name}"? All its strands and sub-strands will also be deleted.`)) return;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) { showFlash('error', error.message); return; }
    setSubjects(prev => prev.filter(s => s.id !== id));
    setStrands(prev => prev.filter(s => s.subject_id !== id));
    showFlash('success', 'Subject deleted.');
  }

  // ── Strand CRUD ───────────────────────────────────────────────────────────

  async function addStrand(subjectId: string, name: string) {
    const sortOrder = strands.filter(s => s.subject_id === subjectId).length;
    const { data, error } = await supabase
      .from('strands')
      .insert({ name, subject_id: subjectId, school_id: schoolId, sort_order: sortOrder })
      .select().single();
    if (error) { showFlash('error', error.message.includes('unique') ? `"${name}" already exists.` : error.message); return; }
    if (data) { setStrands(prev => [...prev, data]); showFlash('success', 'Strand added.'); }
  }

  async function editStrand(id: string, name: string) {
    const { error } = await supabase.from('strands').update({ name }).eq('id', id);
    if (error) { showFlash('error', error.message); return; }
    setStrands(prev => prev.map(s => s.id === id ? { ...s, name } : s));
    showFlash('success', 'Strand updated.');
  }

  async function deleteStrand(id: string, name: string) {
    if (!confirm(`Delete strand "${name}"? All sub-strands will also be deleted.`)) return;
    const { error } = await supabase.from('strands').delete().eq('id', id);
    if (error) { showFlash('error', error.message); return; }
    setStrands(prev => prev.filter(s => s.id !== id));
    setSubStrands(prev => prev.filter(ss => ss.strand_id !== id));
    showFlash('success', 'Strand deleted.');
  }

  // ── Sub-strand CRUD ───────────────────────────────────────────────────────

  async function addSubStrand(strandId: string, name: string) {
    const sortOrder = subStrands.filter(ss => ss.strand_id === strandId).length;
    const { data, error } = await supabase
      .from('sub_strands')
      .insert({ name, strand_id: strandId, school_id: schoolId, sort_order: sortOrder })
      .select().single();
    if (error) { showFlash('error', error.message.includes('unique') ? `"${name}" already exists.` : error.message); return; }
    if (data) { setSubStrands(prev => [...prev, data]); showFlash('success', 'Sub-strand added.'); }
  }

  async function editSubStrand(id: string, name: string) {
    const { error } = await supabase.from('sub_strands').update({ name }).eq('id', id);
    if (error) { showFlash('error', error.message); return; }
    setSubStrands(prev => prev.map(ss => ss.id === id ? { ...ss, name } : ss));
    showFlash('success', 'Sub-strand updated.');
  }

  async function deleteSubStrand(id: string, name: string) {
    if (!confirm(`Delete sub-strand "${name}"?`)) return;
    const { error } = await supabase.from('sub_strands').delete().eq('id', id);
    if (error) { showFlash('error', error.message); return; }
    setSubStrands(prev => prev.filter(ss => ss.id !== id));
    showFlash('success', 'Sub-strand deleted.');
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subjects</h1>
            <p className="text-sm text-slate-500">
              Manage subjects, strands, and sub-strands for this school.
            </p>
          </div>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`flex items-center gap-2 mb-4 px-4 py-3 rounded-xl border text-sm ${
          flash.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {flash.type === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {flash.msg}
        </div>
      )}

      {/* Add subject form */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add New Subject</h2>
        <div className="flex gap-3">
          <input
            type="text" value={newSubjectName}
            onChange={e => setNewSubjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSubject()}
            placeholder="e.g. Mathematics, Kiswahili, Science..."
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 transition"
          />
          <button
            onClick={addSubject}
            disabled={addingSubject || !newSubjectName.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {addingSubject ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>

      {/* Subject list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* List header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 text-sm">All Subjects</h2>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
              {subjects.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 bg-slate-50"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">
              {subjects.length === 0 ? 'No subjects yet. Add one above.' : 'No subjects match your search.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 px-2 py-2">
            {filtered.map(subject => {
              const subjectStrands = strands.filter(s => s.subject_id === subject.id);
              const isExpanded = expandedSubjects.has(subject.id);

              return (
                <div key={subject.id} className="py-1">
                  {/* Subject row */}
                  <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl group hover:bg-slate-50 transition">
                    <button
                      onClick={() => setExpandedSubjects(prev => {
                        const next = new Set(prev);
                        if (next.has(subject.id)) next.delete(subject.id); else next.add(subject.id);
                        return next;
                      })}
                      className="p-0.5 text-slate-400 hover:text-slate-600 transition shrink-0"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <span className="flex-1 text-sm font-semibold text-slate-900 truncate">{subject.name}</span>
                    <span className="text-xs text-slate-400 mr-1">{subjectStrands.length} strand{subjectStrands.length !== 1 ? 's' : ''}</span>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => setAddStrandFor(addStrandFor === subject.id ? null : subject.id)}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Add strand"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <SubjectEditDeleteButtons
                        name={subject.name}
                        onSave={name => editSubject(subject.id, name)}
                        onDelete={() => deleteSubject(subject.id, subject.name)}
                      />
                    </div>
                  </div>

                  {/* Add strand inline */}
                  {addStrandFor === subject.id && (
                    <div className="ml-4 mb-1">
                      <AddForm
                        placeholder="New strand name..."
                        onAdd={async name => { await addStrand(subject.id, name); setAddStrandFor(null); if (!expandedSubjects.has(subject.id)) setExpandedSubjects(prev => new Set([...prev, subject.id])); }}
                        indent={1}
                      />
                    </div>
                  )}

                  {/* Strands */}
                  {isExpanded && (
                    <div>
                      {subjectStrands.length === 0 ? (
                        <p className="ml-10 text-xs text-slate-400 py-2">
                          No strands yet — click <Plus className="w-3 h-3 inline" /> to add one.
                        </p>
                      ) : subjectStrands.map(strand => {
                        const strandSubStrands = subStrands.filter(ss => ss.strand_id === strand.id);
                        return (
                          <div key={strand.id}>
                            {/* Strand row */}
                            <div className="flex items-center gap-2 py-2 px-3 ml-4 rounded-xl group hover:bg-slate-50 transition">
                              <button
                                onClick={() => setAddSubStrandFor(addSubStrandFor === strand.id ? null : strand.id)}
                                className="p-0.5 text-slate-400 hover:text-slate-600 transition shrink-0"
                              >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${addSubStrandFor === strand.id ? 'rotate-90' : ''}`} />
                              </button>
                              <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                <Layers className="w-3 h-3 text-slate-500" />
                              </div>
                              <span className="flex-1 text-sm font-medium text-slate-700 truncate">{strand.name}</span>
                              <span className="text-xs text-slate-400 mr-1">{strandSubStrands.length}</span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                <button
                                  onClick={() => setAddSubStrandFor(addSubStrandFor === strand.id ? null : strand.id)}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Add sub-strand"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <SubjectEditDeleteButtons
                                  name={strand.name}
                                  onSave={name => editStrand(strand.id, name)}
                                  onDelete={() => deleteStrand(strand.id, strand.name)}
                                  small
                                />
                              </div>
                            </div>

                            {/* Add sub-strand inline */}
                            {addSubStrandFor === strand.id && (
                              <AddForm
                                placeholder="New sub-strand name..."
                                onAdd={name => addSubStrand(strand.id, name)}
                                indent={2}
                              />
                            )}

                            {/* Sub-strands */}
                            {strandSubStrands.map(ss => (
                              <div key={ss.id} className="flex items-center gap-2 py-1.5 px-3 ml-8 rounded-xl group hover:bg-slate-50 transition">
                                <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                                  <Atom className="w-2.5 h-2.5 text-slate-400" />
                                </div>
                                <span className="flex-1 text-xs font-medium text-slate-600 truncate">{ss.name}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                  <SubjectEditDeleteButtons
                                    name={ss.name}
                                    onSave={name => editSubStrand(ss.id, name)}
                                    onDelete={() => deleteSubStrand(ss.id, ss.name)}
                                    small
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {subjects.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400">
              {subjects.length} subject{subjects.length !== 1 ? 's' : ''} · {strands.length} strand{strands.length !== 1 ? 's' : ''} · {subStrands.length} sub-strand{subStrands.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline edit + delete buttons ──────────────────────────────────────────────

function SubjectEditDeleteButtons({
  name, onSave, onDelete, small = false,
}: {
  name: string;
  onSave: (newName: string) => Promise<void>;
  onDelete: () => void;
  small?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [saving, setSaving] = useState(false);
  const sz = small ? 'w-3 h-3' : 'w-3.5 h-3.5';

  async function commit() {
    const t = val.trim();
    if (!t || t === name) { setEditing(false); setVal(name); return; }
    setSaving(true);
    await onSave(t);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setVal(name); } }}
          className="border border-blue-300 rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
        />
        <button onClick={commit} disabled={saving} className="p-1 text-blue-600 hover:bg-blue-50 rounded transition">
          {saving ? <div className={`${sz} border border-blue-500 border-t-transparent rounded-full animate-spin`} /> : <Save className={sz} />}
        </button>
        <button onClick={() => { setEditing(false); setVal(name); }} className="p-1 text-slate-400 hover:bg-slate-100 rounded transition">
          <X className={sz} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setEditing(true)} className={`p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition`}>
        <Pencil className={sz} />
      </button>
      <button onClick={onDelete} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
        <Trash2 className={sz} />
      </button>
    </>
  );
}
