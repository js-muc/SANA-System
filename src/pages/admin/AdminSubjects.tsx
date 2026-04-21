import { useEffect, useState } from 'react';
import { Plus, Trash2, BookOpen, AlertCircle, CheckCircle, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Subject } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminSubjects() {
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase.from('subjects').select('*').order('name');
    setSubjects(data ?? []);
    setLoading(false);
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setError('');

    const { data, error: err } = await supabase
      .from('subjects')
      .insert({ name: trimmed, school_id: profile!.school_id })
      .select()
      .single();

    if (err) {
      setError(err.message.includes('unique') ? `"${trimmed}" already exists.` : err.message);
    } else if (data) {
      setSubjects(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      flash('Subject added successfully.');
    }
    setAdding(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will remove it from all level assignments.`)) return;
    setDeletingId(id);
    const { error: err } = await supabase.from('subjects').delete().eq('id', id);
    if (err) {
      setError(err.message);
    } else {
      setSubjects(prev => prev.filter(s => s.id !== id));
      flash('Subject deleted.');
    }
    setDeletingId(null);
  }

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }

  const filtered = subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Subjects</h1>
        </div>
        <p className="text-slate-500 ml-11">Define the subjects available in this school. Assign them to levels separately.</p>
      </div>

      {/* Add subject */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add New Subject</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => { setNewName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Mathematics, Kiswahili, CRE..."
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            {adding ? 'Adding...' : 'Add Subject'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700">{success}</p>
          </div>
        )}
      </div>

      {/* Subject list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900 text-sm">
            All Subjects <span className="text-slate-400 font-normal">({subjects.length})</span>
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            {subjects.length === 0 ? 'No subjects yet. Add one above.' : 'No subjects match your search.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(sub => (
              <div key={sub.id} className="flex items-center gap-4 px-5 py-3.5 group hover:bg-slate-50 transition">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="flex-1 font-medium text-slate-900">{sub.name}</span>
                <button
                  onClick={() => handleDelete(sub.id, sub.name)}
                  disabled={deletingId === sub.id}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
