import { useEffect, useState } from 'react';
import { Plus, Trash2, GraduationCap, AlertCircle, CheckCircle, UserCog, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Class, Level, Profile } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

function AdminClasses() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newLevelId, setNewLevelId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [assigningClassId, setAssigningClassId] = useState<string | null>(null);
  const [assigningTeacherId, setAssigningTeacherId] = useState<string>('');
  const [savingAssignment, setSavingAssignment] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [classesRes, levelsRes, teachersRes] = await Promise.all([
      supabase.from('classes').select('*, level:levels(*)').order('name'),
      supabase.from('levels').select('*').order('sort_order'),
      supabase.from('profiles').select('*').eq('role', 'teacher').order('name'),
    ]);
    setClasses(classesRes.data ?? []);
    const levelList = levelsRes.data ?? [];
    setLevels(levelList);
    if (levelList.length > 0 && !newLevelId) {
      setNewLevelId(levelList[0].id);
    }
    setTeachers(teachersRes.data ?? []);
    setLoading(false);
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed || !newLevelId) return;
    setAdding(true);
    setError('');

    const { data, error: err } = await supabase
      .from('classes')
      .insert({ name: trimmed, level_id: newLevelId, grade: '', school_id: profile!.school_id })
      .select('*, level:levels(*)')
      .single();

    if (err) {
      setError(err.message);
    } else if (data) {
      setClasses(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      flash('Class created successfully.');
    }
    setAdding(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Students assigned to this class will have their class removed.`)) return;
    setDeletingId(id);
    const { error: err } = await supabase.from('classes').delete().eq('id', id);
    if (err) {
      setError(err.message);
    } else {
      setClasses(prev => prev.filter(c => c.id !== id));
      flash('Class deleted.');
    }
    setDeletingId(null);
  }

  function openAssign(cls: Class) {
    setAssigningClassId(cls.id);
    setAssigningTeacherId(cls.teacher_id ?? '');
  }

  function cancelAssign() {
    setAssigningClassId(null);
    setAssigningTeacherId('');
  }

  async function saveAssignment(classId: string) {
    setSavingAssignment(true);
    const teacherId = assigningTeacherId || null;

    const { error: err } = await supabase
      .from('classes')
      .update({ teacher_id: teacherId })
      .eq('id', classId);

    if (err) {
      setError(err.message);
    } else {
      setClasses(prev =>
        prev.map(c => c.id === classId ? { ...c, teacher_id: teacherId } : c)
      );
      flash('Class teacher updated.');
      setAssigningClassId(null);
    }
    setSavingAssignment(false);
  }

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }

  const classesByLevel = levels.reduce<Record<string, Class[]>>((acc, level) => {
    acc[level.id] = classes.filter(c => c.level_id === level.id);
    return acc;
  }, {});
  const unassigned = classes.filter(c => !c.level_id);

  function getTeacherName(teacherId: string | null): string | null {
    if (!teacherId) return null;
    return teachers.find(t => t.id === teacherId)?.name ?? null;
  }

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
            <GraduationCap className="w-4 h-4 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
        </div>
        <p className="text-slate-500 ml-11">
          Create classes and assign a class teacher. Each teacher can only see and manage their assigned class.
        </p>
      </div>

      {/* Create class */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Create New Class</h2>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-44">
            <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Level</label>
            <select
              value={newLevelId}
              onChange={e => setNewLevelId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-44">
            <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Class Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Grade 4, Form 1A..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newLevelId}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
            >
              <Plus className="w-4 h-4" />
              {adding ? 'Creating...' : 'Create'}
            </button>
          </div>
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

      {/* Classes grouped by level */}
      {classes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No classes yet</p>
          <p className="text-sm text-slate-400 mt-1">Use the form above to create your first class.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {levels.map(level => {
            const levelClasses = classesByLevel[level.id] ?? [];
            if (levelClasses.length === 0) return null;
            return (
              <div key={level.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="font-semibold text-slate-900 text-sm">{level.name}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {levelClasses.length} class{levelClasses.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {levelClasses.map(cls => {
                    const teacherName = getTeacherName(cls.teacher_id);
                    const isAssigning = assigningClassId === cls.id;

                    return (
                      <div key={cls.id} className="px-5 py-4 group hover:bg-slate-50/60 transition">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-slate-500">
                              {cls.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="flex-1 font-medium text-slate-900">{cls.name}</span>

                          {!isAssigning && (
                            <>
                              <button
                                onClick={() => openAssign(cls)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                                  teacherName
                                    ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                }`}
                              >
                                <UserCog className="w-3.5 h-3.5" />
                                {teacherName ?? 'Assign Teacher'}
                                <ChevronDown className="w-3 h-3 opacity-60" />
                              </button>
                              <button
                                onClick={() => handleDelete(cls.id, cls.name)}
                                disabled={deletingId === cls.id}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>

                        {isAssigning && (
                          <div className="mt-3 pl-11 flex items-center gap-3 flex-wrap">
                            <select
                              value={assigningTeacherId}
                              onChange={e => setAssigningTeacherId(e.target.value)}
                              className="flex-1 min-w-44 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            >
                              <option value="">— No teacher assigned —</option>
                              {teachers.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => saveAssignment(cls.id)}
                              disabled={savingAssignment}
                              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                            >
                              {savingAssignment ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelAssign}
                              className="text-sm text-slate-500 hover:text-slate-700 px-2 py-2 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {unassigned.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-amber-800 text-sm">No Level Assigned</span>
              </div>
              <div className="divide-y divide-slate-50">
                {unassigned.map(cls => (
                  <div key={cls.id} className="flex items-center gap-4 px-5 py-3.5 group hover:bg-slate-50 transition">
                    <span className="flex-1 font-medium text-slate-900">{cls.name}</span>
                    <button
                      onClick={() => handleDelete(cls.id, cls.name)}
                      disabled={deletingId === cls.id}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default AdminClasses