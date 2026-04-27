import { useEffect, useState } from 'react';
import {
  Plus, Trash2, GraduationCap, AlertCircle, CheckCircle,
  UserCog, ChevronDown, BookOpen, Layers, FlaskConical,
  Globe, Trophy, Users, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Class, Level, Profile } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Flash = { type: 'success' | 'error'; msg: string };

const LEVEL_DISPLAY: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  'Primary School': { label: 'Primary School', icon: BookOpen, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'Junior Secondary School': { label: 'Junior Secondary', icon: Layers, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  STEM: { label: 'Senior — STEM', icon: FlaskConical, color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200' },
  'Social Science': { label: 'Senior — Social Science', icon: Globe, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  'Sports & Career': { label: 'Senior — Sports & Career', icon: Trophy, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
};

function getLevelMeta(level: Level) {
  if (level.pathway) return LEVEL_DISPLAY[level.pathway] ?? LEVEL_DISPLAY['STEM'];
  return LEVEL_DISPLAY[level.name] ?? { label: level.name, icon: GraduationCap, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' };
}

export default function AdminClasses() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<Flash | null>(null);

  const [newName, setNewName] = useState('');
  const [newLevelId, setNewLevelId] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [assigningClassId, setAssigningClassId] = useState<string | null>(null);
  const [assigningTeacherId, setAssigningTeacherId] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);

  useEffect(() => { if (profile?.school_id) load(); }, [profile?.school_id]);

  async function load() {
    const schoolId = profile!.school_id;
    const [classesRes, levelsRes, teachersRes] = await Promise.all([
      supabase.from('classes').select('*, level:levels(*)').eq('school_id', schoolId!).order('name'),
      supabase.from('levels').select('*').eq('school_id', schoolId!).order('sort_order'),
      supabase.from('profiles').select('*').eq('role', 'teacher').eq('school_id', schoolId!).order('name'),
    ]);
    setClasses(classesRes.data ?? []);
    const levelList = levelsRes.data ?? [];
    console.log("LEVELS FROM DB:", levelList);
    setLevels(levelList);
    if (levelList.length > 0 && !newLevelId) setNewLevelId(levelList[0].id);
    setTeachers(teachersRes.data ?? []);
    setLoading(false);
  }

  function toast(type: Flash['type'], msg: string) {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 3500);
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed || !newLevelId) return;
    setAdding(true);
    const { data, error } = await supabase
      .from('classes')
      .insert({ name: trimmed, level_id: newLevelId, grade: '', school_id: profile!.school_id })
      .select('*, level:levels(*)')
      .single();
    if (error) {
      toast('error', error.message);
    } else if (data) {
      setClasses(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      toast('success', `Class "${data.name}" created.`);
    }
    setAdding(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Students in this class will have their class removed.`)) return;
    setDeletingId(id);
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) toast('error', error.message);
    else {
      setClasses(prev => prev.filter(c => c.id !== id));
      toast('success', `"${name}" deleted.`);
    }
    setDeletingId(null);
  }

  async function saveAssignment(classId: string) {
    setSavingAssignment(true);
    const teacherId = assigningTeacherId || null;
    const { error } = await supabase.from('classes').update({ teacher_id: teacherId }).eq('id', classId);
    if (error) {
      toast('error', error.message);
    } else {
      setClasses(prev => prev.map(c => c.id === classId ? { ...c, teacher_id: teacherId } : c));
      toast('success', 'Teacher assignment updated.');
      setAssigningClassId(null);
    }
    setSavingAssignment(false);
  }

  function getTeacher(teacherId: string | null) {
    if (!teacherId) return null;
    return teachers.find(t => t.id === teacherId) ?? null;
  }

  // Group classes by level
  const classesByLevel = levels.reduce<Record<string, Class[]>>((acc, level) => {
    acc[level.id] = classes.filter(c => c.level_id === level.id);
    return acc;
  }, {});
  const unassigned = classes.filter(c => !c.level_id);

  const totalAssigned = classes.filter(c => !!c.teacher_id).length;
  const totalUnassigned = classes.filter(c => !c.teacher_id).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
            <p className="text-sm text-slate-500">Create classes under each level and assign class teachers</p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 flex gap-3 flex-wrap">
          {[
            { label: 'Total Classes', value: classes.length, bg: 'bg-blue-50 text-blue-700 border-blue-100' },
            { label: 'With Teacher', value: totalAssigned, bg: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
            { label: 'No Teacher', value: totalUnassigned, bg: 'bg-amber-50 text-amber-700 border-amber-100' },
            { label: 'Teachers', value: teachers.length, bg: 'bg-slate-50 text-slate-700 border-slate-100' },
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${s.bg}`}>
              <span className="text-lg font-bold">{s.value}</span>
              <span className="text-xs font-medium opacity-70">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`flex items-center gap-2.5 mb-5 px-4 py-3 rounded-xl border text-sm font-medium ${
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

      {/* Create class */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Create New Class</h2>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-44">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Level</label>
            <select
              value={newLevelId}
              onChange={e => setNewLevelId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {levels.map(l => (
                <option key={l.id} value={l.id}>
                  {l.pathway ? `Senior Secondary — ${l.pathway}` : l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-44">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Class Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Grade 4A, Form 2B, 10 STEM..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newLevelId}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {adding ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>

      {/* Classes grouped by level */}
      {classes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-14 text-center">
          <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No classes yet</p>
          <p className="text-sm text-slate-400 mt-1">Use the form above to create your first class.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {levels.map(level => {
            const levelClasses = classesByLevel[level.id] ?? [];
            if (levelClasses.length === 0) return null;
            const meta = getLevelMeta(level);
            const Icon = meta.icon;
            return (
              <div key={level.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${meta.border}`}>
                {/* Level header */}
                <div className={`flex items-center gap-3 px-5 py-3.5 border-b ${meta.bg} ${meta.border}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/70`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1">
                    <span className={`font-bold text-sm ${meta.color}`}>{meta.label}</span>
                    {level.pathway && (
                      <span className="ml-2 text-xs text-slate-500">Pathway</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full bg-white/80 ${meta.color}`}>
                      {levelClasses.length} class{levelClasses.length !== 1 ? 'es' : ''}
                    </span>
                    <span className="text-xs text-slate-400">
                      {levelClasses.filter(c => !!c.teacher_id).length}/{levelClasses.length} assigned
                    </span>
                  </div>
                </div>

                {/* Class rows */}
                <div className="divide-y divide-slate-50">
                  {levelClasses.map(cls => {
                    const teacher = getTeacher(cls.teacher_id);
                    const isAssigning = assigningClassId === cls.id;
                    const studentCountForClass = 0; // Would need extra query; keep lightweight

                    return (
                      <div key={cls.id} className="px-5 py-4 group hover:bg-slate-50/60 transition">
                        <div className="flex items-center gap-3">
                          {/* Class avatar */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${meta.bg} ${meta.color}`}>
                            {cls.name.charAt(0).toUpperCase()}
                          </div>

                          {/* Class name */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm">{cls.name}</p>
                          </div>

                          {!isAssigning && (
                            <div className="flex items-center gap-2">
                              {/* Teacher badge */}
                              <button
                                onClick={() => {
                                  setAssigningClassId(cls.id);
                                  setAssigningTeacherId(cls.teacher_id ?? '');
                                }}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                                  teacher
                                    ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                }`}
                              >
                                {teacher
                                  ? <><div className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-800">{teacher.name.charAt(0)}</div>{teacher.name}</>
                                  : <><UserCog className="w-3.5 h-3.5" />Assign Teacher</>}
                                <ChevronDown className="w-3 h-3 opacity-60" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(cls.id, cls.name)}
                                disabled={deletingId === cls.id}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Assign teacher inline */}
                        {isAssigning && (
                          <div className="mt-3 pl-12 flex items-center gap-3 flex-wrap">
                            <select
                              value={assigningTeacherId}
                              onChange={e => setAssigningTeacherId(e.target.value)}
                              className="flex-1 min-w-44 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            >
                              <option value="">— No teacher —</option>
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
                              onClick={() => setAssigningClassId(null)}
                              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
                            >
                              <X className="w-4 h-4" />
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

          {/* Unassigned (no level) */}
          {unassigned.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-amber-800 text-sm">No Level Assigned</span>
              </div>
              <div className="divide-y divide-slate-50">
                {unassigned.map(cls => (
                  <div key={cls.id} className="flex items-center gap-4 px-5 py-3.5 group hover:bg-slate-50 transition">
                    <span className="flex-1 font-medium text-slate-900 text-sm">{cls.name}</span>
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

      {/* Tip */}
      {classes.length > 0 && (
        <div className="mt-5 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
          <Users className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Each class should have one assigned teacher. The teacher can then add students and enter marks for all subjects in that level.
          </p>
        </div>
      )}
    </div>
  );
}
