import { useEffect, useState } from 'react';
import { Layers, CheckCircle, AlertCircle, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Level, Subject, LevelSubject } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminLevels() {
  const { profile } = useAuth();
  const [levels, setLevels] = useState<Level[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [levelSubjects, setLevelSubjects] = useState<LevelSubject[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [newLevelName, setNewLevelName] = useState('');
  const [addingLevel, setAddingLevel] = useState(false);
  const [deletingLevelId, setDeletingLevelId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [levelsRes, subjectsRes, lsRes] = await Promise.all([
      supabase.from('levels').select('*').order('sort_order'),
      supabase.from('subjects').select('*').order('name'),
      supabase.from('level_subjects').select('*'),
    ]);
    const levelList = levelsRes.data ?? [];
    setLevels(levelList);
    setSubjects(subjectsRes.data ?? []);
    setLevelSubjects(lsRes.data ?? []);

    if (levelList.length > 0 && !selectedLevel) {
      const firstId = levelList[0].id;
      setSelectedLevel(firstId);
      const assigned = new Set((lsRes.data ?? []).filter(ls => ls.level_id === firstId).map(ls => ls.subject_id));
      setSelectedSubjectIds(assigned);
    }
    setLoading(false);
  }

  function handleLevelChange(levelId: string) {
    setSelectedLevel(levelId);
    setError('');
    setSuccess('');
    const assigned = new Set(levelSubjects.filter(ls => ls.level_id === levelId).map(ls => ls.subject_id));
    setSelectedSubjectIds(assigned);
  }

  async function handleAddLevel() {
    const trimmed = newLevelName.trim();
    if (!trimmed) return;
    setAddingLevel(true);
    setError('');
    const { data, error: err } = await supabase
      .from('levels')
      .insert({ name: trimmed, sort_order: levels.length + 1, school_id: profile!.school_id })
      .select()
      .single();
    if (err) {
      setError(err.message);
    } else if (data) {
      const updated = [...levels, data];
      setLevels(updated);
      setNewLevelName('');
      setSelectedLevel(data.id);
      setSelectedSubjectIds(new Set());
    }
    setAddingLevel(false);
  }

  async function handleDeleteLevel(levelId: string, levelName: string) {
    if (!confirm(`Delete level "${levelName}"? Classes assigned to this level will lose their level.`)) return;
    setDeletingLevelId(levelId);
    const { error: err } = await supabase.from('levels').delete().eq('id', levelId);
    if (err) {
      setError(err.message);
    } else {
      const updated = levels.filter(l => l.id !== levelId);
      setLevels(updated);
      setLevelSubjects(prev => prev.filter(ls => ls.level_id !== levelId));
      if (selectedLevel === levelId) {
        setSelectedLevel(updated[0]?.id ?? '');
      }
    }
    setDeletingLevelId(null);
  }

  function toggleSubject(subjectId: string) {
    setSelectedSubjectIds(prev => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
    setSuccess('');
  }

  async function handleSave() {
    if (!selectedLevel) return;
    setSaving(true);
    setError('');
    setSuccess('');

    // Current assignments for this level
    const currentForLevel = levelSubjects.filter(ls => ls.level_id === selectedLevel);
    const currentIds = new Set(currentForLevel.map(ls => ls.subject_id));

    const toDelete = currentForLevel.filter(ls => !selectedSubjectIds.has(ls.subject_id)).map(ls => ls.id);
    const toInsert = [...selectedSubjectIds].filter(id => !currentIds.has(id)).map(id => ({
      level_id: selectedLevel,
      subject_id: id,
    }));

    const ops: Promise<any>[] = [];
    if (toDelete.length > 0) {
      ops.push(supabase.from('level_subjects').delete().in('id', toDelete));
    }
    if (toInsert.length > 0) {
      ops.push(supabase.from('level_subjects').insert(toInsert));
    }

    const results = await Promise.all(ops);
    const err = results.find(r => r.error)?.error;

    if (err) {
      setError(err.message);
    } else {
      // Reload level_subjects to stay in sync
      const { data } = await supabase.from('level_subjects').select('*');
      setLevelSubjects(data ?? []);
      setSuccess('Subjects updated for this level.');
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  }

  const currentLevel = levels.find(l => l.id === selectedLevel);
  const assignedCount = levelSubjects.filter(ls => ls.level_id === selectedLevel).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Level Subjects</h1>
        </div>
        <p className="text-slate-500 ml-11">
          Assign which subjects belong to each curriculum level. These determine what teachers see when entering scores.
        </p>
      </div>

      {subjects.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            No subjects have been created yet. Go to <strong>Admin → Subjects</strong> to add subjects first.
          </p>
        </div>
      )}

      {/* Add level */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add New Level</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newLevelName}
            onChange={e => { setNewLevelName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAddLevel()}
            placeholder="e.g. Lower Primary, CBC Grade 4..."
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
          />
          <button
            onClick={handleAddLevel}
            disabled={addingLevel || !newLevelName.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            {addingLevel ? 'Adding...' : 'Add Level'}
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-2 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>

      {levels.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No levels yet</p>
          <p className="text-sm text-slate-400 mt-1">Add a level above to get started.</p>
        </div>
      ) : (
      <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Level tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto">
          {levels.map(level => {
            const count = levelSubjects.filter(ls => ls.level_id === level.id).length;
            return (
              <div key={level.id} className="flex items-center group relative">
                <button
                  onClick={() => handleLevelChange(level.id)}
                  className={`px-4 py-3.5 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                    selectedLevel === level.id
                      ? 'border-blue-600 text-blue-700 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {level.name}
                  <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    selectedLevel === level.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
                <button
                  onClick={() => handleDeleteLevel(level.id, level.name)}
                  disabled={deletingLevelId === level.id}
                  className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-slate-300 hover:text-red-500 rounded transition disabled:opacity-50"
                  title="Delete level"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Subject checkboxes */}
        <div className="p-5">
          {currentLevel && (
            <p className="text-xs text-slate-500 mb-4">
              Select all subjects that <span className="font-semibold text-slate-700">{currentLevel.name}</span> students should study.
            </p>
          )}

          {subjects.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">No subjects available to assign.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {subjects.map(sub => {
                const checked = selectedSubjectIds.has(sub.id);
                return (
                  <label
                    key={sub.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                      checked
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubject(sub.id)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className="text-sm font-medium">{sub.name}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 mt-4 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-sm text-emerald-700">{success}</p>
            </div>
          )}
        </div>

        {/* Save footer */}
        <div className="px-5 pb-5 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {selectedSubjectIds.size} subject{selectedSubjectIds.size !== 1 ? 's' : ''} selected
          </p>
          <button
            onClick={handleSave}
            disabled={saving || subjects.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Assignments'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {levels.map(level => {
          const count = levelSubjects.filter(ls => ls.level_id === level.id).length;
          const levelSubjectNames = levelSubjects
            .filter(ls => ls.level_id === level.id)
            .map(ls => subjects.find(s => s.id === ls.subject_id)?.name)
            .filter(Boolean)
            .join(', ');
          return (
            <div key={level.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{level.name}</p>
              <p className="text-xl font-bold text-slate-900 mb-1">{count}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {levelSubjectNames || 'No subjects assigned'}
              </p>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
