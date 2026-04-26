// AdminSubjects.tsx — Admin curriculum management
// Three-level hierarchy: Learning Areas (Subjects) → Strands → Sub-strands
// Admin creates the structure here; teachers fill in student progress.

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, Search, BookOpen,
  Layers, Atom, ChevronRight, ChevronDown, AlertCircle,
  CheckCircle2, GripVertical, FolderOpen, Folder,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Subject, Strand, SubStrand } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type Flash = { type: 'success' | 'error'; msg: string };

// ── Inline name editor ────────────────────────────────────────────────────────

function InlineEdit({
  value,
  onCommit,
  onCancel,
  size = 'md',
}: {
  value: string;
  onCommit: (v: string) => Promise<void>;
  onCancel: () => void;
  size?: 'sm' | 'md';
}) {
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  async function commit() {
    const t = val.trim();
    if (!t || t === value) { onCancel(); return; }
    setSaving(true);
    await onCommit(t);
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        className={`flex-1 border-2 border-blue-400 rounded-lg bg-white focus:outline-none focus:border-blue-500 ${
          size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
        }`}
      />
      <button
        onClick={commit}
        disabled={saving}
        className="w-6 h-6 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shrink-0"
      >
        {saving
          ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
          : <Check className="w-3 h-3" />}
      </button>
      <button
        onClick={onCancel}
        className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Quick-add input ───────────────────────────────────────────────────────────

function QuickAdd({
  placeholder,
  onAdd,
  autoFocus = false,
}: {
  placeholder: string;
  onAdd: (name: string) => Promise<void>;
  autoFocus?: boolean;
}) {
  const [val, setVal] = useState('');
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  async function submit() {
    const t = val.trim();
    if (!t) return;
    setAdding(true);
    await onAdd(t);
    setVal('');
    setAdding(false);
    ref.current?.focus();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
      />
      <button
        onClick={submit}
        disabled={adding || !val.trim()}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm shrink-0"
      >
        {adding
          ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
          : <Plus className="w-3 h-3" />}
        Add
      </button>
    </div>
  );
}

// ── CBC level badge ────────────────────────────────────────────────────────────

function CountPill({ n, label }: { n: number; label: string }) {
  return (
    <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
      {n} {label}{n !== 1 ? 's' : ''}
    </span>
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
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState<Flash | null>(null);

  // Track which subject panels are open
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());
  // Track which strand sub-strand lists are open
  const [openStrands, setOpenStrands] = useState<Set<string>>(new Set());

  // Inline editing state: key = id, value = true
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editingStrand, setEditingStrand] = useState<string | null>(null);
  const [editingSubStrand, setEditingSubStrand] = useState<string | null>(null);

  // Show add-strand form inside subject
  const [addStrandInSubject, setAddStrandInSubject] = useState<string | null>(null);
  // Show add-sub-strand form inside strand
  const [addSubStrandInStrand, setAddSubStrandInStrand] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    type: 'subject' | 'strand' | 'substrand';
  }   | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [s, st, ss] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('strands').select('*').eq('school_id', schoolId).order('sort_order'),
      supabase.from('sub_strands').select('*').eq('school_id', schoolId).order('sort_order'),
    ]);
    setSubjects(s.data ?? []);
    setStrands(st.data ?? []);
    setSubStrands(ss.data ?? []);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  function toast(type: Flash['type'], msg: string) {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 3500);
  }

  function toggleSubject(id: string) {
    setOpenSubjects(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleStrand(id: string) {
    setOpenStrands(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // ── Subject CRUD ────────────────────────────────────────────────────────────

  async function addSubject(name: string) {
    const { data, error } = await supabase
      .from('subjects').insert({ name, school_id: schoolId }).select().single();
    if (error) { toast('error', error.message.includes('unique') ? `"${name}" already exists.` : error.message); return; }
    if (data) {
      setSubjects(p => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
      toast('success', `Learning area "${name}" added.`);
    }
  }

  async function renameSubject(id: string, name: string) {
    const { error } = await supabase.from('subjects').update({ name }).eq('id', id);
    if (error) { toast('error', error.message); return; }
    setSubjects(p => p.map(s => s.id === id ? { ...s, name } : s));
    setEditingSubject(null);
    toast('success', 'Learning area renamed.');
  }

  async function deleteSubject(id: string, name: string) {
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) { toast('error', error.message); return; }
    setSubjects(p => p.filter(s => s.id !== id));
    setStrands(p => p.filter(s => s.subject_id !== id));
    toast('success', `"${name}" deleted.`);
  }

  // ── Strand CRUD ─────────────────────────────────────────────────────────────

  async function addStrand(subjectId: string, name: string) {
    const order = strands.filter(s => s.subject_id === subjectId).length;
    const { data, error } = await supabase
      .from('strands')
      .insert({ name, subject_id: subjectId, school_id: schoolId, sort_order: order })
      .select().single();
    if (error) { toast('error', error.message.includes('unique') ? `"${name}" already exists.` : error.message); return; }
    if (data) {
      setStrands(p => [...p, data]);
      if (!openSubjects.has(subjectId)) setOpenSubjects(p => new Set([...p, subjectId]));
      toast('success', `Strand "${name}" added.`);
    }
  }

  async function renameStrand(id: string, name: string) {
    const { error } = await supabase.from('strands').update({ name }).eq('id', id);
    if (error) { toast('error', error.message); return; }
    setStrands(p => p.map(s => s.id === id ? { ...s, name } : s));
    setEditingStrand(null);
    toast('success', 'Strand renamed.');
  }

  async function deleteStrand(id: string, name: string) {
    const { error } = await supabase.from('strands').delete().eq('id', id);
    if (error) { toast('error', error.message); return; }
    setStrands(p => p.filter(s => s.id !== id));
    setSubStrands(p => p.filter(ss => ss.strand_id !== id));
    toast('success', `Strand "${name}" deleted.`);
  }

  // ── Sub-strand CRUD ─────────────────────────────────────────────────────────

  async function addSubStrand(strandId: string, name: string) {
    const order = subStrands.filter(ss => ss.strand_id === strandId).length;
    const { data, error } = await supabase
      .from('sub_strands')
      .insert({ name, strand_id: strandId, school_id: schoolId, sort_order: order })
      .select().single();
    if (error) { toast('error', error.message.includes('unique') ? `"${name}" already exists.` : error.message); return; }
    if (data) {
      setSubStrands(p => [...p, data]);
      if (!openStrands.has(strandId)) setOpenStrands(p => new Set([...p, strandId]));
      toast('success', `Sub-strand "${name}" added.`);
    }
  }

  async function renameSubStrand(id: string, name: string) {
    const { error } = await supabase.from('sub_strands').update({ name }).eq('id', id);
    if (error) { toast('error', error.message); return; }
    setSubStrands(p => p.map(ss => ss.id === id ? { ...ss, name } : ss));
    setEditingSubStrand(null);
    toast('success', 'Sub-strand renamed.');
  }

  async function deleteSubStrand(id: string, name: string) {
    
    const { data, error } = await supabase
      .from('sub_strands')
      .delete()
      .eq('id', id)
      .select();
 
 console.log("DELETE RESULT:", { data, error });

 if (error) {
   toast('error', error.message);
   return;
 }

 if (!data || data.length === 0) {
   toast('error', 'Delete failed: no rows affected.');
   return;
 }
    setSubStrands(p => p.filter(ss => ss.id !== id));
    toast('success', `Sub-strand "${name}" deleted.`);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const filtered = subjects.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalStrands = strands.length;
  const totalSubStrands = subStrands.length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Curriculum Setup</h1>
            <p className="text-sm text-slate-500">
              Manage learning areas, strands, and sub-strands. Teachers use this structure to track learner progress.
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 flex gap-3 flex-wrap">
          {[
            { icon: BookOpen, label: 'Learning Areas', count: subjects.length, color: 'bg-blue-50 text-blue-700 border-blue-100' },
            { icon: Layers, label: 'Strands', count: totalStrands, color: 'bg-slate-50 text-slate-700 border-slate-100' },
            { icon: Atom, label: 'Sub-strands', count: totalSubStrands, color: 'bg-slate-50 text-slate-700 border-slate-100' },
          ].map(({ icon: Icon, label, count, color }) => (
            <div key={label} className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border ${color}`}>
              <Icon className="w-4 h-4 opacity-70" />
              <span className="text-sm font-semibold">{count}</span>
              <span className="text-xs opacity-70">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flash toast */}
      {flash && (
        <div className={`flex items-center gap-2.5 mb-5 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
          flash.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {flash.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {flash.msg}
        </div>
      )}

      {/* Add subject card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Add New Learning Area
        </p>
        <QuickAdd placeholder="e.g. Mathematics, English, Science & Technology…" onAdd={addSubject} />
      </div>

      {/* Subject list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* List toolbar */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search learning areas…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {subjects.length}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
              <FolderOpen className="w-6 h-6 text-slate-300" />
            </div>
            <p className="font-medium text-slate-500">
              {subjects.length === 0 ? 'No learning areas yet' : 'No results for your search'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {subjects.length === 0 ? 'Add your first learning area above.' : 'Try a different keyword.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {filtered.map(subject => {
              const subjectStrands = strands.filter(s => s.subject_id === subject.id);
              const isOpen = openSubjects.has(subject.id);
              const isEditing = editingSubject === subject.id;

              return (
                <li key={subject.id}>
                  {/* ── Subject row ── */}
                  <div className="group flex items-center gap-2 px-4 py-3.5 hover:bg-slate-50 transition">
                    <button
                      onClick={() => toggleSubject(subject.id)}
                      className="text-slate-400 hover:text-slate-600 transition shrink-0"
                    >
                      {isOpen
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      {isOpen
                        ? <FolderOpen className="w-4 h-4 text-blue-600" />
                        : <Folder className="w-4 h-4 text-blue-500" />}
                    </div>

                    {isEditing ? (
                      <InlineEdit
                        value={subject.name}
                        onCommit={name => renameSubject(subject.id, name)}
                        onCancel={() => setEditingSubject(null)}
                      />
                    ) : (
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        <span
                          className="font-semibold text-slate-900 text-sm truncate cursor-pointer"
                          onClick={() => toggleSubject(subject.id)}
                        >
                          {subject.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <CountPill n={subjectStrands.length} label="strand" />
                          <span>·</span>
                          <CountPill n={subjectStrands.reduce((acc, st) => acc + subStrands.filter(ss => ss.strand_id === st.id).length, 0)} label="sub-strand" />
                        </div>
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <ActionButton
                          icon={Plus}
                          label="Add strand"
                          onClick={() => {
                            setAddStrandInSubject(s => s === subject.id ? null : subject.id);
                            if (!openSubjects.has(subject.id)) toggleSubject(subject.id);
                          }}
                        />
                        <ActionButton icon={Pencil} label="Rename" onClick={() => setEditingSubject(subject.id)} />
                        <ActionButton icon={Trash2} label="Delete" danger onClick={() => setDeleteTarget({ id: subject.id, name: subject.name, type: 'subject' })} />
                      </div>
                    )}
                  </div>

                  {/* ── Expanded: strands list ── */}
                  {isOpen && (
                    <div className="border-t border-slate-50 bg-slate-50/50">
                      {/* Add strand form */}
                      {addStrandInSubject === subject.id && (
                        <div className="flex items-center gap-3 pl-14 pr-4 py-3 border-b border-slate-100 bg-blue-50/40">
                          <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <QuickAdd
                            placeholder="New strand name… (e.g. Numbers, Geometry)"
                            onAdd={async name => { await addStrand(subject.id, name); }}
                            autoFocus
                          />
                          <button onClick={() => setAddStrandInSubject(null)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {subjectStrands.length === 0 && addStrandInSubject !== subject.id ? (
                        <div className="pl-14 pr-4 py-4">
                          <button
                            onClick={() => { setAddStrandInSubject(subject.id); }}
                            className="flex items-center gap-2 text-xs text-blue-500 hover:text-blue-700 font-medium transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add the first strand for {subject.name}
                          </button>
                        </div>
                      ) : (
                        <ul>
                          {subjectStrands.map(strand => {
                            const strandSubStrands = subStrands.filter(ss => ss.strand_id === strand.id);
                            const isStrandOpen = openStrands.has(strand.id);
                            const isStrandEditing = editingStrand === strand.id;

                            return (
                              <li key={strand.id} className="border-t border-slate-100 first:border-0">
                                {/* ── Strand row ── */}
                                <div className="group flex items-center gap-2 pl-10 pr-4 py-3 hover:bg-white transition">
                                  <button
                                    onClick={() => toggleStrand(strand.id)}
                                    className="text-slate-300 hover:text-slate-500 transition shrink-0"
                                  >
                                    {isStrandOpen
                                      ? <ChevronDown className="w-3.5 h-3.5" />
                                      : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>

                                  <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                    <Layers className="w-3 h-3 text-slate-400" />
                                  </div>

                                  {isStrandEditing ? (
                                    <InlineEdit
                                      value={strand.name}
                                      onCommit={name => renameStrand(strand.id, name)}
                                      onCancel={() => setEditingStrand(null)}
                                      size="sm"
                                    />
                                  ) : (
                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                      <span
                                        className="text-sm font-medium text-slate-700 truncate cursor-pointer"
                                        onClick={() => toggleStrand(strand.id)}
                                      >
                                        {strand.name}
                                      </span>
                                      <CountPill n={strandSubStrands.length} label="sub-strand" />
                                    </div>
                                  )}

                                  {!isStrandEditing && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                                      <ActionButton
                                        icon={Plus}
                                        label="Add sub-strand"
                                        size="sm"
                                        onClick={() => {
                                          setAddSubStrandInStrand(s => s === strand.id ? null : strand.id);
                                          if (!openStrands.has(strand.id)) toggleStrand(strand.id);
                                        }}
                                      />
                                      <ActionButton icon={Pencil} label="Rename" size="sm" onClick={() => setEditingStrand(strand.id)} />
                                      <ActionButton icon={Trash2} label="Delete" size="sm" danger onClick={() => setDeleteTarget({ id: strand.id, name: strand.name, type: 'strand' })} />
                                    </div>
                                  )}
                                </div>

                                {/* ── Expanded: sub-strands ── */}
                                {isStrandOpen && (
                                  <div className="bg-white border-t border-slate-50">
                                    {/* Add sub-strand form */}
                                    {addSubStrandInStrand === strand.id && (
                                      <div className="flex items-center gap-3 pl-20 pr-4 py-2.5 bg-blue-50/40 border-b border-slate-100">
                                        <Atom className="w-3 h-3 text-blue-400 shrink-0" />
                                        <QuickAdd
                                          placeholder="New sub-strand… (e.g. Fractions, Decimals)"
                                          onAdd={async name => { await addSubStrand(strand.id, name); }}
                                          autoFocus
                                        />
                                        <button onClick={() => setAddSubStrandInStrand(null)} className="text-slate-400 hover:text-slate-600">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}

                                    {strandSubStrands.length === 0 && addSubStrandInStrand !== strand.id ? (
                                      <div className="pl-20 pr-4 py-3">
                                        <button
                                          onClick={() => setAddSubStrandInStrand(strand.id)}
                                          className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium transition"
                                        >
                                          <Plus className="w-3 h-3" />
                                          Add first sub-strand
                                        </button>
                                      </div>
                                    ) : (
                                      <ul>
                                        {strandSubStrands.map(ss => (
                                          <li
                                            key={ss.id}
                                            className="group flex items-center gap-2 pl-20 pr-4 py-2.5 border-t border-slate-50 hover:bg-slate-50 transition"
                                          >
                                            <GripVertical className="w-3 h-3 text-slate-200 shrink-0" />
                                            <div className="w-5 h-5 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                              <Atom className="w-2.5 h-2.5 text-slate-400" />
                                            </div>
                                            

                                            {editingSubStrand === ss.id ? (
                                              <InlineEdit
                                                value={ss.name}
                                                onCommit={name => renameSubStrand(ss.id, name)}
                                                onCancel={() => setEditingSubStrand(null)}
                                                size="sm"
                                              />
                                            ) : (
                                              <span className="flex-1 text-xs text-slate-600 font-medium truncate">
                                                {ss.name}
                                              </span>
                                            )}

                                            {editingSubStrand !== ss.id && (
                                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                                                <ActionButton icon={Pencil} label="Rename" size="xs" onClick={() => setEditingSubStrand(ss.id)} />
                                                <ActionButton icon={Trash2} label="Delete" size="xs" danger onClick={() => setDeleteTarget({ id: ss.id, name: ss.name, type: 'substrand' })} />
                                              </div>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {subjects.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-4">
            <p className="text-xs text-slate-400">
              {subjects.length} learning area{subjects.length !== 1 ? 's' : ''}
              {' · '}
              {totalStrands} strand{totalStrands !== 1 ? 's' : ''}
              {' · '}
              {totalSubStrands} sub-strand{totalSubStrands !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Help callout */}
      <div className="mt-5 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
        <p className="text-xs font-semibold text-blue-700 mb-1">How this works</p>
        <p className="text-xs text-blue-600 leading-relaxed">
          Structure your curriculum here first. Once you add strands and sub-strands to a learning area,
          class teachers can open <strong>Tracking Progress</strong> to select a student, pick the sub-strand,
          enter a competency score, and get an AI-generated CBC comment — ready to share with parents.
        </p>
      </div>
      {deleteTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-2xl shadow-xl p-6 w-[90%] max-w-sm text-center">

      <h3 className="text-lg font-bold text-slate-900 mb-2">
        {deleteTarget.type === 'subject' && 'Delete Learning Area'}
        {deleteTarget.type === 'strand' && 'Delete Strand'}
        {deleteTarget.type === 'substrand' && 'Delete Sub-strand'}
      </h3>

      <p className="text-sm text-slate-600 mb-4">
        Are you sure you want to delete
        <br />
        <span className="font-semibold">"{deleteTarget.name}"</span>?
        <br />
        {deleteTarget.type === 'subject' && (
        <span className="text-xs text-red-500">All strands and sub-strands will also be removed.</span>
       )}
       {deleteTarget.type === 'strand' && (
       <span className="text-xs text-red-500">All sub-strands under this strand will be removed.</span>
       )}
     </p>

      <div className="flex gap-2 justify-center">

        <button
          onClick={() => setDeleteTarget(null)}
          className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
        >
          Cancel
        </button>

        <button
          onClick={async () => {
            const { id, name, type } = deleteTarget;
            setDeleteTarget(null);
          
            if (type === 'substrand') {
              await deleteSubStrand(id, name);
            } else if (type === 'strand') {
              await deleteStrand(id, name);
            } else if (type === 'subject') {
              await deleteSubject(id, name);
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Delete
        </button>

      </div>
    </div>
  </div>
)}
    </div>
  );
}

// ── Tiny action button ────────────────────────────────────────────────────────

function ActionButton({
  icon: Icon, label, onClick, danger = false, size = 'md',
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
  size?: 'xs' | 'sm' | 'md';
}) {
  const pad = size === 'xs' ? 'p-1' : 'p-1.5';
  const iconSz = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <button
      onClick={onClick}
      title={label}
      className={`${pad} rounded-lg transition ${
        danger
          ? 'text-slate-300 hover:text-red-500 hover:bg-red-50'
          : 'text-slate-300 hover:text-blue-600 hover:bg-blue-50'
      }`}
    >
      <Icon className={iconSz} />
    </button>
  );
}
