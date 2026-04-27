import { useEffect, useState } from 'react';
import {
  Layers, CheckCircle, AlertCircle, Save, FlaskConical,
  Globe, Trophy, BookOpen, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Level, Subject, LevelSubject } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const LEVEL_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; description: string }> = {
  Primary: {
    icon: BookOpen,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    description: 'Grades 1–6 core subjects',
  },
  'Junior Secondary': {
    icon: Layers,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description: 'Grades 7–9 subjects',
  },
};

const PATHWAY_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; accent: string }> = {
  STEM: {
    icon: FlaskConical,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    accent: 'bg-blue-600',
  },
  'Social Science': {
    icon: Globe,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    accent: 'bg-amber-500',
  },
  'Sports & Career': {
    icon: Trophy,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    accent: 'bg-emerald-600',
  },
};

export default function AdminLevels() {
  const { profile } = useAuth();
  const schoolId = profile?.school_id;

  const [levels, setLevels] = useState<Level[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [levelSubjects, setLevelSubjects] = useState<LevelSubject[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLevelId, setSelectedLevelId] = useState<string>('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [levelsRes, subjectsRes, lsRes] = await Promise.all([
      supabase.from('levels').select('*').eq('school_id', schoolId!).order('sort_order'),
      supabase.from('subjects').select('*').eq('school_id', schoolId!).order('name'),
      supabase.from('level_subjects').select('*'),
    ]);
    const levelList = levelsRes.data ?? [];
    console.log("LEVELS FROM DB:", levelList);
    setLevels(levelList);
    setSubjects(subjectsRes.data ?? []);
    setLevelSubjects(lsRes.data ?? []);

    if (levelList.length > 0 && !selectedLevelId) {
      selectLevel(levelList[0].id, lsRes.data ?? []);
    }
    setLoading(false);
  }

  function selectLevel(levelId: string, lsList?: LevelSubject[]) {
    setSelectedLevelId(levelId);
    setError('');
    setSuccess('');
    const list = lsList ?? levelSubjects;
    setSelectedSubjectIds(new Set(list.filter(ls => ls.level_id === levelId).map(ls => ls.subject_id)));
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
    if (!selectedLevelId) return;
    setSaving(true);
    setError('');
    setSuccess('');

    const currentForLevel = levelSubjects.filter(ls => ls.level_id === selectedLevelId);
    const currentIds = new Set(currentForLevel.map(ls => ls.subject_id));
    const toDelete = currentForLevel.filter(ls => !selectedSubjectIds.has(ls.subject_id)).map(ls => ls.id);
    const toInsert = [...selectedSubjectIds].filter(id => !currentIds.has(id)).map(id => ({
      level_id: selectedLevelId,
      subject_id: id,
    }));

    const ops: Promise<any>[] = [];
    if (toDelete.length > 0) ops.push(supabase.from('level_subjects').delete().in('id', toDelete));
    if (toInsert.length > 0) ops.push(supabase.from('level_subjects').insert(toInsert));

    const results = await Promise.all(ops);
    const err = results.find(r => r.error)?.error;

    if (err) {
      setError(err.message);
    } else {
      const { data } = await supabase.from('level_subjects').select('*');
      setLevelSubjects(data ?? []);
      setSuccess('Subjects updated successfully.');
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  }

  // Partition levels
  const primaryLevel = levels.find(l => l.name === 'Primary' || (!l.pathway && l.sort_order === 1));
  const juniorLevel = levels.find(l => l.name === 'Junior Secondary' || (!l.pathway && l.sort_order === 2));
  const seniorLevels = levels.filter(l => l.pathway !== null);

  const selectedLevel = levels.find(l => l.id === selectedLevelId);

  function subjectCountFor(levelId: string) {
    return levelSubjects.filter(ls => ls.level_id === levelId).length;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Curriculum Levels</h1>
            <p className="text-sm text-slate-500">Assign subjects to each level and career pathway</p>
          </div>
        </div>
      </div>

      {subjects.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            No subjects have been created yet. Go to <strong>Subjects</strong> in the sidebar to add subjects first.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Level selector */}
        <div className="lg:col-span-1 space-y-3">

          {/* Primary */}
          {primaryLevel && (
            <LevelCard
              level={primaryLevel}
              selected={selectedLevelId === primaryLevel.id}
              subjectCount={subjectCountFor(primaryLevel.id)}
              onClick={() => selectLevel(primaryLevel.id)}
              icon={BookOpen}
              colorClass="text-emerald-600"
              bgClass="bg-emerald-50"
              borderClass="border-emerald-200"
              label="Primary"
              sublabel="Grades 1–6"
            />
          )}

          {/* Junior Secondary */}
          {juniorLevel && (
            <LevelCard
              level={juniorLevel}
              selected={selectedLevelId === juniorLevel.id}
              subjectCount={subjectCountFor(juniorLevel.id)}
              onClick={() => selectLevel(juniorLevel.id)}
              icon={Layers}
              colorClass="text-blue-600"
              bgClass="bg-blue-50"
              borderClass="border-blue-200"
              label="Junior Secondary"
              sublabel="Grades 7–9"
            />
          )}

          {/* Senior Secondary pathways */}
          {seniorLevels.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Senior Secondary</p>
                <p className="text-xs text-slate-400 mt-0.5">Grades 10–12 · Choose a pathway</p>
              </div>
              <div className="divide-y divide-slate-50">
                {seniorLevels.map(level => {
                  const meta = PATHWAY_META[level.pathway!] ?? PATHWAY_META['STEM'];
                  const Icon = meta.icon;
                  const count = subjectCountFor(level.id);
                  return (
                    <button
                      key={level.id}
                      onClick={() => selectLevel(level.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition group ${
                        selectedLevelId === level.id
                          ? `${meta.bg} border-l-4 ${meta.border.replace('border-', 'border-l-')}`
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${selectedLevelId === level.id ? meta.color : 'text-slate-800'}`}>
                          {level.pathway}
                        </p>
                        <p className="text-xs text-slate-400">{count} subject{count !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition ${selectedLevelId === level.id ? meta.color : 'text-slate-300 group-hover:text-slate-500'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Subject assignment panel */}
        <div className="lg:col-span-2">
          {!selectedLevelId ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center h-full flex flex-col items-center justify-center">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-slate-600">Select a level to manage its subjects</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Panel header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">
                    {selectedLevel?.pathway ? `${selectedLevel.pathway} Pathway` : selectedLevel?.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedSubjectIds.size} subject{selectedSubjectIds.size !== 1 ? 's' : ''} assigned
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || subjects.length === 0}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>

              {/* Subject grid */}
              <div className="p-6">
                {subjects.length === 0 ? (
                  <p className="text-center text-slate-400 py-10 text-sm">
                    No subjects available. Add subjects first.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {subjects.map(sub => {
                      const checked = selectedSubjectIds.has(sub.id);
                      return (
                        <label
                          key={sub.id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all select-none ${
                            checked
                              ? 'bg-blue-50 border-blue-300 shadow-sm'
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                            checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                          }`}>
                            {checked && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSubject(sub.id)}
                            className="sr-only"
                          />
                          <span className={`text-sm font-medium ${checked ? 'text-blue-900' : 'text-slate-700'}`}>
                            {sub.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

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
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Assignment Overview</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {levels.map(level => {
            const count = subjectCountFor(level.id);
            const isPathway = !!level.pathway;
            const meta = isPathway ? PATHWAY_META[level.pathway!] : null;
            const displayName = isPathway ? level.pathway! : level.name;
            return (
              <button
                key={level.id}
                onClick={() => selectLevel(level.id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedLevelId === level.id
                    ? 'border-blue-300 bg-blue-50 shadow-sm'
                    : 'border-slate-100 bg-white hover:border-slate-200 shadow-sm'
                }`}
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate mb-1">
                  {displayName}
                </p>
                <p className={`text-2xl font-bold ${meta ? meta.color : 'text-slate-900'}`}>{count}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">subject{count !== 1 ? 's' : ''}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LevelCard({
  level, selected, subjectCount, onClick,
  icon: Icon, colorClass, bgClass, borderClass, label, sublabel,
}: {
  level: Level; selected: boolean; subjectCount: number; onClick: () => void;
  icon: React.ElementType; colorClass: string; bgClass: string; borderClass: string;
  label: string; sublabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all shadow-sm ${
        selected ? `${bgClass} ${borderClass}` : 'bg-white border-slate-100 hover:border-slate-200'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgClass}`}>
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${selected ? colorClass : 'text-slate-900'}`}>{label}</p>
        <p className="text-xs text-slate-400">{sublabel} · {subjectCount} subject{subjectCount !== 1 ? 's' : ''}</p>
      </div>
      <ChevronRight className={`w-4 h-4 shrink-0 ${selected ? colorClass : 'text-slate-300'}`} />
    </button>
  );
}
