// SuperAdminDashboard.tsx
//
// Scope: system-level school management ONLY.
//   - Register / delete schools
//   - View admins per school, approve / reject / re-approve admin accounts
//   - Demote admin → teacher or promote teacher → admin within a school
//   - Assign orphan accounts (no school) to a school, or delete them
//   - NO student data, NO scores, NO class records
//
// Unlinked accounts (screenshot) are handled with assign-to-school or delete actions
// so the list clears down over time rather than being a permanent warning.

import { useEffect, useState } from 'react';
import {
  Building2, Users, CheckCircle, XCircle, Clock, Plus,
  Trash2, AlertCircle, Globe, Shield, ChevronDown, ChevronUp,
  UserCheck, UserX, UserCog, ArrowRight, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { School, Profile } from '../../lib/supabase';

type ProfileWithSchool = Profile & { school?: School };

type SchoolWithStats = School & {
  adminCount: number;
  teacherCount: number;
  pendingCount: number;
  admins: ProfileWithSchool[];
  teachers: ProfileWithSchool[];
};

// ── Approval status badge ─────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'approved')
    return (
      <span className="flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
        <CheckCircle className="w-3 h-3" />Approved
      </span>
    );
  if (status === 'pending')
    return (
      <span className="flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
        <Clock className="w-3 h-3" />Pending
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
      <XCircle className="w-3 h-3" />Rejected
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const [schools, setSchools] = useState<School[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);

  // Add school form
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolSlug, setNewSchoolSlug] = useState('');
  const [newSchoolCountry, setNewSchoolCountry] = useState('Kenya');
  const [addingSchool, setAddingSchool] = useState(false);

  // Add admin form
  const [addingAdminForSchool, setAddingAdminForSchool] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Orphan account actions
  const [assigningProfile, setAssigningProfile] = useState<string | null>(null); // profileId
  const [assignTargetSchool, setAssignTargetSchool] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [schoolsRes, profilesRes] = await Promise.all([
      supabase.from('schools').select('*').order('name'),
      supabase.from('profiles').select('*, school:schools(*)').order('name'),
    ]);
    setSchools(schoolsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 5000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
  }

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // ── School CRUD ────────────────────────────────────────────────────────────

  async function handleAddSchool() {
    const name = newSchoolName.trim();
    const slug = newSchoolSlug.trim() || slugify(name);
    if (!name || !slug) return;
    setAddingSchool(true);
    const { data, error: err } = await supabase
      .from('schools')
      .insert({ name, slug, country: newSchoolCountry.trim() || 'Kenya' })
      .select()
      .single();
    if (err) { flash(err.message, true); }
    else if (data) {
      setSchools(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSchoolName(''); setNewSchoolSlug(''); setNewSchoolCountry('Kenya');
      setShowAddSchool(false);
      flash('School registered successfully.');
    }
    setAddingSchool(false);
  }

  async function handleDeleteSchool(id: string, name: string) {
    if (!confirm(`Delete "${name}"?\n\nAll data linked to this school (classes, students, scores) will be permanently removed. This cannot be undone.`)) return;
    const { error: err } = await supabase.from('schools').delete().eq('id', id);
    if (err) flash(err.message, true);
    else {
      setSchools(prev => prev.filter(s => s.id !== id));
      flash('School deleted.');
    }
  }

  // ── Admin approval ─────────────────────────────────────────────────────────

  async function handleApproval(profileId: string, status: 'approved' | 'rejected') {
    const { error: err } = await supabase
      .from('profiles')
      .update({ approval_status: status })
      .eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, approval_status: status } : p));
    flash(status === 'approved' ? 'Admin approved — they can now log in.' : 'Admin account rejected.');
  }

  // ── Role changes ───────────────────────────────────────────────────────────

  async function handlePromoteToAdmin(profileId: string) {
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: 'admin', approval_status: 'approved' })
      .eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: 'admin', approval_status: 'approved' } : p));
    flash('User promoted to school admin.');
  }

  async function handleDemoteToTeacher(profileId: string) {
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: 'teacher', approval_status: 'approved' })
      .eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: 'teacher', approval_status: 'approved' } : p));
    flash('Admin demoted to teacher.');
  }

  // ── Create admin account for a school ────────────────────────────────────

  async function handleCreateAdmin(schoolId: string, schoolName: string) {
    if (!adminName.trim() || !adminEmail.trim() || adminPassword.length < 6) {
      flash('Fill all fields and use a password of at least 6 characters.', true);
      return;
    }
    setCreatingAdmin(true);
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: adminEmail.trim(),
      password: adminPassword,
    });
    if (signUpErr) { flash(signUpErr.message, true); setCreatingAdmin(false); return; }
    if (data.user) {
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: data.user.id,
        name: adminName.trim(),
        role: 'admin',
        approval_status: 'approved',
        school_id: schoolId,
      });
      if (profileErr) { flash(profileErr.message, true); setCreatingAdmin(false); return; }
      await load();
      setAddingAdminForSchool(null);
      setAdminName(''); setAdminEmail(''); setAdminPassword('');
      flash(`Admin account created for ${adminName.trim()} at ${schoolName}.`);
    }
    setCreatingAdmin(false);
  }

  // ── Orphan account actions ─────────────────────────────────────────────────

  async function handleAssignToSchool(profileId: string, profileName: string, schoolId: string) {
    if (!schoolId) { flash('Select a school first.', true); return; }
    const { error: err } = await supabase
      .from('profiles')
      .update({ school_id: schoolId })
      .eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, school_id: schoolId } : p));
    setAssigningProfile(null);
    setAssignTargetSchool('');
    flash(`${profileName} assigned to school.`);
  }

  async function handleDeleteOrphan(profileId: string, name: string) {
    if (!confirm(`Delete account "${name}"?\nThis removes their profile from the system. This cannot be undone.`)) return;
    const { error: err } = await supabase.from('profiles').delete().eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev => prev.filter(p => p.id !== profileId));
    flash(`Account "${name}" removed.`);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const schoolStats: SchoolWithStats[] = schools.map(school => {
    const sp = profiles.filter(p => p.school_id === school.id);
    const admins = sp.filter(p => p.role === 'admin');
    const teachers = sp.filter(p => p.role === 'teacher');
    return {
      ...school,
      adminCount: admins.length,
      teacherCount: teachers.length,
      pendingCount: admins.filter(p => p.approval_status === 'pending').length,
      admins,
      teachers,
    };
  });

  // Orphan = has no school AND is not super_admin
  const orphans = profiles.filter(p => !p.school_id && p.role !== 'super_admin');
  const totalPending = profiles.filter(p => p.role === 'admin' && p.approval_status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">System Control</h1>
            <p className="text-sm text-slate-500">Manage schools and admin access across the platform.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddSchool(v => !v)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Register School
        </button>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="flex items-start gap-2.5 mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 flex-1">{error}</p>
          <button onClick={() => setError('')}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      {/* ── Pending approvals banner ── */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 mb-5 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              {totalPending} admin account{totalPending !== 1 ? 's' : ''} waiting for approval
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Expand the school below to approve or reject.</p>
          </div>
        </div>
      )}

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Schools',           value: schools.length,                                              icon: Building2, bg: 'bg-blue-50',    col: 'text-blue-600' },
          { label: 'Admin Accounts',    value: profiles.filter(p => p.role === 'admin').length,             icon: UserCog,   bg: 'bg-slate-50',   col: 'text-slate-600' },
          { label: 'Teacher Accounts',  value: profiles.filter(p => p.role === 'teacher').length,           icon: Users,     bg: 'bg-emerald-50', col: 'text-emerald-600' },
          { label: 'Pending Approvals', value: totalPending,                                                icon: Clock,     bg: 'bg-amber-50',   col: 'text-amber-600' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${stat.bg}`}>
                <Icon className={`w-4.5 h-4.5 ${stat.col}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 leading-none">{stat.value}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Orphan accounts panel ── */}
      {orphans.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">
                Accounts not linked to a school ({orphans.length})
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Assign each account to a school or remove it. These accounts cannot access student data.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {orphans.map(p => {
              const isAssigning = assigningProfile === p.id;
              return (
                <div key={p.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-slate-500">{p.name.charAt(0).toUpperCase()}</span>
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{p.role}</p>
                    </div>

                    {/* Actions */}
                    {!isAssigning ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { setAssigningProfile(p.id); setAssignTargetSchool(''); }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition"
                        >
                          <ArrowRight className="w-3 h-3" />
                          Assign to School
                        </button>
                        <button
                          onClick={() => handleDeleteOrphan(p.id, p.name)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                          title="Delete account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto mt-2 sm:mt-0">
                        <select
                          value={assignTargetSchool}
                          onChange={e => setAssignTargetSchool(e.target.value)}
                          className="flex-1 min-w-40 border border-blue-200 rounded-xl px-3 py-1.5 text-sm bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— Select school —</option>
                          {schools.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignToSchool(p.id, p.name, assignTargetSchool)}
                          disabled={!assignTargetSchool}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl transition"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Assign
                        </button>
                        <button
                          onClick={() => { setAssigningProfile(null); setAssignTargetSchool(''); }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add school form ── */}
      {showAddSchool && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700">Register New School</h2>
            <button onClick={() => setShowAddSchool(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">School Name</label>
              <input
                type="text"
                value={newSchoolName}
                onChange={e => { setNewSchoolName(e.target.value); setNewSchoolSlug(slugify(e.target.value)); }}
                placeholder="Nairobi Academy"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Slug (URL key)</label>
              <input
                type="text"
                value={newSchoolSlug}
                onChange={e => setNewSchoolSlug(e.target.value)}
                placeholder="nairobi-academy"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Country</label>
              <input
                type="text"
                value={newSchoolCountry}
                onChange={e => setNewSchoolCountry(e.target.value)}
                placeholder="Kenya"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAddSchool}
              disabled={addingSchool || !newSchoolName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
            >
              {addingSchool ? 'Creating…' : 'Create School'}
            </button>
            <button
              onClick={() => setShowAddSchool(false)}
              className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Schools list ── */}
      {schools.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No schools registered yet</p>
          <p className="text-sm text-slate-400 mt-1">Use "Register School" above to add the first school.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schoolStats.map(school => {
            const isExpanded = expandedSchool === school.id;
            const isAddingAdmin = addingAdminForSchool === school.id;

            return (
              <div key={school.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

                {/* School header */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition"
                  onClick={() => setExpandedSchool(isExpanded ? null : school.id)}
                >
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{school.name}</p>
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{school.slug}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Globe className="w-3 h-3" />{school.country}
                      </span>
                      <span className="text-xs text-slate-400">
                        {school.adminCount} admin{school.adminCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-slate-400">
                        {school.teacherCount} teacher{school.teacherCount !== 1 ? 's' : ''}
                      </span>
                      {school.pendingCount > 0 && (
                        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          {school.pendingCount} pending approval
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteSchool(school.id, school.name); }}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                      title="Delete school"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-slate-100">

                    {/* ── Administrators section ── */}
                    <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                        Administrators ({school.adminCount})
                      </p>
                      <button
                        onClick={() => {
                          setAddingAdminForSchool(isAddingAdmin ? null : school.id);
                          setAdminName(''); setAdminEmail(''); setAdminPassword('');
                        }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Admin
                      </button>
                    </div>

                    {/* Add admin form */}
                    {isAddingAdmin && (
                      <div className="px-5 py-4 border-b border-slate-100 bg-blue-50/30">
                        <p className="text-xs font-bold text-slate-600 mb-3">
                          Create Admin Account for {school.name}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={adminName}
                            onChange={e => setAdminName(e.target.value)}
                            placeholder="Full name"
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="email"
                            value={adminEmail}
                            onChange={e => setAdminEmail(e.target.value)}
                            placeholder="admin@school.ac.ke"
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="password"
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            placeholder="Password (min 6 chars)"
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex gap-3 mt-3">
                          <button
                            onClick={() => handleCreateAdmin(school.id, school.name)}
                            disabled={creatingAdmin}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                          >
                            {creatingAdmin ? 'Creating…' : 'Create Admin'}
                          </button>
                          <button
                            onClick={() => setAddingAdminForSchool(null)}
                            className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Admin rows */}
                    {school.admins.length === 0 ? (
                      <div className="px-5 py-4 text-sm text-slate-400 italic">No admin accounts yet for this school.</div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {school.admins.map(admin => (
                          <div key={admin.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
                            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-blue-700">{admin.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="flex-1 text-sm font-medium text-slate-900 min-w-32">{admin.name}</span>
                            <ApprovalBadge status={admin.approval_status} />

                            {admin.approval_status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApproval(admin.id, 'approved')}
                                  className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />Approve
                                </button>
                                <button
                                  onClick={() => handleApproval(admin.id, 'rejected')}
                                  className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-xl transition"
                                >
                                  <UserX className="w-3.5 h-3.5" />Reject
                                </button>
                              </>
                            )}

                            {admin.approval_status === 'rejected' && (
                              <button
                                onClick={() => handleApproval(admin.id, 'approved')}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition"
                              >
                                Re-approve
                              </button>
                            )}

                            <button
                              onClick={() => handleDemoteToTeacher(admin.id)}
                              className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-100 px-2.5 py-1.5 rounded-xl transition"
                              title="Demote to teacher"
                            >
                              Demote
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Teachers section (count only — no student data) ── */}
                    <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                        Teachers ({school.teacherCount})
                      </p>
                    </div>

                    {school.teachers.length === 0 ? (
                      <div className="px-5 py-4 text-sm text-slate-400 italic">No teacher accounts yet.</div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {school.teachers.map(t => (
                          <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-slate-500">{t.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="flex-1 text-sm text-slate-700">{t.name}</span>
                            <button
                              onClick={() => handlePromoteToAdmin(t.id)}
                              className="text-xs font-semibold text-blue-500 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded-xl transition"
                              title="Promote to school admin"
                            >
                              Make Admin
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Scope notice */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Superadmin scope</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          This panel manages schools and account access only. Student records, scores, classes,
          and learning area data are managed by each school's own admin and teachers within their
          isolated school environment.
        </p>
      </div>
    </div>
  );
}
